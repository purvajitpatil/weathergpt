"""
WeatherGPT Rain Risk Classifier — Training Pipeline
XGBoost/LightGBM classifier trained on weather features to predict rain probability.
"""

import json
import os
import warnings
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score,
    average_precision_score, brier_score_loss, classification_report
)

warnings.filterwarnings("ignore")

# ─── Configuration ───────────────────────────────────────────────────────────

FEATURE_COLS = [
    "temp_celsius", "feels_like_celsius", "humidity_percent",
    "wind_speed_kmh", "pressure_hpa", "cloud_cover_percent",
    "visibility_km", "dew_point_celsius", "uv_index",
    "hour_of_day", "day_of_week", "month",
    "lat", "lon"
]

TARGET_COL = "will_rain"  # Binary: 1 = rain in next 6h, 0 = no rain
MODEL_DIR = Path(__file__).parent / "models"
DATA_DIR = Path(__file__).parent / "data"


def generate_synthetic_data(n_samples: int = 5000) -> pd.DataFrame:
    """Generate synthetic weather training data for demo purposes."""
    rng = np.random.default_rng(42)

    data = {
        "temp_celsius": rng.uniform(10, 42, n_samples),
        "humidity_percent": rng.uniform(20, 98, n_samples),
        "wind_speed_kmh": rng.uniform(0, 60, n_samples),
        "pressure_hpa": rng.uniform(990, 1025, n_samples),
        "cloud_cover_percent": rng.uniform(0, 100, n_samples),
        "visibility_km": rng.uniform(0.5, 20, n_samples),
        "uv_index": rng.uniform(0, 11, n_samples),
        "hour_of_day": rng.integers(0, 24, n_samples),
        "day_of_week": rng.integers(0, 7, n_samples),
        "month": rng.integers(1, 13, n_samples),
        "lat": rng.uniform(8, 35, n_samples),
        "lon": rng.uniform(68, 97, n_samples),
    }

    df = pd.DataFrame(data)
    df["feels_like_celsius"] = df["temp_celsius"] + rng.uniform(-4, 6, n_samples)
    df["dew_point_celsius"] = df["temp_celsius"] - rng.uniform(2, 20, n_samples)

    # Synthetic rain probability based on meteorological heuristics
    rain_score = (
        0.35 * (df["humidity_percent"] / 100) +
        0.25 * (df["cloud_cover_percent"] / 100) +
        0.15 * ((1020 - df["pressure_hpa"]) / 30).clip(0, 1) +
        0.10 * (df["wind_speed_kmh"] / 60) +
        0.10 * ((30 - df["visibility_km"]) / 30).clip(0, 1) +
        0.05 * rng.uniform(0, 1, n_samples)
    )

    df[TARGET_COL] = (rain_score > 0.45).astype(int)
    return df


def load_data() -> pd.DataFrame:
    """Load training data from CSV or generate synthetic data."""
    csv_path = DATA_DIR / "sample_weather.csv"
    if csv_path.exists():
        return pd.read_csv(csv_path)
    print("No training data found. Generating synthetic dataset...")
    df = generate_synthetic_data(5000)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(csv_path, index=False)
    print(f"Saved synthetic data to {csv_path}")
    return df


def train_model(df: pd.DataFrame) -> dict:
    """Train XGBoost classifier with time-based split."""
    import xgboost as xgb

    X = df[FEATURE_COLS].copy()
    y = df[TARGET_COL].values

    # Time-based split: last 20% for testing
    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        eval_metric="logloss",
        random_state=42,
        use_label_encoder=False
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False
    )

    # Evaluate
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "precision": round(precision_score(y_test, y_pred, zero_division=0), 4),
        "recall": round(recall_score(y_test, y_pred, zero_division=0), 4),
        "f1": round(f1_score(y_test, y_pred, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, y_prob), 4),
        "pr_auc": round(average_precision_score(y_test, y_prob), 4),
        "brier_score": round(brier_score_loss(y_test, y_prob), 4),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "positive_rate_train": round(float(y_train.mean()), 4),
        "positive_rate_test": round(float(y_test.mean()), 4),
    }

    print("\n─── Model Evaluation ───")
    for k, v in metrics.items():
        print(f"  {k}: {v}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["No Rain", "Rain"]))

    return {"model": model, "metrics": metrics, "feature_cols": FEATURE_COLS}


def save_model(model_obj: dict):
    """Save model and metadata to disk."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / "rain_risk_model.pkl"
    joblib.dump(model_obj["model"], model_path)

    meta = {
        "model_version": "xgb-rain-v1.2",
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "features": model_obj["feature_cols"],
        "metrics": model_obj["metrics"],
        "algorithm": "XGBClassifier",
    }
    meta_path = MODEL_DIR / "model_meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nModel saved to {model_path}")
    print(f"Metadata saved to {meta_path}")


def main():
    print("WeatherGPT Rain Risk Classifier — Training Pipeline")
    print("=" * 55)
    df = load_data()
    print(f"Dataset: {len(df)} samples, {df[TARGET_COL].mean():.1%} positive rate")
    result = train_model(df)
    save_model(result)
    print("\nTraining complete.")


if __name__ == "__main__":
    main()
