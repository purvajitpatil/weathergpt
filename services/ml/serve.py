"""
WeatherGPT ML — Serving Contract

FastAPI inference server with:
  - /predict — single district prediction
  - /predict_batch — batch predictions for precompute worker
  - /health — model health + version
  - is_extrapolation detection
  - Calibrated probabilities
  - Model card metadata
"""

import json
import os
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_DIR = Path(__file__).parent / "models" / "risk_rain_v1"

app = FastAPI(title="WeatherGPT ML Inference", version="2.0.0")

# CORS
ALLOWED_ORIGINS = [
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

# ─── Load Models ─────────────────────────────────────────────────────────────

MODELS = {}
CALIBRATORS = {}
CARD = None


def load_models():
    global MODELS, CALIBRATORS, CARD

    card_path = MODEL_DIR / "card.json"
    if card_path.exists():
        with open(card_path) as f:
            CARD = json.load(f)

    for target in ["target_rain", "target_heavy", "target_heat"]:
        model_path = MODEL_DIR / f"model_{target}.joblib"
        cal_path = MODEL_DIR / f"calibrator_{target}.joblib"
        if model_path.exists():
            MODELS[target] = joblib.load(model_path)
            CALIBRATORS[target] = joblib.load(cal_path)

    print(f"Loaded {len(MODELS)} models: {list(MODELS.keys())}")


@app.on_event("startup")
async def startup():
    load_models()


# ─── Request/Response Models ─────────────────────────────────────────────────

class PredictRequest(BaseModel):
    district_id: int = Field(..., description="IMD district ID")
    features: dict = Field(..., description="Feature values keyed by feature name")

class PredictResponse(BaseModel):
    district_id: int
    probabilities: dict  # target -> probability
    bands: dict  # target -> risk band
    display_pcts: dict  # target -> rounded percentage
    model_version: str
    trained_until: str
    is_extrapolation: bool
    extrapolation_warnings: list

class BatchPredictRequest(BaseModel):
    requests: list[PredictRequest]

class BatchPredictResponse(BaseModel):
    results: list[PredictResponse]


# ─── Extrapolation Detection ────────────────────────────────────────────────

def check_extrapolation(features: dict) -> tuple[bool, list]:
    """Check if features fall outside training distribution."""
    if not CARD or "feature_ranges" not in CARD:
        return False, []

    warnings = []
    is_extrapolation = False

    for feat, (lo, hi) in CARD["feature_ranges"].items():
        val = features.get(feat)
        if val is not None:
            if val < lo * 1.5 or val > hi * 1.5:  # 50% margin
                warnings.append(f"{feat}={val:.2f} outside training range [{lo:.2f}, {hi:.2f}]")
                is_extrapolation = True

    return is_extrapolation, warnings


# ─── Risk Band ───────────────────────────────────────────────────────────────

def risk_band(probability: float) -> str:
    """Map probability to risk band."""
    if probability >= 0.80:
        return "severe"
    elif probability >= 0.60:
        return "high"
    elif probability >= 0.35:
        return "moderate"
    else:
        return "low"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "ok": True,
        "model_version": CARD.get("version", "unknown") if CARD else "unknown",
        "models_loaded": list(MODELS.keys()),
        "n_features": len(CARD.get("feature_order", [])) if CARD else 0,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if not MODELS:
        raise HTTPException(status_code=503, detail="Models not loaded")

    if not CARD:
        raise HTTPException(status_code=503, detail="Model card not found")

    feature_order = CARD.get("feature_order", [])
    missing = [f for f in feature_order if f not in req.features]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing features: {missing}"
        )

    x = np.array([[req.features[f] for f in feature_order]])

    probabilities = {}
    bands = {}
    display_pcts = {}

    for target, model in MODELS.items():
        calibrator = CALIBRATORS.get(target)
        raw_prob = float(model.predict_proba(x)[:, 1][0])

        if calibrator:
            prob = float(calibrator.transform([raw_prob])[0])
        else:
            prob = raw_prob

        prob = max(0.0, min(1.0, prob))
        probabilities[target] = round(prob, 3)
        bands[target] = risk_band(prob)
        display_pcts[target] = int(round(prob * 100 / 5) * 5)  # nearest 5%

    is_extrapolation, warnings = check_extrapolation(req.features)

    return PredictResponse(
        district_id=req.district_id,
        probabilities=probabilities,
        bands=bands,
        display_pcts=display_pcts,
        model_version=CARD.get("version", "unknown"),
        trained_until=CARD.get("trained_until", "unknown"),
        is_extrapolation=is_extrapolation,
        extrapolation_warnings=warnings,
    )


@app.post("/predict_batch", response_model=BatchPredictResponse)
def predict_batch(req: BatchPredictRequest):
    results = []
    for r in req.requests:
        try:
            result = predict(r)
            results.append(result)
        except HTTPException:
            results.append(PredictResponse(
                district_id=r.district_id,
                probabilities={},
                bands={},
                display_pcts={},
                model_version=CARD.get("version", "unknown") if CARD else "unknown",
                trained_until="unknown",
                is_extrapolation=True,
                extrapolation_warnings=["Prediction failed"],
            ))

    return BatchPredictResponse(results=results)


@app.get("/model_card")
def model_card():
    if not CARD:
        raise HTTPException(status_code=404, detail="Model card not found")
    return CARD


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
