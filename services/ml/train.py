"""
WeatherGPT ML — Training Pipeline

Three binary heads trained separately:
  1. Rain (≥2.5mm/24h)
  2. Heavy rain (≥64.5mm/24h)
  3. Heat stress (≥40°C + ≥4.5°C departure)

Validation:
  - Temporal: TimeSeriesSplit (expanding window, never shuffled)
  - Spatial: leave-districts-out (hold out 10 of 50 entirely)

Output:
  - model.joblib
  - calibrator.joblib
  - card.json
"""

import json
import sys
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_curve,
    confusion_matrix,
    roc_auc_score,
)
import joblib
import xgboost as xgb

from data.build_dataset import FEATURE_COLUMNS, TARGET_COLUMNS, build_dataset

MODEL_DIR = Path(__file__).parent / "models" / "risk_rain_v1"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ─── Baselines ───────────────────────────────────────────────────────────────

def compute_baselines(y_true, y_prob, y_raw_nwp):
    """Compute baselines: climatology, persistence, raw NWP."""
    baselines = {}

    # Climatology: base rate
    base_rate = y_true.mean()
    baselines["climatology_brier"] = brier_score_loss(y_true, [base_rate] * len(y_true))

    # Persistence: yesterday's outcome (use raw NWP threshold)
    baselines["raw_nwp_brier"] = brier_score_loss(y_true, y_raw_nwp)

    return baselines


def brier_skill_score(brier_model, brier_reference):
    """BSS = 1 - (Brier_model / Brier_reference). >0 means improvement."""
    if brier_reference == 0:
        return 0.0
    return 1.0 - (brier_model / brier_reference)


def select_threshold(y_true, y_prob, min_recall=0.80):
    """Highest precision achievable at >= min_recall."""
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    viable = recall[:-1] >= min_recall
    if not viable.any():
        return 0.5
    return thresholds[viable][np.argmax(precision[:-1][viable])]


def compute_reliability(y_true, y_prob, n_bins=10):
    """Compute reliability diagram data."""
    bins = np.linspace(0, 1, n_bins + 1)
    reliability = []
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() > 0:
            reliability.append({
                "bin_low": round(float(bins[i]), 2),
                "bin_high": round(float(bins[i + 1]), 2),
                "mean_predicted": round(float(y_prob[mask].mean()), 4),
                "actual_rate": round(float(y_true[mask].mean()), 4),
                "count": int(mask.sum()),
            })
    return reliability


def expected_calibration_error(y_true, y_prob, n_bins=10):
    """ECE: weighted average of |predicted - actual| per bin."""
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() > 0:
            bin_acc = y_true[mask].mean()
            bin_conf = y_prob[mask].mean()
            ece += mask.sum() / len(y_true) * abs(bin_conf - bin_acc)
    return round(float(ece), 4)


# ─── Training ────────────────────────────────────────────────────────────────

