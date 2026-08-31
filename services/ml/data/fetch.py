"""
WeatherGPT ML — Data Fetcher

Pulls from two Open-Meteo APIs:
  FEATURES ← Historical Forecast API (what the model knew at the time)
  LABELS   ← Historical Weather API  (what actually happened)

CRITICAL: Never train on ERA5 features — look-ahead leakage.
The Historical Forecast API is a continuous hourly timeseries built by
stitching the first hours of each successive model run.

API docs:
  https://open-meteo.com/en/docs/historical-forecast-api
  https://open-meteo.com/en/docs/historical-weather-api

Licensing: CC BY 4.0, free tier ~10,000 requests/day non-commercial.
"""

import json
import time
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests

DATA_DIR = Path(__file__).parent
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# ─── 50 Districts for Regime Diversity ───────────────────────────────────────
# Chosen for coastal, rain shadow, arid, Himalayan, NE, Gangetic, NE monsoon,
# and urban heat island representation.

DISTRICTS = [
    # Coastal SW monsoon
    {"id": 573, "name": "Pune", "state": "Maharashtra", "lat": 18.52, "lon": 73.86, "elevation_m": 560, "distance_to_coast_km": 100},
    {"id": 574, "name": "Mumbai", "state": "Maharashtra", "lat": 19.08, "lon": 72.88, "elevation_m": 14, "distance_to_coast_km": 0},
    {"id": 575, "name": "Ratnagiri", "state": "Maharashtra", "lat": 16.99, "lon": 73.30, "elevation_m": 11, "distance_to_coast_km": 0},
    {"id": 576, "name": "Nagpur", "state": "Maharashtra", "lat": 21.15, "lon": 79.09, "elevation_m": 310, "distance_to_coast_km": 600},
    {"id": 577, "name": "Solapur", "state": "Maharashtra", "lat": 17.66, "lon": 75.91, "elevation_m": 482, "distance_to_coast_km": 200},
    {"id": 578, "name": "Nashik", "state": "Maharashtra", "lat": 20.00, "lon": 73.79, "elevation_m": 660, "distance_to_coast_km": 180},
    {"id": 579, "name": "Kolhapur", "state": "Maharashtra", "lat": 16.71, "lon": 74.24, "elevation_m": 553, "distance_to_coast_km": 80},
    {"id": 580, "name": "Chennai", "state": "Tamil Nadu", "lat": 13.08, "lon": 80.27, "elevation_m": 6, "distance_to_coast_km": 0},
    {"id": 581, "name": "Cuddalore", "state": "Tamil Nadu", "lat": 11.74, "lon": 79.77, "elevation_m": 1, "distance_to_coast_km": 0},
    {"id": 582, "name": "Coimbatore", "state": "Tamil Nadu", "lat": 11.01, "lon": 76.97, "elevation_m": 411, "distance_to_coast_km": 50},
    {"id": 583, "name": "Delhi", "state": "Delhi", "lat": 28.61, "lon": 77.21, "elevation_m": 216, "distance_to_coast_km": 1000},
    {"id": 584, "name": "Kolkata", "state": "West Bengal", "lat": 22.57, "lon": 88.36, "elevation_m": 9, "distance_to_coast_km": 0},
    {"id": 585, "name": "Patna", "state": "Bihar", "lat": 25.59, "lon": 85.14, "elevation_m": 53, "distance_to_coast_km": 700},
    {"id": 586, "name": "Varanasi", "state": "Uttar Pradesh", "lat": 25.32, "lon": 82.97, "elevation_m": 81, "distance_to_coast_km": 750},
    {"id": 587, "name": "Lucknow", "state": "Uttar Pradesh", "lat": 26.85, "lon": 80.95, "elevation_m": 123, "distance_to_coast_km": 600},
    {"id": 588, "name": "Jaipur", "state": "Rajasthan", "lat": 26.91, "lon": 75.79, "elevation_m": 431, "distance_to_coast_km": 600},
    {"id": 589, "name": "Jaisalmer", "state": "Rajasthan", "lat": 26.92, "lon": 70.91, "elevation_m": 224, "distance_to_coast_km": 350},
    {"id": 590, "name": "Barmer", "state": "Rajasthan", "lat": 25.75, "lon": 71.39, "elevation_m": 227, "distance_to_coast_km": 400},
    {"id": 591, "name": "Bengaluru", "state": "Karnataka", "lat": 12.97, "lon": 77.59, "elevation_m": 920, "distance_to_coast_km": 300},
    {"id": 592, "name": "Udupi", "state": "Karnataka", "lat": 13.34, "lon": 74.75, "elevation_m": 25, "distance_to_coast_km": 0},
    {"id": 593, "name": "Belgaum", "state": "Karnataka", "lat": 15.85, "lon": 74.50, "elevation_m": 751, "distance_to_coast_km": 120},
    {"id": 594, "name": "Hyderabad", "state": "Telangana", "lat": 17.39, "lon": 78.49, "elevation_m": 542, "distance_to_coast_km": 300},
    {"id": 595, "name": "Ahmedabad", "state": "Gujarat", "lat": 23.02, "lon": 72.57, "elevation_m": 53, "distance_to_coast_km": 80},
    {"id": 596, "name": "Surat", "state": "Gujarat", "lat": 21.17, "lon": 72.83, "elevation_m": 13, "distance_to_coast_km": 0},
    {"id": 597, "name": "Kochi", "state": "Kerala", "lat": 9.93, "lon": 76.27, "elevation_m": 9, "distance_to_coast_km": 0},
    {"id": 598, "name": "Thiruvananthapuram", "state": "Kerala", "lat": 8.52, "lon": 76.94, "elevation_m": 10, "distance_to_coast_km": 0},
    {"id": 599, "name": "Shimla", "state": "Himachal Pradesh", "lat": 31.10, "lon": 77.17, "elevation_m": 2276, "distance_to_coast_km": 700},
    {"id": 600, "name": "Dehradun", "state": "Uttarakhand", "lat": 30.32, "lon": 78.03, "elevation_m": 640, "distance_to_coast_km": 500},
    {"id": 601, "name": "Gangtok", "state": "Sikkim", "lat": 27.33, "lon": 88.61, "elevation_m": 1650, "distance_to_coast_km": 600},
    {"id": 602, "name": "Guwahati", "state": "Assam", "lat": 26.14, "lon": 91.74, "elevation_m": 55, "distance_to_coast_km": 600},
    {"id": 603, "name": "Dhubri", "state": "Assam", "lat": 26.02, "lon": 90.00, "elevation_m": 30, "distance_to_coast_km": 500},
    {"id": 604, "name": "East Khasi Hills", "state": "Meghalaya", "lat": 25.47, "lon": 91.88, "elevation_m": 1484, "distance_to_coast_km": 400},
    {"id": 605, "name": "Bhopal", "state": "Madhya Pradesh", "lat": 23.26, "lon": 77.41, "elevation_m": 527, "distance_to_coast_km": 800},
    {"id": 606, "name": "Indore", "state": "Madhya Pradesh", "lat": 22.72, "lon": 75.86, "elevation_m": 553, "distance_to_coast_km": 700},
    {"id": 607, "name": "Raipur", "state": "Chhattisgarh", "lat": 21.25, "lon": 81.63, "elevation_m": 291, "distance_to_coast_km": 500},
    {"id": 608, "name": "Bhubaneswar", "state": "Odisha", "lat": 20.30, "lon": 85.82, "elevation_m": 45, "distance_to_coast_km": 10},
    {"id": 609, "name": "Cuttack", "state": "Odisha", "lat": 20.46, "lon": 85.88, "elevation_m": 28, "distance_to_coast_km": 30},
    {"id": 610, "name": "Vijayawada", "state": "Andhra Pradesh", "lat": 16.51, "lon": 80.62, "elevation_m": 23, "distance_to_coast_km": 30},
    {"id": 611, "name": "Visakhapatnam", "state": "Andhra Pradesh", "lat": 17.69, "lon": 83.22, "elevation_m": 45, "distance_to_coast_km": 0},
    {"id": 612, "name": "Agartala", "state": "Tripura", "lat": 23.83, "lon": 91.28, "elevation_m": 12, "distance_to_coast_km": 300},
    {"id": 613, "name": "Imphal", "state": "Manipur", "lat": 24.81, "lon": 93.94, "elevation_m": 786, "distance_to_coast_km": 400},
    {"id": 614, "name": "Aizawl", "state": "Mizoram", "lat": 23.73, "lon": 92.72, "elevation_m": 1080, "distance_to_coast_km": 300},
    {"id": 615, "name": "Panaji", "state": "Goa", "lat": 15.49, "lon": 73.83, "elevation_m": 8, "distance_to_coast_km": 0},
    {"id": 616, "name": "Mysuru", "state": "Karnataka", "lat": 12.30, "lon": 76.64, "elevation_m": 770, "distance_to_coast_km": 150},
    {"id": 617, "name": "Dharwad", "state": "Karnataka", "lat": 15.46, "lon": 75.01, "elevation_m": 683, "distance_to_coast_km": 100},
    {"id": 618, "name": "Mangaluru", "state": "Karnataka", "lat": 12.91, "lon": 74.86, "elevation_m": 22, "distance_to_coast_km": 0},
    {"id": 619, "name": "Warangal", "state": "Telangana", "lat": 17.98, "lon": 79.60, "elevation_m": 289, "distance_to_coast_km": 250},
    {"id": 620, "name": "Gwalior", "state": "Madhya Pradesh", "lat": 26.22, "lon": 78.18, "elevation_m": 197, "distance_to_coast_km": 800},
]


