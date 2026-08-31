"""
WeatherGPT ML Inference Server
FastAPI wrapper for the trained rain risk prediction model.

NOTE: This model is trained on SYNTHETIC data for demonstration purposes.
The calibrated_probability is a model output, NOT an empirically calibrated
meteorological probability. It should be labeled as "model estimate" in
user-facing contexts.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_DIR = Path(__file__).parent / "models"

app = FastAPI(title="WeatherGPT ML Inference", version="1.2.0")

# CORS: production origins from env, dev defaults for local development
_env_origins = os.environ.get("CORS_ORIGINS", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in _env_origins.split(",") if origin.strip()
] if _env_origins else [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

# Simple API key auth for production
ML_API_KEY = os.environ.get("ML_API_KEY", "")

# Load model at startup
model = None
model_meta = {}


def load_model():
    global model, model_meta
    model_path = MODEL_DIR / "rain_risk_model.pkl"
    meta_path = MODEL_DIR / "model_meta.json"

    if not model_path.exists():
        raise RuntimeError(f"Model not found at {model_path}. Run train.py first.")

    model = joblib.load(model_path)
    if meta_path.exists():
        with open(meta_path) as f:
            model_meta = json.load(f)
    print(f"Model loaded: {model_meta.get('model_version', 'unknown')}")


@app.on_event("startup")
async def startup():
    load_model()



class PredictRequest(BaseModel):
    location: str = Field(..., description="City and state, e.g. 'Pune, Maharashtra'")
    temp_celsius: float = Field(..., ge=-10, le=55)
    humidity_percent: float = Field(..., ge=0, le=100)
    wind_speed_kmh: float = Field(..., ge=0, le=200)
    pressure_hpa: float = Field(1013.0, ge=950, le=1050)
    cloud_cover_percent: float = Field(50, ge=0, le=100)
    visibility_km: float = Field(10.0, ge=0, le=50)
    dew_point_celsius: Optional[float] = None
    uv_index: float = Field(5.0, ge=0, le=12)
    lat: float = Field(18.5)
    lon: float = Field(73.8)


class PredictResponse(BaseModel):
    location: str
    rain_risk_score: int
    calibrated_probability: float = Field(
        ...,
        description="Model-estimated rain probability (0..1). NOTE: trained on synthetic data, not empirically calibrated."
    )
    risk_level: str
    model_version: str
    data_source_note: str = Field(
        default="Synthetic training data — not real meteorological observations",
        description="Honest label about training data origin"
    )
    contributing_factors: list
    predicted_at: str


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_version": model_meta.get("model_version", "unknown"),
        "training_data": "synthetic",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/risk/predict", response_model=PredictResponse)
async def predict_risk(req: PredictRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    now = datetime.now(timezone.utc)
    hour_of_day = now.hour
    day_of_week = now.weekday()
    month = now.month

    dew_point = req.dew_point_celsius if req.dew_point_celsius is not None else req.temp_celsius - 10

    features = np.array([[
        req.temp_celsius,
        req.temp_celsius,  # feels_like approximation
        req.humidity_percent,
        req.wind_speed_kmh,
        req.pressure_hpa,
        req.cloud_cover_percent,
        req.visibility_km,
        dew_point,
        req.uv_index,
        hour_of_day,
        day_of_week,
        month,
        req.lat,
        req.lon
    ]])

    try:
        risk_prob = float(model.predict_proba(features)[0][1])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    risk_score_100 = min(100, max(0, int(risk_prob * 100)))
    risk_level = "high" if risk_score_100 >= 70 else "moderate" if risk_score_100 >= 40 else "low"

    importances = model.feature_importances_ if hasattr(model, "feature_importances_") else []
    feature_names = [
        "temperature", "feels_like", "humidity", "wind_speed",
        "pressure", "cloud_cover", "visibility", "dew_point",
        "uv_index", "hour_of_day", "day_of_week", "month", "latitude", "longitude"
    ]
    factors = []
    for i, (name, imp) in enumerate(zip(feature_names, importances)):
        factors.append({
            "name": name,
            "value": float(features[0][i]),
            "weight": round(float(imp), 4)
        })
    factors.sort(key=lambda x: x["weight"], reverse=True)

    return PredictResponse(
        location=req.location,
        rain_risk_score=risk_score_100,
        calibrated_probability=round(risk_prob, 4),
        risk_level=risk_level,
        model_version=model_meta.get("model_version", "xgb-rain-v1.2"),
        data_source_note="Synthetic training data — not real meteorological observations",
        contributing_factors=factors[:5],
        predicted_at=now.isoformat()
    )