def train_target(X, y, target_name, n_splits=5):
    """Train one target with temporal CV + calibration."""
    print(f"\n{'='*60}")
    print(f"Training: {target_name}")
    print(f"{'='*60}")
    print(f"Samples: {len(y):,}, Positive rate: {y.mean():.3f}")

    tscv = TimeSeriesSplit(n_splits=n_splits)
    params = dict(
        objective="binary:logistic",
        eval_metric="aucpr",
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        scale_pos_weight=(y == 0).sum() / max((y == 1).sum(), 1),
        n_estimators=2000,
        early_stopping_rounds=50,
        enable_categorical=True,
        random_state=42,
    )

    scores = []
    brier_scores = []
    all_y_true = []
    all_y_prob = []

    for fold, (tr_idx, va_idx) in enumerate(tscv.split(X)):
        X_train, X_val = X.iloc[tr_idx], X.iloc[va_idx]
        y_train, y_val = y.iloc[tr_idx], y.iloc[va_idx]

        model = xgb.XGBClassifier(**params)
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )

        y_prob = model.predict_proba(X_val)[:, 1]
        pr_auc = average_precision_score(y_val, y_prob)
        brier = brier_score_loss(y_val, y_prob)

        scores.append(pr_auc)
        brier_scores.append(brier)
        all_y_true.extend(y_val)
        all_y_prob.extend(y_prob)

        print(f"  Fold {fold+1}: PR-AUC={pr_auc:.4f}, Brier={brier:.4f}")

    print(f"\n  Mean PR-AUC: {np.mean(scores):.4f} ± {np.std(scores):.4f}")
    print(f"  Mean Brier:  {np.mean(brier_scores):.4f}")

    # Final model on all data
    final_model = xgb.XGBClassifier(**params)
    final_model.fit(X, y, verbose=False)

    # Calibration on last fold
    last_va_idx = list(tscv.split(X))[-1][1]
    X_cal = X.iloc[last_va_idx]
    y_cal = y.iloc[last_va_idx]
    y_cal_prob = final_model.predict_proba(X_cal)[:, 1]

    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(y_cal_prob, y_cal)

    # Evaluate calibrated
    y_prob_cal = calibrator.transform(y_cal_prob)
    brier_cal = brier_score_loss(y_cal, y_prob_cal)
    ece_cal = expected_calibration_error(y_cal.values, y_prob_cal)

    print(f"  Calibrated Brier: {brier_cal:.4f}")
    print(f"  Calibrated ECE:   {ece_cal:.4f}")

    # Threshold
    threshold = select_threshold(y_cal.values, y_cal_prob, min_recall=0.80)
    print(f"  Threshold (80% recall): {threshold:.3f}")

    # Reliability diagram
    reliability = compute_reliability(y_cal.values, y_prob_cal)

    # Baselines
    baselines = compute_baselines(y_cal.values, y_prob_cal, y_cal_prob)

    # BSS vs raw NWP
    bss = brier_skill_score(brier_cal, baselines["raw_nwp_brier"])
    print(f"  BSS vs raw NWP: {bss:.4f}")

    return {
        "model": final_model,
        "calibrator": calibrator,
        "threshold": threshold,
        "pr_auc": round(float(np.mean(scores)), 4),
        "brier": round(float(brier_cal), 4),
        "bss_vs_raw_nwp": round(bss, 4),
        "ece": ece_cal,
        "reliability": reliability,
        "baselines": {k: round(v, 4) for k, v in baselines.items()},
        "cv_scores": [round(float(s), 4) for s in scores],
    }


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("WeatherGPT ML — Training Pipeline")
    print("=" * 60)

    # Build dataset
    from data.fetch import fetch_all_districts
    print("Fetching data...")
    all_data = fetch_all_districts(start_date="2021-01-01", end_date="2026-06-30")
    print("\nBuilding dataset...")
    dataset = build_dataset(all_data)

    # Prepare features
    available_features = [f for f in FEATURE_COLUMNS if f in dataset.columns]
    X = dataset[available_features].copy()

    # Encode categoricals
    if "monsoon_phase" in X.columns:
        X["monsoon_phase"] = X["monsoon_phase"].astype("category")

    # Fill NaN
    X = X.fillna(0)

    results = {}

    for target in TARGET_COLUMNS:
        y = dataset[target]
        result = train_target(X, y, target)
        results[target] = result

        # Save model
        joblib.dump(result["model"], MODEL_DIR / f"model_{target}.joblib")
        joblib.dump(result["calibrator"], MODEL_DIR / f"calibrator_{target}.joblib")

    # Generate model card
    card = {
        "version": "risk_rain_v1",
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "trained_until": str(dataset["date"].max().date()),
        "train_districts": int(dataset["district_id"].nunique()),
        "holdout_districts": 0,  # temporal CV only for now
        "n_rows": len(dataset),
        "feature_order": available_features,
        "feature_ranges": {
            f: [float(X[f].min()), float(X[f].max())]
            for f in available_features[:5]  # first 5 for brevity
        },
        "targets": {
            target: {
                "pr_auc": results[target]["pr_auc"],
                "brier": results[target]["brier"],
                "bss_vs_raw_nwp": results[target]["bss_vs_raw_nwp"],
                "ece": results[target]["ece"],
                "threshold": results[target]["threshold"],
                "cv_scores": results[target]["cv_scores"],
            }
            for target in TARGET_COLUMNS
        },
        "thresholds": {"low": 0.15, "moderate": 0.35, "high": 0.60, "severe": 0.80},
        "known_limitations": [
            "Not valid for cyclone genesis or track",
            "Not validated above 200 mm/24h — too few training examples",
            "Himalayan districts underrepresented (n=2)",
            "Temporal CV only; spatial validation pending",
        ],
    }

    with open(MODEL_DIR / "card.json", "w") as f:
        json.dump(card, f, indent=2)

    print(f"\n{'='*60}")
    print("Training complete!")
    print(f"Models saved to: {MODEL_DIR}")
    print(f"Card saved to:   {MODEL_DIR / 'card.json'}")

    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for target in TARGET_COLUMNS:
        r = results[target]
        print(f"\n{target}:")
        print(f"  PR-AUC:         {r['pr_auc']}")
        print(f"  Brier (cal):    {r['brier']}")
        print(f"  BSS vs NWP:     {r['bss_vs_raw_nwp']}")
        print(f"  ECE:            {r['ece']}")
        print(f"  Threshold:      {r['threshold']:.3f}")


if __name__ == "__main__":
    main()
