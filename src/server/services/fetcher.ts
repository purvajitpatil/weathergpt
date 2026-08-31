/**
 * WeatherGPT — Weather data fetcher.
 *
 * Cached access to the active weather provider. On provider failure the
 * registry may auto-switch to demo mode (clearly labeled), silently degrading
 * availability while keeping honest provenance.
 */
import type { ResolvedLocation, WeatherObservation, WeatherForecast, AirQualityObservation } from "../core/models";
import type { WeatherProvider } from "../providers/types";
import { getRegistry } from "../providers";
import { CacheService } from "../cache";
import { logger } from "../logger";

export class WeatherDataFetcher {
  constructor(
    private cache: CacheService,
    private getProvider: () => WeatherProvider,
    private ttl: { current?: number; forecast?: number; aqi?: number } = {}
  ) {}

  private provider(): WeatherProvider {
    return this.getProvider();
  }

  private async guarded<T>(kind: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const provider = this.provider();
      logger.warn("Weather fetch failed; auto-switching to demo if live", {
        kind,
        provider: provider.id,
        error: (err as Error).message,
      });
      if (!provider.isDemo) {
        try {
          getRegistry().switchToDemo();
        } catch {
          /* registry may not be initialized yet */
        }
      }
      throw err;
    }
  }

  async getCurrent(location: ResolvedLocation): Promise<WeatherObservation> {
    const key = this.cache.key.current(location.latitude, location.longitude);
    const cached = await this.cache.get<WeatherObservation>(key);
    if (cached) return cached;
    const obs = await this.guarded("current", () => this.provider().getCurrent(location));
    await this.cache.set(key, obs, this.ttl.current ?? 300);
    return obs;
  }

  async getForecast(location: ResolvedLocation, days = 3): Promise<WeatherForecast> {
    const key = this.cache.key.forecast(location.latitude, location.longitude, days);
    const cached = await this.cache.get<WeatherForecast>(key);
    if (cached) return cached;
    const fc = await this.guarded("forecast", () => this.provider().getForecast(location, { days }));
    await this.cache.set(key, fc, this.ttl.forecast ?? 900);
    return fc;
  }

  async getAqi(location: ResolvedLocation): Promise<AirQualityObservation> {
    if (!this.provider().capabilities.airQuality) {
      throw new Error(`Provider ${this.provider().id} does not support air quality`);
    }
    const key = this.cache.key.aqi(location.latitude, location.longitude);
    const cached = await this.cache.get<AirQualityObservation>(key);
    if (cached) return cached;
    const aqi = await this.guarded("aqi", () => this.provider().getAirQuality(location));
    await this.cache.set(key, aqi, this.ttl.aqi ?? 1800);
    return aqi;
  }
}