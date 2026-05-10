from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    app_name: str = "Smart Last-Mile Delivery System"
    env: str = "dev"
    host: str = "127.0.0.1"
    port: int = 8000
    model_path: str = "models/failure_model.pkl"
    preprocessor_path: str = "models/preprocessor.pkl"
    metadata_path: str = "models/metadata.json"
    enable_weather: bool = True
    enable_place_graph: bool = True
    enable_counterfactual: bool = True
    cors_origins: str = "http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:8001,http://localhost:8001"
    cors_allow_credentials: bool = False
    auth_required: bool = False
    api_key: str = "dev-local-key"
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


@lru_cache(maxsize=1)
def get_env_settings() -> AppSettings:
    return AppSettings()


@lru_cache(maxsize=1)
def get_yaml_config() -> dict:
    config_path = Path("configs/config.yaml")
    if not config_path.exists():
        return {}
    with config_path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def get_allowed_origins() -> list[str]:
    env_origins = [item.strip() for item in get_env_settings().cors_origins.split(",") if item.strip()]
    cfg = get_yaml_config()
    cfg_origins = cfg.get("api", {}).get("allowed_origins", [])
    if isinstance(cfg_origins, list):
        env_origins.extend(str(item).strip() for item in cfg_origins if str(item).strip())
    deduped: list[str] = []
    for origin in env_origins:
        if origin not in deduped:
            deduped.append(origin)
    return deduped or ["http://127.0.0.1:8000"]


def get_city_geo_profile(city: str) -> dict[str, Any]:
    cfg = get_yaml_config()
    geo = cfg.get("geo", {})
    profile = geo.get("cities", {}).get(city.lower(), {}) if isinstance(geo, dict) else {}
    if isinstance(profile, dict) and profile:
        return profile

    fallback_profile = {
        "bounds": {
            "lat_min": 12.7,
            "lat_max": 13.2,
            "lon_min": 77.3,
            "lon_max": 77.9,
        },
        "centroid": {
            "lat": 12.9716,
            "lon": 77.5946,
        },
    }
    return fallback_profile


def is_auth_required() -> bool:
    cfg = get_yaml_config()
    api_cfg = cfg.get("api", {}) if isinstance(cfg, dict) else {}
    if isinstance(api_cfg, dict) and "auth_required" in api_cfg:
        return bool(api_cfg.get("auth_required"))
    return bool(get_env_settings().auth_required)


def is_rate_limit_enabled() -> bool:
    cfg = get_yaml_config()
    api_cfg = cfg.get("api", {}) if isinstance(cfg, dict) else {}
    if isinstance(api_cfg, dict) and "rate_limit_enabled" in api_cfg:
        return bool(api_cfg.get("rate_limit_enabled"))
    return bool(get_env_settings().rate_limit_enabled)


# Export functions for API security
__all__ = [
    "get_env_settings",
    "get_yaml_config",
    "get_allowed_origins",
    "get_city_geo_profile",
    "is_auth_required",
    "is_rate_limit_enabled",
]
