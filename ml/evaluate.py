"""
WeatherGPT Model Evaluation Script
Generates evaluation report with metrics, calibration, and feature importance.
"""

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score,
    average_precision_score, brier_score_loss, confusion_matrix,
    classification_report
)

MODEL_DIR = Path(__file__).parent / "models"
DATA_DIR = Path(__file__).parent / "data"
REPORT_DIR = Path(__file__).parent.parent / "docs"

# Minimum quality thresholds — fail if below
QUALITY_GATES = {
    "roc_auc": 0.65,
    "f1": 0.55,
    "brier_score_max": 0.25,
}


def load_model_and_data():
    model_path = MODEL_DIR / "rain_risk_model.pkl"
    meta_path = MODEL_DIR / "model_meta.json"

    if not model_path.exists():
        print("ERROR: Model not found. Run train.py first.")
        sys.exit(1)

    model = joblib.load(model_path)
    meta = {}
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)

    csv_path = DATA_DIR / "sample_weather.csv"
    if not csv_path.exists():
        print("ERROR: Training data not found.")
        sys.exit(1)

    df = pd.read_csv(csv_path)
    return model, meta, df


def evaluate(model, meta, df):
    feature_cols = meta.get("features", [])
    X = df[feature_cols]
    y = df["will_rain"].values

    split_idx = int(len(df) * 0.8)
    X_test = X.iloc[split_idx:]
    y_test = y[split_idx:]

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "precision": round(precision_score(y_test, y_pred, zero_division=0), 4),
        "recall": round(recall_score(y_test, y_pred, zero_division=0), 4),
        "f1": round(f1_score(y_test, y_pred, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_test, y_prob), 4),
        "pr_auc": round(average_precision_score(y_test, y_prob), 4),
        "brier_score": round(brier_score_loss(y_test, y_prob), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "test_samples": len(y_test),
    }

    # Feature importance
    importances = model.feature_importances_
    feature_importance = sorted(
        zip(feature_cols, importances),
        key=lambda x: x[1],
        reverse=True
    )

    # Calibration: bin predictions and compare mean predicted vs actual
    n_bins = 10
    bins = np.linspace(0, 1, n_bins + 1)
    calibration = []
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() > 0:
            calibration.append({
                "bin": f"{bins[i]:.1f}-{bins[i+1]:.1f}",
                "mean_predicted": round(float(y_prob[mask].mean()), 4),
                "actual_rate": round(float(y_test[mask].mean()), 4),
                "count": int(mask.sum())
            })

    # Quality gate check
    gates_passed = True
    gate_results = {}
    for metric, threshold in QUALITY_GATES.items():
        if metric == "brier_score_max":
            passed = metrics["brier_score"] <= threshold
        else:
            passed = metrics.get(metric, 0) >= threshold
        gate_results[metric] = {"threshold": threshold, "actual": metrics.get(metric), "passed": passed}
        if not passed:
            gates_passed = False

    return {
        "model_version": meta.get("model_version", "unknown"),
        "trained_at": meta.get("trained_at", "unknown"),
        "metrics": metrics,
        "feature_importance": [{"feature": f, "importance": round(float(i), 4)} for f, i in feature_importance],
        "calibration": calibration,
        "quality_gates": gate_results,
        "all_gates_passed": gates_passed
    }


def generate_report(results):
    """Generate markdown evaluation report."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / "evaluation_report.md"

    m = results["metrics"]
    gates = results["quality_gates"]

    lines = [
        "# WeatherGPT Rain Risk Model — Evaluation Report",
        "",
        f"**Model Version:** {results['model_version']}",
        f"**Trained At:** {results['trained_at']}",
        f"**Test Samples:** {m['test_samples']}",
        "",
        "## Metrics",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Precision | {m['precision']} |",
        f"| Recall | {m['recall']} |",
        f"| F1 Score | {m['f1']} |",
        f"| ROC-AUC | {m['roc_auc']} |",
        f"| PR-AUC | {m['pr_auc']} |",
        f"| Brier Score | {m['brier_score']} |",
        "",
        "## Confusion Matrix",
        "",
        "```",
        f"              Predicted No Rain  Predicted Rain",
        f"Actual No Rain    {m['confusion_matrix'][0][0]:>10}    {m['confusion_matrix'][0][1]:>10}",
        f"Actual Rain       {m['confusion_matrix'][1][0]:>10}    {m['confusion_matrix'][1][1]:>10}",
        "```",
        "",
        "## Feature Importance",
        "",
        "| Feature | Importance |",
        "|---------|-----------|",
    ]
    for fi in results["feature_importance"][:10]:
        lines.append(f"| {fi['feature']} | {fi['importance']} |")

    lines += [
        "",
        "## Calibration",
        "",
        "| Bin | Mean Predicted | Actual Rate | Count |",
        "|-----|---------------|-------------|-------|",
    ]
    for c in results["calibration"]:
        lines.append(f"| {c['bin']} | {c['mean_predicted']} | {c['actual_rate']} | {c['count']} |")

    lines += [
        "",
        "## Quality Gates",
        "",
    ]
    for metric, g in gates.items():
        status = "PASS" if g["passed"] else "FAIL"
        lines.append(f"- **{metric}**: {g['actual']} (threshold: {g['threshold']}) — {status}")

    lines.append(f"\n**Overall:** {'ALL GATES PASSED' if results['all_gates_passed'] else 'SOME GATES FAILED'}")

    with open(report_path, "w") as f:
        f.write("\n".join(lines))

    print(f"Report saved to {report_path}")
    return results["all_gates_passed"]


def main():
    print("WeatherGPT Model Evaluation")
    print("=" * 40)
    model, meta, df = load_model_and_data()
    results = evaluate(model, meta, df)
    passed = generate_report(results)
    print(f"\nQuality gates: {'PASSED' if passed else 'FAILED'}")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
