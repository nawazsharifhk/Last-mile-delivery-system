from __future__ import annotations

import json
from pathlib import Path
from queue import Empty, Queue
from threading import Lock
from threading import Thread

from geopy.geocoders import Nominatim

from src.geo.cache import AREA_COORD_CACHE
from src.settings import get_city_geo_profile
from src.settings import get_yaml_config


_GEOCODE_CACHE_PATH = Path("data/processed/geocode_cache.json")
_GEOCODER = Nominatim(user_agent="deliveryai-geocoder", timeout=2)
_CACHE_LOCK = Lock()
_RUNTIME_CACHE: dict[str, tuple[float, float]] = {}
_BOOTSTRAPPED = False
_ENRICH_QUEUE: Queue[tuple[str, str, str, str]] = Queue(maxsize=2048)
_ENRICH_WORKER_STARTED = False


def _normalize_locality(value: str) -> str:
    text = str(value or "").strip().lower()
    typo_alias = {
        "konamakunte": "konanakunte",
        "konamakunte cross": "konanakunte cross",
    }
    return typo_alias.get(text, text)


def _cache_key(area: str, city: str, pincode: str) -> str:
    return f"{_normalize_locality(area)}|{str(city or '').strip().lower()}|{str(pincode or '').strip()}"


def _bootstrap_runtime_cache() -> None:
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return

    _GEOCODE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if _GEOCODE_CACHE_PATH.exists():
        try:
            payload = json.loads(_GEOCODE_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                for key, value in payload.items():
                    if isinstance(value, list) and len(value) >= 2:
                        _RUNTIME_CACHE[str(key)] = (float(value[0]), float(value[1]))
        except Exception:
            # Corrupt cache should never block request flow.
            pass
    _BOOTSTRAPPED = True


def _save_runtime_cache() -> None:
    serializable = {key: [value[0], value[1]] for key, value in _RUNTIME_CACHE.items()}
    _GEOCODE_CACHE_PATH.write_text(json.dumps(serializable, indent=2), encoding="utf-8")


def _start_enrichment_worker() -> None:
    global _ENRICH_WORKER_STARTED
    if _ENRICH_WORKER_STARTED:
        return

    def _worker() -> None:
        while True:
            try:
                area, city, raw_address, pincode = _ENRICH_QUEUE.get(timeout=1.0)
            except Empty:
                continue
            try:
                geocode_address(area, city, raw_address=raw_address, pincode=pincode)
            except Exception:
                pass
            finally:
                _ENRICH_QUEUE.task_done()

    thread = Thread(target=_worker, name="geocode-enrichment-worker", daemon=True)
    thread.start()
    _ENRICH_WORKER_STARTED = True


def _query_external_geocoder(raw_address: str, area: str, city: str, pincode: str) -> tuple[float, float, float] | None:
    locality = _normalize_locality(area)
    city_name = str(city or "").strip()
    pin = str(pincode or "").strip()
    raw = str(raw_address or "").strip()

    candidates: list[tuple[str, float]] = []
    if raw:
        candidates.append((f"{raw}, {city_name}, India", 0.8))
    if locality and pin:
        candidates.append((f"{locality}, {pin}, {city_name}, India", 0.84))
    if locality:
        candidates.append((f"{locality}, {city_name}, India", 0.82))
    if pin:
        candidates.append((f"{pin}, {city_name}, India", 0.7))

    for query, confidence in candidates:
        try:
            location = _GEOCODER.geocode(query)
            if location is not None:
                return float(location.latitude), float(location.longitude), confidence
        except Exception:
            continue
    return None


def geocode_address(area: str, city: str, raw_address: str = "", pincode: str = "") -> tuple[float, float, float]:
    _start_enrichment_worker()
    _bootstrap_runtime_cache()
    locality = _normalize_locality(area)
    # Fast deterministic cache for known localities.
    if locality in AREA_COORD_CACHE:
        lat, lon = AREA_COORD_CACHE[locality]
        return lat, lon, 0.88

    key = _cache_key(locality, city, pincode)
    with _CACHE_LOCK:
        if key in _RUNTIME_CACHE:
            lat, lon = _RUNTIME_CACHE[key]
            return lat, lon, 0.84

    external = _query_external_geocoder(raw_address, locality, city, pincode)
    if external is not None:
        lat, lon, conf = external
        with _CACHE_LOCK:
            _RUNTIME_CACHE[key] = (lat, lon)
            _save_runtime_cache()
        return lat, lon, conf

    profile = get_city_geo_profile(city)
    centroid = profile.get("centroid", {}) if isinstance(profile, dict) else {}
    lat = float(centroid.get("lat", 12.9716))
    lon = float(centroid.get("lon", 77.5946))
    return lat, lon, 0.2


def enqueue_geocode_enrichment(area: str, city: str, raw_address: str = "", pincode: str = "") -> bool:
    cfg = get_yaml_config()
    geocode_cfg = cfg.get("geocode", {}) if isinstance(cfg, dict) else {}
    if isinstance(geocode_cfg, dict) and not bool(geocode_cfg.get("enable_async_enrichment", True)):
        return False

    _start_enrichment_worker()
    locality = _normalize_locality(area)
    key = _cache_key(locality, city, pincode)
    _bootstrap_runtime_cache()
    with _CACHE_LOCK:
        if key in _RUNTIME_CACHE:
            return False
    try:
        _ENRICH_QUEUE.put_nowait((locality, city, raw_address, pincode))
        return True
    except Exception:
        return False


def geocode_enrichment_stats() -> dict:
    return {
        "queue_size": int(_ENRICH_QUEUE.qsize()),
        "worker_started": bool(_ENRICH_WORKER_STARTED),
        "runtime_cache_entries": int(len(_RUNTIME_CACHE)),
    }


def warmup_geocode_cache(entries: list[dict], limit: int = 500) -> dict:
    _start_enrichment_worker()
    _bootstrap_runtime_cache()
    warmed = 0
    skipped = 0
    for row in entries[: max(0, int(limit))]:
        area = str(row.get("area") or "").strip()
        city = str(row.get("city") or "Bengaluru").strip()
        pincode = str(row.get("pincode") or "").strip()
        raw_address = str(row.get("address_raw") or "").strip()
        if not area and raw_address:
            area = raw_address

        key = _cache_key(area, city, pincode)
        with _CACHE_LOCK:
            if key in _RUNTIME_CACHE:
                skipped += 1
                continue
        geocode_address(area, city, raw_address=raw_address, pincode=pincode)
        warmed += 1

    return {
        "requested": min(len(entries), max(0, int(limit))),
        "warmed": warmed,
        "skipped": skipped,
        "cache_entries": len(_RUNTIME_CACHE),
    }
