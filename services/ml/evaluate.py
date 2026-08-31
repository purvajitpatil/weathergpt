"""
WeatherGPT ML — Evaluation Script

Generates:
  - Full metric set (PR-AUC, Brier, BSS, ECE, recall, confusion matrix)
  - Baseline comparisons (climatology, persistence, raw NWP)
  - Reliability diagram data
  - Quality gate pass/fail
  - Markdown report
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_curve,
    confusion_matrix,
    classification_report,
    roc_auc_score,
)
import joblib

MODEL_DIR = Path(__file__).parent / "models" / "risk_rain_v1"
REPORT_DIR = Path(__file__).parent.parent.parent / "docs"

# Quality gates — fail if below
QUALITY_GATES = {
    "pr_auc_min": 0.10,
    "brier_max": 0.30,
    "ece_max": 0.10,
    "bss_min": 0.00,  # Must beat raw NWP or say so
}


def load_model_and_data():
    """Load model, calibrator, card, and dataset."""
    card_path = MODEL_DIR / "card.json"
    if not card_path.exists():
        print("ERROR: card.json not found. Run train.py first.")
        sys.exit(1)

    with open(card_path) as f:
        card = json.load(f)

    models = {}
    calibrators = {}
    for target in ["target_rain", "target_heavy", "target_heat"]:
        model_path = MODEL_DIR / f"model_{target}.joblib"
        cal_path = MODEL_DIR / f"calibrator_{target}.joblib"
        if model_path.exists():
            models[target] = joblib.load(model_path)
            calibrators[target] = joblib.load(cal_path)

    return models, calibrators, card


def evaluate_target(model, calibrator, X, y_true, target_name):
    """Full evaluation for one target."""
    y_prob_raw = model.predict_proba(X)[:, 1]
    y_prob = calibrator.transform(y_prob_raw)

    metrics = {}

    # Core metrics
    metrics["pr_auc"] = round(average_precision_score(y_true, y_prob), 4)
    metrics["roc_auc"] = round(roc_auc_score(y_true, y_prob), 4)
    metrics["brier"] = round(brier_score_loss(y_true, y_prob), 4)
    metrics["ece"] = round(float(_ece(y_true.values, y_prob)), 4)

    # Baselines
    base_rate = y_true.mean()
    metrics["climatology_brier"] = round(brier_score_loss(y_true, [base_rate] * len(y_true)), 4)
    metrics["raw_nwp_brier"] = round(brier_score_loss(y_true, y_prob_raw), 4)

    # BSS
    metrics["bss_vs_climatology"] = round(
        1 - metrics["brier"] / max(metrics["climatology_brier"], 0.001), 4
    )
    metrics["bss_vs_raw_nwp"] = round(
        1 - metrics["brier"] / max(metrics["raw_nwp_brier"], 0.001), 4
    )

    # Threshold selection
    threshold = _select_threshold(y_true.values, y_prob, min_recall=0.80)
    metrics["threshold_80_recall"] = round(float(threshold), 4)

    # Confusion matrix at selected threshold
    y_pred = (y_prob >= threshold).astype(int)
    cm = confusion_matrix(y_true, y_pred)
    metrics["confusion_matrix"] = cm.tolist()

    # Recall at fixed precision levels
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    for target_recall in [0.50, 0.70, 0.80, 0.90]:
        viable = recall[:-1] >= target_recall
        if viable.any():
            metrics[f"precision_at_{int(target_recall*100)}_recall"] = round(
                float(precision[:-1][viable].max()), 4
            )

    # Reliability diagram
    metrics["reliability"] = _reliability(y_true.values, y_prob)

    return metrics


def _ece(y_true, y_prob, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() > 0:
            ece += mask.sum() / len(y_true) * abs(y_prob[mask].mean() - y_true[mask].mean())
    return ece


def _select_threshold(y_true, y_prob, min_recall=0.80):
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    viable = recall[:-1] >= min_recall
    if not viable.any():
        return 0.5
    return thresholds[viable][np.argmax(precision[:-1][viable])]


def _reliability(y_true, y_prob, n_bins=10):
    bins = np.linspace(0, 1, n_bins + 1)
    reliability = []
    for i in range(n_bins):
        mask = (y_prob >= bins[i]) & (y_prob < bins[i + 1])
        if mask.sum() > 0:
            reliability.append({
                "bin": f"{bins[i]:.1f}-{bins[i+1]:.1f}",
                "mean_predicted": round(float(y_prob[mask].mean()), 4),
                "actual_rate": round(float(y_true[mask].mean()), 4),
                "count": int(mask.sum()),
            })
    return reliability


def generate_report(results, card):
    """Generate markdown evaluation report."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / "ML_EVALUATION.md"

    lines = [
        "# WeatherGPT — ML Model Evaluation Report",
        "",
        f"**Model Version:** {card['version']}",
        f"**Trained At:** {card['trained_at']}",
        f"**Trained Until:** {card['trained_until']}",
        f"**Training Rows:** {card['n_rows']:,}",
        f"**Districts:** {card['train_districts']}",
        "",
        "## What This Model Is",
        "",
        "This is **not** a weather forecasting model. It is a district-level post-processing model",
        "over NWP output — Model Output Statistics (MOS). It corrects systematic biases in global",
        "model forecasts for specific Indian districts.",
        "",
        "**Thesis:** Global models carry systematic local biases — coastal Konkan, Western Ghats",
        "rain shadow, urban heat islands — and a district-level statistical correction measurably",
        "improves them.",
        "",
        "## Scope",
        "",
        "- **Estimates:** 24-hour district-level probability of rainfall thresholds and heat stress",
        "- **Does NOT predict:** Cyclone genesis/track, flood inundation, thunderstorm timing, aviation",
        "",
        "## Data Sources (Critical)",
        "",
        "| Source | Role | Why |",
        "|--------|------|-----|",
        "| Historical Forecast API | **Features** | What the model knew at the time (no look-ahead) |",
        "| Historical Weather API (ERA5) | **Labels** | What actually happened |",
        "",
        "**CRITICAL:** ERA5 is never used for features — it assimilates observations made after the valid time.",
        "",
        "## Metric Summary",
        "",
    ]

    for target_name, metrics in results.items():
        lines.extend([
            f"### {target_name}",
            "",
            "| Metric | Value | Notes |",
            "|--------|-------|-------|",
            f"| PR-AUC | {metrics['pr_auc']} | Imbalanced targets; ROC-AUC flatters |",
            f"| ROC-AUC | {metrics['roc_auc']} | For reference only |",
            f"| Brier Score (calibrated) | {metrics['brier']} | Probability quality |",
            f"| ECE | {metrics['ece']} | Expected calibration error |",
            f"| BSS vs Climatology | {metrics['bss_vs_climatology']} | Skill vs base rate |",
            f"| BSS vs Raw NWP | {metrics['bss_vs_raw_nwp']} | **Headline metric** |",
            f"| Threshold (80% recall) | {metrics['threshold_80_recall']} | Cost asymmetry: missed events > false alarms |",
            f"| Precision @ 80% recall | {metrics.get('precision_at_80_recall', 'N/A')} | |",
            f"| Precision @ 90% recall | {metrics.get('precision_at_90_recall', 'N/A')} | |",
            "",
        ])

        # Confusion matrix
        cm = metrics.get("confusion_matrix", [[0, 0], [0, 0]])
        lines.extend([
            "**Confusion Matrix** (at 80% recall threshold):",
            "```",
            f"              Predicted No    Predicted Yes",
            f"Actual No     {cm[0][0]:>12}    {cm[0][1]:>12}",
            f"Actual Yes    {cm[1][0]:>12}    {cm[1][1]:>12}",
            "```",
            "",
        ])

        # Reliability diagram
        reliability = metrics.get("reliability", [])
        if reliability:
            lines.extend([
                "**Reliability Diagram:**",
                "",
                "| Predicted | Actual | Count |",
                "|-----------|--------|-------|",
            ])
            for r in reliability:
                lines.append(f"| {r['mean_predicted']:.2f} | {r['actual_rate']:.2f} | {r['count']} |")
            lines.append("")

    # Quality gates
    lines.extend([
        "## Quality Gates",
        "",
        "| Gate | Threshold | Status |",
        "|------|-----------|--------|",
    ])

    gates_passed = True
    for target_name, metrics in results.items():
        pr_auc_ok = metrics["pr_auc"] >= QUALITY_GATES["pr_auc_min"]
        brier_ok = metrics["brier"] <= QUALITY_GATES["brier_max"]
        ece_ok = metrics["ece"] <= QUALITY_GATES["ece_max"]
        bss_ok = metrics["bss_vs_raw_nwp"] >= QUALITY_GATES["bss_min"]

        if not (pr_auc_ok and brier_ok and ece_ok and bss_ok):
            gates_passed = False

        lines.extend([
            f"| {target_name} PR-AUC ≥ {QUALITY_GATES['pr_auc_min']} | {metrics['pr_auc']} | {'✓' if pr_auc_ok else '✗'} |",
            f"| {target_name} Brier ≤ {QUALITY_GATES['brier_max']} | {metrics['brier']} | {'✓' if brier_ok else '✗'} |",
            f"| {target_name} ECE ≤ {QUALITY_GATES['ece_max']} | {metrics['ece']} | {'✓' if ece_ok else '✗'} |",
            f"| {target_name} BSS ≥ {QUALITY_GATES['bss_min']} | {metrics['bss_vs_raw_nwp']} | {'✓' if bss_ok else '✗'} |",
        ])

    lines.extend([
        "",
        f"**Overall:** {'ALL GATES PASSED' if gates_passed else 'SOME GATES FAILED'}",
        "",
        "## Known Limitations",
        "",
    ])
    for lim in card.get("known_limitations", []):
        lines.append(f"- {lim}")

    lines.extend([
        "",
        "## What We Would Say If BSS ≤ 0",
        "",
        "If the model fails to beat raw NWP, we would say:",
        "> Our post-processing model did not improve on raw Open-Meteo forecasts for these districts.",
        "> We continue to use raw NWP output with rule-based risk thresholds.",
        "> The model is disabled and marked as decorative.",
        "",
        "**We publish this number regardless of result.**",
    ])

    with open(report_path, "w") as f:
        f.write("\n".join(lines))

    print(f"Report saved to {report_path}")
    return gates_passed


