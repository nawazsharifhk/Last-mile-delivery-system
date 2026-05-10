from __future__ import annotations

import joblib
import numpy as np
import pandas as pd

from src.ml.features import FEATURE_CATEGORICAL, FEATURE_NUMERIC, build_inference_feature_frame


DEFAULT_QUANTILE = 0.12
DEFAULT_ALPHA = 0.1


def _safe_quantile(values: np.ndarray, q: float) -> float:
    if values.size == 0:
        return DEFAULT_QUANTILE
    try:
        return float(np.quantile(values, q, method="higher"))
    except TypeError:
        return float(np.quantile(values, q, interpolation="higher"))


def calibration_summary(model_path: str, calibration_path: str, alpha: float = DEFAULT_ALPHA) -> dict:
    alpha = float(min(max(alpha, 0.01), 0.3))

    try:
        model = joblib.load(model_path)
        frame = pd.read_csv(calibration_path)
    except Exception:
        return {
            "alpha": alpha,
            "quantile_abs_error": DEFAULT_QUANTILE,
            "sample_size": 0,
            "source": "fallback",
        }

    if "label_failed" not in frame.columns:
        return {
            "alpha": alpha,
            "quantile_abs_error": DEFAULT_QUANTILE,
            "sample_size": 0,
            "source": "fallback_no_label",
        }

    enriched = build_inference_feature_frame(frame)
    for col in FEATURE_NUMERIC + FEATURE_CATEGORICAL:
        if col not in enriched.columns:
            enriched[col] = 0.0 if col in FEATURE_NUMERIC else "unknown"

    y_true = frame["label_failed"].astype(float).to_numpy()
    probs = model.predict_proba(enriched[FEATURE_NUMERIC + FEATURE_CATEGORICAL])[:, 1]
    nonconformity = np.abs(y_true - probs)
    q_hat = _safe_quantile(nonconformity, 1.0 - alpha)

    return {
        "alpha": alpha,
        "quantile_abs_error": round(float(q_hat), 4),
        "sample_size": int(nonconformity.size),
        "source": "orders_clean",
    }


def conformal_band(probability: float, quantile_abs_error: float) -> tuple[float, float]:
    p = float(min(max(probability, 0.0), 1.0))
    q = float(min(max(quantile_abs_error, 0.01), 0.5))
    return round(max(0.0, p - q), 4), round(min(1.0, p + q), 4)


def annotate_probabilities_with_uncertainty(
    records: list[dict],
    model_path: str = "models/failure_model.pkl",
    calibration_path: str = "data/processed/orders_clean.csv",
    alpha: float = DEFAULT_ALPHA,
) -> dict:
    summary = calibration_summary(model_path, calibration_path, alpha)
    q_hat = float(summary["quantile_abs_error"])

    enriched: list[dict] = []
    for row in records:
        p = float(row.get("failure_probability", 0.0))
        low, high = conformal_band(p, q_hat)
        width = high - low
        uncertainty = "low" if width <= 0.18 else "medium" if width <= 0.28 else "high"

        new_row = dict(row)
        new_row["risk_band"] = {
            "lower": low,
            "upper": high,
            "alpha": float(summary["alpha"]),
            "width": round(width, 4),
            "uncertainty_level": uncertainty,
        }
        enriched.append(new_row)

    return {
        "calibration": summary,
        "records": enriched,
    }
