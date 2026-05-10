from __future__ import annotations

from pathlib import Path
import pandas as pd

from src.address.confidence import address_confidence
from src.address.parser import parse_address
from src.counterfactual.simulator import simulate_interventions
from src.geo.geocoder import geocode_address
from src.geo.geocoder import enqueue_geocode_enrichment
from src.geo.validator import validate_geo
from src.metrics.evaluator import summarize_business_impact
from src.ml.explain import top_reasons
from src.ml.features import FEATURE_CATEGORICAL, FEATURE_NUMERIC, build_inference_feature_frame
from src.ml.predict import predict_failure
from src.place_graph.matcher import match_place
from src.place_graph.recommender import recommend_action as place_recommend_action
from src.recommendation.action_engine import recommend_action
from src.routing.alternatives import build_route_alternatives
from src.routing.graph_builder import build_distance_matrix
from src.routing.traffic import traffic_signal
from src.settings import get_yaml_config
from src.simulation.impact import simulate_improvement
from src.utils.datetime_utils import date_only
from src.weather.provider import load_weather_table, weather_signal_for
from src.weather.risk import weather_risk_adjustment


def _naive_route_distance_km(nodes: list[dict]) -> float:
    if len(nodes) <= 1:
        return 0.0
    matrix = build_distance_matrix(nodes)
    total = 0.0
    for idx in range(len(nodes) - 1):
        total += matrix[(idx, idx + 1)]
    return round(total, 2)


def process_orders(orders: list[dict], model_path: str, place_graph_payload: dict) -> dict:
    config = get_yaml_config()
    weather_cfg = config.get("weather", {}) if isinstance(config, dict) else {}
    live_weather_enabled = bool(weather_cfg.get("enable_live", False)) if isinstance(weather_cfg, dict) else False

    records: list[dict] = []
    route_nodes = [{"order_id": "WAREHOUSE", "lat": 12.9716, "lon": 77.5946}]

    for order in orders:
        parsed = parse_address(order["address_raw"], order.get("pincode", ""))
        addr_conf = address_confidence(parsed)
        lat, lon, geo_base_conf = geocode_address(
            parsed.area,
            order.get("city", "Bengaluru"),
            raw_address=order.get("address_raw", ""),
            pincode=parsed.pincode,
        )
        geo_valid = validate_geo(lat, lon, geo_base_conf, parsed.pincode, order.get("city", "Bengaluru"))
        if geo_valid.geo_confidence < 0.65:
            enqueue_geocode_enrichment(
                parsed.area,
                order.get("city", "Bengaluru"),
                raw_address=order.get("address_raw", ""),
                pincode=parsed.pincode,
            )

        row = {
            "order_id": order["order_id"],
            "order_datetime": order.get("order_datetime", "2026-03-10 12:00:00"),
            "city": order.get("city", "Bengaluru"),
            "time_slot": order.get("time_slot", "afternoon"),
            "past_failures": float(order.get("past_failures", 0)),
            "distance_km": float(order.get("distance_km", 0)),
            "address_confidence": addr_conf,
            "geo_confidence": geo_valid.geo_confidence,
            "area_risk_score": float(order.get("area_risk_score", 0.25)),
            "latitude": lat,
            "longitude": lon,
            "clean_text": parsed.clean_text,
            "area": parsed.area,
            "landmark": parsed.landmark,
            "parsed_pincode": parsed.pincode,
            "geo_warnings": geo_valid.warnings,
        }
        records.append(row)
        route_nodes.append({"order_id": order["order_id"], "lat": lat, "lon": lon})

    features_df = pd.DataFrame(records)[
        [
            "order_datetime",
            "address_confidence",
            "geo_confidence",
            "past_failures",
            "distance_km",
            "area_risk_score",
            "time_slot",
            "city",
            "area",
        ]
    ]
    features_df = build_inference_feature_frame(features_df)
    model_feature_df = features_df[FEATURE_NUMERIC + FEATURE_CATEGORICAL]

    predicted_df = predict_failure(model_feature_df, model_path)

    weather_csv_path = "data/raw/weather_sample.csv"
    if not Path(weather_csv_path).exists():
        weather_df = pd.DataFrame()
    else:
        try:
            weather_df = load_weather_table(weather_csv_path)
        except Exception:
            weather_df = pd.DataFrame()
    
    predicted_df = predicted_df.reset_index(drop=True)
    for idx, row in predicted_df.iterrows():
        current = records[idx]
        d_key = date_only(orders[idx].get("order_datetime", "2026-03-10 09:00:00"))
        weather_signal = weather_signal_for(
            weather_df=weather_df,
            date=d_key,
            time_slot=current["time_slot"],
            city=current["city"],
            lat=float(current["latitude"]),
            lon=float(current["longitude"]),
            enable_live=live_weather_enabled,
        )
        w_score = float(weather_signal.get("weather_risk_score", 0.15))
        adjusted_prob = weather_risk_adjustment(float(row["failure_probability"]), w_score)
        current["failure_probability"] = adjusted_prob
        current["weather_signal"] = weather_signal
        current["risk_label"] = "HIGH" if adjusted_prob >= 0.6 else "MEDIUM" if adjusted_prob >= 0.4 else "LOW"
        current["reasons"] = top_reasons(current)

        matched_place_id = match_place(
            place_graph_payload.get("places", []), current["area"], current["latitude"], current["longitude"]
        )
        matched_place = None
        if matched_place_id:
            matched_place = next(
                (p for p in place_graph_payload.get("places", []) if p["place_id"] == matched_place_id),
                None,
            )
        place_action = place_recommend_action(matched_place, current["risk_label"])
        risk_action = recommend_action(adjusted_prob, current["address_confidence"])
        current["recommended_action"] = risk_action
        current["recommended_action_place_aware"] = place_action
        current["counterfactual"] = simulate_interventions(adjusted_prob, current["time_slot"])

    route_bundle = build_route_alternatives(route_nodes)
    route_result = route_bundle.get("active", {})
    route_order_ids = route_result.get("sequence_order_ids", [])
    route_polyline = route_result.get("polyline", [])

    eta = int(route_result.get("eta_minutes", 0))
    route_traffic = route_result.get("traffic_signal")
    if not isinstance(route_traffic, dict):
        route_traffic = traffic_signal(
            distance_km=float(route_result.get("distance_km", 0.0)),
            duration_min=float(route_result.get("duration_min", eta)),
        )

    records_df = pd.DataFrame(records)
    naive_distance = _naive_route_distance_km(route_nodes)
    impact_metrics = summarize_business_impact(records_df, float(route_result.get("distance_km", 0.0)), naive_distance)
    impact_simulation = simulate_improvement(records_df)

    return {
        "orders": records,
        "route": {
            "sequence_order_ids": route_order_ids,
            "distance_km": route_result.get("distance_km", 0.0),
            "naive_distance_km": naive_distance,
            "eta_minutes": eta,
            "duration_min": route_result.get("duration_min", eta),
            "stop_count": route_result.get("stop_count", max(0, len(route_order_ids) - 1)),
            "source": route_result.get("source", "unknown"),
            "traffic_signal": route_traffic,
            "polyline": route_polyline,
        },
        "route_options": route_bundle.get("routes", []),
        "route_selected_key": route_bundle.get("selected_key", "fastest"),
        "impact_metrics": impact_metrics,
        "impact_simulation": impact_simulation,
    }
