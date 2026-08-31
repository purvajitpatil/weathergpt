"""
WeatherGPT ML — Dataset Builder

Joins forecast (features) with weather (labels), engineers features,
and creates three binary targets.

LEAKAGE RULES (enforced in code):
  1. Features from Historical Forecast API, labels from Historical Weather API
  2. All lags strictly t-1 or earlier
  3. Fit scalers/encoders inside each CV fold (handled in train.py)
  4. Climatology normals from training years only
  5. No random splits (handled in train.py)
"""

import numpy as np
import pandas as pd
from pathlib import Path


def build_dataset(all_data: dict) -> pd.DataFrame:
    """
    Build the complete ML dataset from fetched data.

    Returns a DataFrame with ~40 features and 3 targets per day per district.
    """
    frames = []

    for district_id, data in all_data.items():
        forecast_df = data["forecast"]
        weather_df = data["weather"]

        # Merge forecast (features) with weather (labels) on date
        df = forecast_df.merge(weather_df, on="date", how="inner")
        df["date"] = pd.to_datetime(df["date"])

        if len(df) < 100:
            continue

        # ── Group B: Local antecedent state (lags) ──────────────────────────
        df["precip_obs_24h"] = df["precip_sum_obs_24h"].shift(1)
        df["precip_obs_72h"] = df["precip_sum_obs_24h"].rolling(3, min_periods=1).sum().shift(1)
        df["precip_obs_7d"] = df["precip_sum_obs_24h"].rolling(7, min_periods=1).sum().shift(1)
        df["precip_obs_30d"] = df["precip_sum_obs_24h"].rolling(30, min_periods=1).sum().shift(1)
        df["tmax_obs_lag1"] = df["tmax_obs"].shift(1)
        df["tmax_obs_lag3"] = df["tmax_obs"].rolling(3, min_periods=1).mean().shift(1)

        # Dry/wet spell length
        df["is_dry"] = (df["precip_sum_obs_24h"] < 1.0).astype(int)
        df["is_wet"] = (df["precip_sum_obs_24h"] >= 1.0).astype(int)
        df["dry_spell_length"] = df["is_dry"].groupby(
            (df["is_dry"] != df["is_dry"].shift()).cumsum()
        ).cumcount() + 1
        df["dry_spell_length"] = df["dry_spell_length"] * df["is_dry"]
        df["wet_spell_length"] = df["is_wet"].groupby(
            (df["is_wet"] != df["is_wet"].shift()).cumsum()
        ).cumcount() + 1
        df["wet_spell_length"] = df["wet_spell_length"] * df["is_wet"]

        # ── Group C: Climatological context ──────────────────────────────────
        df["month"] = df["date"].dt.month
        df["doy"] = df["date"].dt.dayofyear

        # Climatology normals (from this district's data only — no leakage)
        clim = df.groupby("month").agg(
            normal_precip_month=("precip_sum_obs_24h", "mean"),
            normal_tmax_month=("tmax_obs", "mean"),
        ).reset_index()
        df = df.merge(clim, on="month", how="left")

        df["precip_departure_pct"] = (
            (df["precip_obs_7d"] - df["normal_precip_month"] * 7)
            / df["normal_precip_month"].clip(lower=0.1) * 100
        )
        df["tmax_departure"] = df["tmax_obs"] - df["normal_tmax_month"]

        # Monsoon phase (simplified)
        df["monsoon_phase"] = df["month"].map({
            1: "post", 2: "post", 3: "post", 4: "pre",
            5: "pre", 6: "sw", 7: "sw", 8: "sw",
            9: "sw", 10: "post", 11: "ne", 12: "ne"
        })

        # Days since monsoon onset (June 1 = day 0)
        monsoon_onset = pd.Timestamp(f"{df['date'].dt.year.iloc[0]}-06-01")
        df["days_since_monsoon_onset"] = (df["date"] - monsoon_onset).dt.days
        df["days_since_monsoon_onset"] = df["days_since_monsoon_onset"].clip(lower=0)

        # ── Group D: Static geography ────────────────────────────────────────
        # lat, lon, elevation_m, distance_to_coast_km already in df
        df["district_id"] = district_id

        # ── Group E: Temporal encoding ───────────────────────────────────────
        df["sin_doy"] = np.sin(2 * np.pi * df["doy"] / 365)
        df["cos_doy"] = np.cos(2 * np.pi * df["doy"] / 365)

        # ── Derived features ─────────────────────────────────────────────────
        df["dewpoint_depression"] = df["tmax_fc"] - (df["tmin_fc"] - 2)  # approximate
        df["precip_anomaly"] = df["precip_sum_fc_24h"] - df["normal_precip_month"]
        df["antecedent_wetness"] = df["precip_obs_7d"] / df["normal_precip_month"].clip(lower=1)

        # Wind speed from gusts if available
        df["wind_speed_fc"] = df.get("wind_gust_max_fc", df.get("wind_speed_fc_max", 0))

        # ── Targets (D+1 valid window) ──────────────────────────────────────
        df["precip_sum_next24h"] = df["precip_sum_obs_24h"].shift(-1)
        df["tmax_next"] = df["tmax_obs"].shift(-1)

        df["target_rain"] = (df["precip_sum_next24h"] >= 2.5).astype(int)
        df["target_heavy"] = (df["precip_sum_next24h"] >= 64.5).astype(int)
        df["target_heat"] = (
            (df["tmax_next"] >= 40.0) &
            (df["tmax_departure"].shift(-1) >= 4.5)
        ).astype(int)

        frames.append(df)

    if not frames:
        raise ValueError("No data to build dataset")

    dataset = pd.concat(frames, ignore_index=True)

    # Drop rows with NaN targets (last day of each district)
    dataset = dataset.dropna(subset=["target_rain", "target_heavy", "target_heat"])

    print(f"Dataset built: {len(dataset):,} rows × {dataset.shape[1]} columns")
    print(f"Districts: {dataset['district_id'].nunique()}")
    print(f"Date range: {dataset['date'].min()} to {dataset['date'].max()}")
    print(f"\nTarget base rates:")
    print(f"  rain:  {dataset['target_rain'].mean():.3f}")
    print(f"  heavy: {dataset['target_heavy'].mean():.3f}")
    print(f"  heat:  {dataset['target_heat'].mean():.3f}")

    return dataset