# ─── API Fetchers ────────────────────────────────────────────────────────────

def fetch_historical_forecast(
    lat: float, lon: float,
    start_date: str, end_date: str,
    timeout: int = 30
) -> pd.DataFrame:
    """
    Fetch Historical Forecast API — what the model knew at the time.
    This is the FEATURES source. Never use ERA5 for features.
    """
    cache_key = f"forecast_{lat:.2f}_{lon}_{start_date}_{end_date}.parquet"
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        return pd.read_parquet(cache_path)

    hourly_vars = [
        "temperature_2m_max", "temperature_2m_min",
        "relative_humidity_2m_mean", "relative_humidity_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max", "wind_gusts_10m_max",
        "pressure_msl_mean",
        "cloud_cover_mean",
    ]

    url = (
        f"https://previous-runs-api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&hourly={','.join(hourly_vars)}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,"
        f"wind_speed_10m_max,wind_gusts_10m_max"
        f"&timezone=Asia/Kolkata"
    )

    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    # Process daily data
    daily = data.get("daily", {})
    df = pd.DataFrame({
        "date": daily.get("time", []),
        "tmax_fc": daily.get("temperature_2m_max", []),
        "tmin_fc": daily.get("temperature_2m_min", []),
        "precip_sum_fc_24h": daily.get("precipitation_sum", []),
        "wind_speed_fc_max": daily.get("wind_speed_10m_max", []),
        "wind_gust_max_fc": daily.get("wind_gusts_10m_max", []),
    })

    # Process hourly aggregates
    hourly = data.get("hourly", {})
    if hourly.get("time"):
        h_df = pd.DataFrame({
            "time": hourly["time"],
            "rh_mean_fc": hourly.get("relative_humidity_2m_mean", []),
            "rh_min_fc": hourly.get("relative_humidity_2m_min", []),
            "mslp_mean_fc": hourly.get("pressure_msl_mean", []),
            "cloud_cover_mean_fc": hourly.get("cloud_cover_mean", []),
        })
        h_df["date"] = pd.to_datetime(h_df["time"]).dt.date.astype(str)
        h_daily = h_df.groupby("date").agg({
            "rh_mean_fc": "mean", "rh_min_fc": "min",
            "mslp_mean_fc": "mean", "cloud_cover_mean_fc": "mean",
        }).reset_index()
        df = df.merge(h_daily, on="date", how="left")

    df.to_parquet(cache_path, index=False)
    return df


