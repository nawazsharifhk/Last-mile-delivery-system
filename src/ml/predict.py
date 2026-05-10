from __future__ import annotations

import joblib
import pandas as pd

from src.ml.features import FEATURE_CATEGORICAL, FEATURE_NUMERIC, build_inference_feature_frame


def risk_label(probability: float) -> str:
    if probability >= 0.60:
        return "HIGH"
    if probability >= 0.40:
        return "MEDIUM"
    return "LOW"


def predict_failure(payload_df: pd.DataFrame, model_path: str, features_ready: bool = False) -> pd.DataFrame:
    model = joblib.load(model_path)
    model_input = payload_df.copy() if features_ready else build_inference_feature_frame(payload_df)
    for col in FEATURE_NUMERIC + FEATURE_CATEGORICAL:
        if col not in model_input.columns:
            if col in FEATURE_NUMERIC:
                model_input[col] = 0.0
            else:
                model_input[col] = "unknown"
    probs = model.predict_proba(model_input[FEATURE_NUMERIC + FEATURE_CATEGORICAL])[:, 1]
    out_df = payload_df.copy()
    out_df["failure_probability"] = probs.round(4)
    out_df["risk_label"] = out_df["failure_probability"].map(risk_label)
    return out_df