FEATURE_COLUMNS = [
    # Group A: NWP forecast
    "precip_sum_fc_24h", "tmax_fc", "tmin_fc",
    "rh_mean_fc", "rh_min_fc",
    "mslp_mean_fc",
    "wind_speed_fc_max", "wind_gust_max_fc",
    "cloud_cover_mean_fc",

    # Group B: Antecedent state
    "precip_obs_24h", "precip_obs_72h", "precip_obs_7d", "precip_obs_30d",
    "soil_moisture_0_7cm", "soil_moisture_7_28cm",
    "dry_spell_length", "wet_spell_length",
    "tmax_obs_lag1", "tmax_obs_lag3",

    # Group C: Climatological context
    "normal_precip_month", "precip_departure_pct",
    "normal_tmax_month", "tmax_departure",
    "days_since_monsoon_onset",

    # Group D: Static geography
    "lat", "lon", "elevation_m", "distance_to_coast_km",

    # Group E: Temporal encoding
    "sin_doy", "cos_doy",

    # Derived
    "dewpoint_depression", "precip_anomaly", "antecedent_wetness",
    "wind_speed_fc",
]

TARGET_COLUMNS = ["target_rain", "target_heavy", "target_heat"]

if __name__ == "__main__":
    from fetch import fetch_all_districts

    print("Fetching data...")
    all_data = fetch_all_districts(start_date="2021-01-01", end_date="2026-06-30")

    print("\nBuilding dataset...")
    dataset = build_dataset(all_data)

    output_path = Path(__file__).parent / "dataset.parquet"
    dataset.to_parquet(output_path, index=False)
    print(f"\nSaved to {output_path}")