def fetch_historical_weather(
    lat: float, lon: float,
    start_date: str, end_date: str,
    timeout: int = 30
) -> pd.DataFrame:
    """
    Fetch Historical Weather API (ERA5) — what actually happened.
    This is the LABELS source only. Never use for features.
    """
    cache_key = f"weather_{lat:.2f}_{lon}_{start_date}_{end_date}.parquet"
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        return pd.read_parquet(cache_path)

    daily_vars = [
        "temperature_2m_max", "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
        "soil_moisture_0_to_7cm", "soil_moisture_7_to_28cm",
    ]

    url = (
        f"https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={lat}&longitude={lon}"
        f"&daily={','.join(daily_vars)}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&timezone=Asia/Kolkata"
    )

    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()

    daily = data.get("daily", {})
    df = pd.DataFrame({
        "date": daily.get("time", []),
        "tmax_obs": daily.get("temperature_2m_max", []),
        "tmin_obs": daily.get("temperature_2m_min", []),
        "precip_sum_obs_24h": daily.get("precipitation_sum", []),
        "wind_speed_obs_max": daily.get("wind_speed_10m_max", []),
        "soil_moisture_0_7cm": daily.get("soil_moisture_0_to_7cm", []),
        "soil_moisture_7_28cm": daily.get("soil_moisture_7_to_28cm", []),
    })

    df.to_parquet(cache_path, index=False)
    return df


# ─── Main Entry Point ────────────────────────────────────────────────────────

def fetch_all_districts(
    start_date: str = "2021-01-01",
    end_date: str = "2026-06-30",
    districts: Optional[list] = None
) -> dict:
    """
    Fetch data for all districts. Returns dict of DataFrames.
    Budget: ~100 API requests total.
    """
    districts = districts or DISTRICTS
    results = {}

    for i, d in enumerate(districts):
        print(f"[{i+1}/{len(districts)}] Fetching {d['name']}, {d['state']}...")

        try:
            forecast_df = fetch_historical_forecast(d["lat"], d["lon"], start_date, end_date)
            weather_df = fetch_historical_weather(d["lat"], d["lon"], start_date, end_date)

            forecast_df["district_id"] = d["id"]
            forecast_df["district_name"] = d["name"]
            forecast_df["lat"] = d["lat"]
            forecast_df["lon"] = d["lon"]
            forecast_df["elevation_m"] = d["elevation_m"]
            forecast_df["distance_to_coast_km"] = d["distance_to_coast_km"]

            results[d["id"]] = {"forecast": forecast_df, "weather": weather_df}
            print(f"  ✓ {len(forecast_df)} forecast days, {len(weather_df)} weather days")

        except Exception as e:
            print(f"  ✗ Error: {e}")

        # Rate limiting: 1 request per second
        time.sleep(1)

    return results


if __name__ == "__main__":
    print("WeatherGPT ML — Data Fetcher")
    print("=" * 50)
    print(f"Districts: {len(DISTRICTS)}")
    print(f"Period: 2021-01-01 to 2026-06-30")
    print(f"Expected rows: ~{len(DISTRICTS) * 5 * 365:,}")
    print()
    results = fetch_all_districts()
    print(f"\nFetched data for {len(results)} districts")