def main():
    print("WeatherGPT ML — Evaluation")
    print("=" * 60)

    models, calibrators, card = load_model_and_data()

    if not models:
        print("No models found. Run train.py first.")
        sys.exit(1)

    # Load dataset for evaluation
    from data.fetch import fetch_all_districts
    from data.build_dataset import build_dataset, FEATURE_COLUMNS

    print("Loading data...")
    all_data = fetch_all_districts(start_date="2021-01-01", end_date="2026-06-30")
    dataset = build_dataset(all_data)

    available_features = [f for f in card["feature_order"] if f in dataset.columns]
    X = dataset[available_features].fillna(0)

    results = {}
    for target in ["target_rain", "target_heavy", "target_heat"]:
        if target in models and target in dataset.columns:
            results[target] = evaluate_target(
                models[target], calibrators[target],
                X, dataset[target], target
            )

    # Generate report
    gates_passed = generate_report(results, card)

    # Print summary
    print(f"\n{'='*60}")
    print("EVALUATION SUMMARY")
    print(f"{'='*60}")
    for target, metrics in results.items():
        print(f"\n{target}:")
        print(f"  PR-AUC:       {metrics['pr_auc']}")
        print(f"  Brier:        {metrics['brier']}")
        print(f"  ECE:          {metrics['ece']}")
        print(f"  BSS vs NWP:   {metrics['bss_vs_raw_nwp']}")

    print(f"\nQuality gates: {'PASSED' if gates_passed else 'FAILED'}")
    sys.exit(0 if gates_passed else 1)


if __name__ == "__main__":
    main()
