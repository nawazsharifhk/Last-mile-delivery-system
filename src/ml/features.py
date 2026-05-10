from __future__ import annotations

import zlib
from datetime import datetime
import numpy as np
import pandas as pd

from src.address.confidence import address_confidence
from src.address.parser import parse_address
from src.geo.geocoder import geocode_address
from src.geo.geocoder import _normalize_locality
from src.geo.validator import validate_geo


FEATURE_NUMERIC = [
    "address_confidence",
    "geo_confidence",
    "past_failures",
    "distance_km",
    "area_risk_score",
    "hour_sin",
    "hour_cos",
    "is_weekend",
    "area_success_rate",
    "area_cluster",
]

FEATURE_CATEGORICAL = ["time_slot", "city", "distance_bucket"]


def _derive_time_and_area_features(work_df: pd.DataFrame) -> pd.DataFrame:
    dt = pd.to_datetime(work_df.get("order_datetime"), errors="coerce")
    hour = dt.dt.hour.fillna(12).astype(int)
    weekday = dt.dt.dayofweek.fillna(2).astype(int)

    radians = hour * (2 * np.pi / 24)
    work_df["hour_sin"] = np.sin(radians)
    work_df["hour_cos"] = np.cos(radians)
    work_df["is_weekend"] = (weekday >= 5).astype(int)

    work_df["area_success_rate"] = (1.0 - work_df["area_risk_score"]).clip(lower=0.1, upper=0.95)

    work_df["area_cluster"] = work_df["area"].fillna("unknown").map(
        lambda x: zlib.crc32(str(x).encode("utf-8")) % 6
    )
    work_df["distance_bucket"] = pd.cut(
        work_df["distance_km"].astype(float),
        bins=[-0.001, 3.0, 7.0, 12.0, 100.0],
        labels=["very_near", "near", "mid", "far"],
    ).astype(str)
    return work_df


def build_feature_frame(df: pd.DataFrame, area_risk_df: pd.DataFrame) -> pd.DataFrame:
    work_df = df.copy()

    if "delivery_status" not in work_df.columns:
        raise ValueError("Missing required 'delivery_status' column in training data")

    parsed = work_df.apply(
        lambda row: parse_address(str(row["address_raw"]), str(row.get("pincode", ""))),
        axis=1,
    )

    work_df["clean_text"] = parsed.map(lambda p: p.clean_text)
    work_df["area"] = parsed.map(lambda p: p.area)
    work_df["landmark"] = parsed.map(lambda p: p.landmark)
    work_df["parsed_pincode"] = parsed.map(lambda p: p.pincode)
    work_df["address_confidence"] = parsed.map(address_confidence)

    work_df["city"] = work_df["city"].astype(str)
    geo_keys = list(zip(work_df["area"].astype(str), work_df["city"], work_df["parsed_pincode"].astype(str)))
    unique_geo_keys = sorted(set(geo_keys))
    geo_lookup = {key: geocode_address(key[0], key[1], pincode=key[2]) for key in unique_geo_keys}
    geo_data = pd.Series([geo_lookup[key] for key in geo_keys], index=work_df.index)

    work_df["latitude"] = geo_data.map(lambda x: x[0])
    work_df["longitude"] = geo_data.map(lambda x: x[1])
    work_df["geo_base_confidence"] = geo_data.map(lambda x: x[2])

    validation_keys = [
        (
            float(work_df.at[idx, "latitude"]),
            float(work_df.at[idx, "longitude"]),
            float(work_df.at[idx, "geo_base_confidence"]),
            str(work_df.at[idx, "parsed_pincode"]),
            str(work_df.at[idx, "city"]),
        )
        for idx in work_df.index
    ]
    unique_validation_keys = sorted(set(validation_keys))
    validation_lookup = {
        key: validate_geo(key[0], key[1], key[2], key[3], key[4])
        for key in unique_validation_keys
    }
    validation = pd.Series([validation_lookup[key] for key in validation_keys], index=work_df.index)
    work_df["geo_confidence"] = validation.map(lambda r: r.geo_confidence)

    area_risk_df = area_risk_df.copy()
    area_risk_df["area"] = area_risk_df["area"].apply(lambda x: _normalize_locality(str(x)))
    work_df["area"] = work_df["area"].apply(lambda x: _normalize_locality(str(x)))
    work_df = work_df.merge(area_risk_df[["area", "area_risk_score"]], how="left", on="area")
    work_df["area_risk_score"] = work_df["area_risk_score"].fillna(0.25)

    work_df["is_evening_or_night"] = work_df["time_slot"].isin(["evening", "night"]).astype(int)
    work_df = _derive_time_and_area_features(work_df)
    work_df["label_failed"] = (work_df["delivery_status"] == "failed").astype(int)

    return work_df


def build_inference_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    work_df = df.copy()
    if "area" not in work_df.columns:
        work_df["area"] = "unknown"
    if "time_slot" not in work_df.columns:
        work_df["time_slot"] = "afternoon"
    if "city" not in work_df.columns:
        work_df["city"] = "Bengaluru"
    if "distance_km" not in work_df.columns:
        work_df["distance_km"] = 0.0
    if "area_risk_score" not in work_df.columns:
        work_df["area_risk_score"] = 0.25
    if "past_failures" not in work_df.columns:
        work_df["past_failures"] = 0
    if "order_datetime" not in work_df.columns:
        now = datetime.now().strftime("%Y-%m-%d 12:00:00")
        work_df["order_datetime"] = now

    work_df = _derive_time_and_area_features(work_df)
    return work_df
