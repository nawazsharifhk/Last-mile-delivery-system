from __future__ import annotations

import pandas as pd


def calculate_failure_rate(df: pd.DataFrame, status_col: str = "delivery_status") -> float:
    if status_col not in df.columns or df.empty:
        return 0.0
    return float((df[status_col] == "failed").mean())


def relative_improvement(before: float, after: float) -> float:
    if before <= 0:
        return 0.0
    return float(max(0.0, (before - after) / before))


def absolute_rate_improvement(before: float, after: float) -> float:
    return float(max(0.0, before - after))


def estimate_before_failure_rate(records_df: pd.DataFrame) -> float:
    if records_df.empty:
        return 0.0

    # Prefer the model risk already computed for each order as the baseline.
    if "failure_probability" in records_df.columns:
        probs = records_df["failure_probability"].astype(float).clip(lower=0.0, upper=1.0)
        return float(probs.mean())

    raw_risk = (
        0.05
        + 0.42 * records_df["area_risk_score"].astype(float)
        + 0.22 * (1.0 - records_df["address_confidence"].astype(float))
        + 0.18 * (1.0 - records_df["geo_confidence"].astype(float))
        + 0.04 * records_df["past_failures"].astype(float)
    )
    return float(raw_risk.clip(lower=0.03, upper=0.9).mean())


def estimate_after_failure_rate(records_df: pd.DataFrame) -> float:
    if records_df.empty:
        return 0.0

    # If counterfactual simulation exists, use its expected best-action risk.
    if "counterfactual" in records_df.columns:
        expected: list[float] = []
        for item in records_df["counterfactual"].tolist():
            if isinstance(item, dict) and "expected_risk" in item:
                try:
                    expected.append(float(item["expected_risk"]))
                except (TypeError, ValueError):
                    continue
        if expected:
            return float(pd.Series(expected).clip(lower=0.0, upper=1.0).mean())

    adjusted = records_df["failure_probability"].astype(float).copy()
    high_mask = adjusted >= 0.6
    medium_mask = (adjusted >= 0.4) & (adjusted < 0.6)

    adjusted.loc[high_mask] = (adjusted.loc[high_mask] * 0.5).clip(lower=0.0)
    adjusted.loc[medium_mask] = (adjusted.loc[medium_mask] * 0.75).clip(lower=0.0)
    return float(adjusted.mean())


def summarize_business_impact(records_df: pd.DataFrame, route_distance_km: float, naive_distance_km: float) -> dict:
    before = estimate_before_failure_rate(records_df)
    after = estimate_after_failure_rate(records_df)
    route_improvement = relative_improvement(naive_distance_km, route_distance_km)
    fail_improvement = absolute_rate_improvement(before, after)

    return {
        "failure_rate_before": round(before, 4),
        "failure_rate_after": round(after, 4),
        "failure_rate_improvement": round(fail_improvement, 4),
        "route_distance_before_km": round(float(naive_distance_km), 2),
        "route_distance_after_km": round(float(route_distance_km), 2),
        "route_distance_improvement": round(route_improvement, 4),
        "high_risk_orders": int((records_df["failure_probability"].astype(float) >= 0.6).sum()),
    }
