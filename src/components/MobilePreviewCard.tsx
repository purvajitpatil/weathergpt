import React, { useState } from 'react';
import { Menu, MoreVertical, MapPin, ChevronDown, Check, Cloud, Droplets, Wind, ShieldCheck, Sun, CloudRain, CloudLightning, ArrowUp, Sparkles } from 'lucide-react';
import { LocationWeather } from '../types';
import { HourlyForecastRow } from './HourlyForecastRow';

interface MobilePreviewCardProps {
  weather: LocationWeather;
  onLocationChange: (cityName: string) => void;
  onQuickQuery?: (query: string) => void;
}

export const CITIES = [
  { name: 'Pune', label: 'Pune, Maharashtra, India' },
  { name: 'Mumbai', label: 'Mumbai, Maharashtra, India' },
  { name: 'Manali', label: 'Manali, Himachal Pradesh, India' },
  { name: 'Kerala', label: 'Kochi, Kerala, India' },
  { name: 'Delhi', label: 'New Delhi, Delhi NCR, India' },
  { name: 'Bengaluru', label: 'Bengaluru, Karnataka, India' },
];

export const MobilePreviewCard: React.FC<MobilePreviewCardProps> = ({
  weather,
  onLocationChange,
  onQuickQuery
}) => {
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [miniInput, setMiniInput] = useState('');

  const getWeatherIcon = (cond: string) => {
    const c = cond.toLowerCase();
    if (c.includes('rain')) return <CloudRain className="w-16 h-16 text-[#2E7BFA]" />;
    if (c.includes('thunder') || c.includes('storm')) return <CloudLightning className="w-16 h-16 text-amber-400" />;
    if (c.includes('sun') || c.includes('clear')) return <Sun className="w-16 h-16 text-amber-400" />;
    return <Cloud className="w-16 h-16 text-[#afc6ff] fill-[#afc6ff]/15" />;
  };

  const fmtNum = (v: number | undefined | null) =>
    v == null || !Number.isFinite(v) ? '—' : v;

  const handleMiniSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!miniInput.trim()) return;
    onQuickQuery?.(miniInput);
    setMiniInput('');
  };

  return (
    <div className="w-full bg-[#141B2E] border border-[#1F2A44] rounded-2xl overflow-hidden shadow-xl flex flex-col relative h-[560px] select-none">
      
      {/* Twilight Mountain Landscape Atmospheric Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen pointer-events-none transition-all duration-700"
        style={{ 
          backgroundImage: `url(${weather.bgImage || 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80'})` 
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1120]/80 via-[#141B2E]/90 to-[#0D1425] pointer-events-none" />

      {/* Internal Content */}
      <div className="relative z-10 p-5 flex flex-col h-full justify-between">
        
        {/* Top Mini Header */}
        <div>
          <div className="flex items-center justify-between text-[#8B95A8] mb-4">
            <button id="mobile-card-menu-btn" className="p-1 hover:text-[#F5F7FA] transition-colors">
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-[#2E7BFA]" />
              <span className="text-xs font-bold tracking-wider text-[#F5F7FA] uppercase">WeatherGPT</span>
            </div>
            <button id="mobile-card-more-btn" className="p-1 hover:text-[#F5F7FA] transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Location Picker */}
          <div className="relative mb-6">
            <button
              id="mobile-card-location-btn"
              onClick={() => setCityMenuOpen(!cityMenuOpen)}
              className="flex items-center gap-1.5 text-xs text-[#F5F7FA] hover:text-[#2E7BFA] bg-black/30 hover:bg-black/50 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 transition-all"
            >
              <MapPin className="w-3.5 h-3.5 text-[#2E7BFA]" />
              <span className="font-medium truncate max-w-[190px]">
                {weather.city}, {weather.state}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#8B95A8] transition-transform ${cityMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {cityMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setCityMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 w-60 bg-[#141B2E] border border-[#1F2A44] rounded-xl shadow-2xl z-40 py-1 overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-[#8B95A8] uppercase tracking-wider border-b border-[#1F2A44]">
                    Select Region / शहर
                  </div>
                  {CITIES.map((c) => (
                    <button
                      key={c.name}
                      id={`city-select-${c.name.toLowerCase()}`}
                      onClick={() => {
                        onLocationChange(c.name);
                        setCityMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                        weather.city.toLowerCase() === c.name.toLowerCase()
                          ? 'bg-[#2E7BFA]/20 text-[#2E7BFA] font-semibold'
                          : 'text-[#F5F7FA] hover:bg-[#1F2A44]'
                      }`}
                    >
                      <span>{c.label}</span>
                      {weather.city.toLowerCase() === c.name.toLowerCase() && (
                        <Check className="w-3 h-3 text-[#2E7BFA] shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Data Mode Badge */}
          <div className="flex items-center gap-2 mb-3">
            {weather.dataMode === 'demo' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Demo Data
              </span>
            ) : weather.dataMode === 'live' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Data
              </span>
            ) : null}
            {weather.dataSourceLabel && (
              <span className="text-[9px] text-[#8B95A8] truncate max-w-[140px]">
                {weather.dataSourceLabel}
              </span>
            )}
          </div>

          {/* Big Temperature & Condition Display */}
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              {getWeatherIcon(weather.condition)}
            </div>
            <div>
              <div className="text-5xl font-extrabold text-[#F5F7FA] tracking-tighter font-['Manrope']">
                {fmtNum(weather.temp)}°
              </div>
              <div className="text-sm font-semibold text-[#afc6ff] mt-0.5">
                {weather.condition}
              </div>
            </div>
          </div>

          <div className="text-xs text-[#8B95A8] space-y-0.5 mb-4">
            <div>Feels like {fmtNum(weather.feelsLike)}°C</div>
            <div>H: {fmtNum(weather.high)}°C  L: {fmtNum(weather.low)}°C</div>
          </div>

          {/* Condition Alert Banner */}
          {weather.banner && (
            <div className="bg-[#2E7BFA]/10 border border-[#2E7BFA]/30 rounded-xl p-2.5 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2E7BFA] animate-ping" />
              <p className="text-[11px] text-[#afc6ff] font-medium leading-tight">
                {weather.banner}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Section: 3-Col Mini Stats + Mini Input */}
        <div>
          <div className="grid grid-cols-3 gap-2 text-center bg-black/40 border border-white/5 p-2.5 rounded-xl backdrop-blur-md mb-3">
            <div>
              <div className="text-[10px] text-[#8B95A8] uppercase font-semibold mb-0.5">Humidity</div>
              <div className="text-sm font-bold text-[#F5F7FA] flex items-center justify-center gap-0.5">
                <Droplets className="w-3 h-3 text-[#2E7BFA]" />
                {fmtNum(weather.humidity)}%
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#8B95A8] uppercase font-semibold mb-0.5">Wind</div>
              <div className="text-sm font-bold text-[#F5F7FA] flex items-center justify-center gap-0.5">
                <Wind className="w-3 h-3 text-[#afc6ff]" />
                {fmtNum(weather.windSpeed)} <span className="text-[10px] text-[#8B95A8]">km/h</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-[#8B95A8] uppercase font-semibold mb-0.5">AQI</div>
              <div className="text-sm font-bold text-[#4CAF50] flex items-center justify-center gap-0.5">
                <ShieldCheck className="w-3 h-3 text-[#4CAF50]" />
                {fmtNum(weather.aqi)}
              </div>
              <div className="text-[9px] text-[#4CAF50] font-medium leading-none">{weather.aqiLabel}</div>
            </div>
          </div>

          {/* Hourly Forecast Row */}
          {weather.forecastHourly && weather.forecastHourly.length > 0 && (
            <HourlyForecastRow data={weather.forecastHourly} />
          )}

          {/* Mini Input Box inside preview */}
          <form onSubmit={handleMiniSubmit} className="relative">
            <input
              type="text"
              id="mobile-card-quick-input"
              value={miniInput}
              onChange={(e) => setMiniInput(e.target.value)}
              placeholder={`Ask about ${weather.city}...`}
              className="w-full bg-black/50 border border-[#1F2A44] rounded-lg py-2 pl-3 pr-8 text-xs text-[#F5F7FA] placeholder-[#8B95A8] focus:outline-none focus:border-[#2E7BFA]"
            />
            <button
              type="submit"
              id="mobile-card-quick-submit"
              disabled={!miniInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded bg-[#2E7BFA] hover:bg-[#2563EB] disabled:opacity-30 text-white flex items-center justify-center transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
