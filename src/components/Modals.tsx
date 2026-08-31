import React, { useState } from 'react';
import { 
  X, 
  Map as MapIcon, 
  Play, 
  Pause, 
  Layers, 
  Wind, 
  Droplets, 
  CloudRain, 
  Eye, 
  Check, 
  Bell, 
  AlertTriangle, 
  ShieldCheck, 
  Radio, 
  Compass, 
  Thermometer, 
  Gauge, 
  SunMedium,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { AlertItem, WeatherStats } from '../types';

// Map Modal Component
interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationName: string;
}

export const MapModal: React.FC<MapModalProps> = ({ isOpen, onClose, locationName }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeLayer, setActiveLayer] = useState<'radar' | 'wind' | 'clouds' | 'satellite'>('radar');
  const [timeIndex, setTimeIndex] = useState(2); // 0: -2h, 1: -1h, 2: Now, 3: +1h, 4: +2h, 5: +4h, 6: +6h

  if (!isOpen) return null;

  const timeLabels = ['-2 Hours', '-1 Hour', 'Current', '+1 Hour', '+2 Hours', '+4 Hours', '+6 Hours'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#141B2E] border border-[#1F2A44] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1F2A44] bg-[#0B1120]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2E7BFA]/20 border border-[#2E7BFA]/40 flex items-center justify-center text-[#2E7BFA]">
              <MapIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F5F7FA] font-['Manrope']">
                Weather Outlook Map
              </h3>
              <p className="text-[11px] text-[#8B95A8]">
                Region: {locationName} • Source: model forecast / demo fixture
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1F2A44] hover:bg-[#2E7BFA] text-[#8B95A8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map Stage */}
        <div className="relative flex-1 min-h-[380px] bg-[#0A0F1D] overflow-hidden">
          
          {/* Map Base Canvas / Satellite Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1400&q=80')`
            }}
          />

          {/* Dynamic Layer Overlays */}
          {activeLayer === 'radar' && (
            <div className="absolute inset-0 bg-gradient-to-tr from-[#2E7BFA]/40 via-emerald-500/30 to-amber-500/40 mix-blend-screen opacity-90 transition-opacity">
              {/* Radar Sweep Effect */}
              <div className="absolute inset-0 origin-center animate-radar-sweep pointer-events-none opacity-40 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(46,123,250,0.5)_60deg,transparent_90deg)]" />
            </div>
          )}

          {activeLayer === 'wind' && (
            <div className="absolute inset-0 bg-cyan-500/20 mix-blend-overlay">
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_30%_50%,rgba(0,255,255,0.6)_0%,transparent_60%)] animate-pulse" />
            </div>
          )}

          {activeLayer === 'clouds' && (
            <div className="absolute inset-0 bg-slate-400/25 mix-blend-screen">
              <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_60%_40%,rgba(255,255,255,0.5)_0%,transparent_70%)] animate-pulse" />
            </div>
          )}

          {/* Map Badges */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-white flex items-center gap-2 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-[#4CAF50] animate-ping" />
              <span>{locationName} — outlook region</span>
            </div>

            <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-[#afc6ff] flex items-center gap-2 shadow-lg">
              <Compass className="w-3.5 h-3.5 text-[#2E7BFA]" />
              <span>Illustrative overlay — not a live radar feed</span>
            </div>
          </div>

          {/* Radar Intensity Legend */}
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md p-2.5 rounded-xl border border-white/10 text-[10px] text-white shadow-lg">
            <div className="font-semibold mb-1 text-[#8B95A8] uppercase tracking-wider">Intensity Legend</div>
            <div className="flex items-center gap-1">
              <span className="w-4 h-2.5 bg-blue-500 rounded-sm" title="Light" />
              <span className="w-4 h-2.5 bg-emerald-500 rounded-sm" title="Moderate" />
              <span className="w-4 h-2.5 bg-yellow-400 rounded-sm" title="Heavy" />
              <span className="w-4 h-2.5 bg-amber-600 rounded-sm" title="Severe" />
              <span className="w-4 h-2.5 bg-red-600 rounded-sm" title="Extreme" />
              <span className="w-4 h-2.5 bg-purple-600 rounded-sm" title="Hail" />
            </div>
            <div className="flex justify-between text-[9px] text-[#8B95A8] mt-0.5 font-mono">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          {/* Layer Selector Floating Bar */}
          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
            {[
              { id: 'radar', label: 'Precipitation', icon: CloudRain },
              { id: 'wind', label: 'Wind Stream', icon: Wind },
              { id: 'clouds', label: 'Cloud Cover', icon: Droplets },
              { id: 'satellite', label: 'Infrared', icon: Eye },
            ].map((layer) => {
              const Icon = layer.icon;
              const isActive = activeLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id as any)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#2E7BFA] text-white shadow-md'
                      : 'text-[#8B95A8] hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{layer.label}</span>
                </button>
              );
            })}
          </div>

        </div>

        {/* Bottom Timeline Controls */}
        <div className="p-4 bg-[#0B1120] border-t border-[#1F2A44] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-xl bg-[#2E7BFA] hover:bg-[#2563EB] text-white flex items-center justify-center shadow-lg shadow-[#2E7BFA]/20 transition-all shrink-0"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div>
              <div className="text-xs font-bold text-white">
                Timeline: {timeLabels[timeIndex]}
              </div>
              <div className="text-[11px] text-[#8B95A8]">
                Auto-looping forecast frames (illustrative)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1">
            {timeLabels.map((lbl, idx) => (
              <button
                key={idx}
                onClick={() => setTimeIndex(idx)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all whitespace-nowrap ${
                  timeIndex === idx
                    ? 'bg-[#2E7BFA] text-white font-bold'
                    : 'bg-[#141B2E] text-[#8B95A8] hover:text-white border border-[#1F2A44]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

// Alert Detail Modal Component
interface AlertDetailModalProps {
  alert: AlertItem | null;
  onClose: () => void;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({ alert, onClose }) => {
  if (!alert) return null;
  const isCritical = alert.severity === 'critical';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#141B2E] border border-[#1F2A44] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Banner Header */}
        <div 
          className={`p-5 border-b flex items-start justify-between ${
            isCritical 
              ? 'bg-[#C0392B]/20 border-[#C0392B]/40' 
              : 'bg-[#B8860B]/20 border-[#B8860B]/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div 
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCritical ? 'bg-[#C0392B] text-white' : 'bg-amber-500 text-black font-bold'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  isCritical ? 'bg-[#C0392B] text-white' : 'bg-amber-500 text-black'
                }`}>
                  {alert.severity.toUpperCase()} WARNING
                </span>
                <span className="text-[11px] text-[#8B95A8] font-mono">ID: {alert.id}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1 font-['Manrope']">
                {alert.title} — {alert.location}
              </h3>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/40 hover:bg-black/60 text-[#8B95A8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <h4 className="text-xs font-bold text-[#8B95A8] uppercase tracking-wider mb-1">
              Meteorological Briefing
            </h4>
            <p className="text-sm text-[#F5F7FA] leading-relaxed">
              {alert.fullDetails || alert.message}
            </p>
          </div>

          {alert.affectedDistricts && alert.affectedDistricts.length > 0 && (
            <div className="bg-[#0B1120] border border-[#1F2A44] p-3 rounded-xl">
              <h4 className="text-xs font-bold text-[#afc6ff] uppercase tracking-wider mb-1.5">
                Affected Tehsils & Districts
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {alert.affectedDistricts.map((d, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-xs bg-[#1F2A44] text-[#F5F7FA]">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
              Citizen Advisory & Safety Checklist
            </h4>
            <ul className="space-y-2 text-xs text-[#F5F7FA]">
              {(alert.instructions || [
                "Stay indoors during peak precipitation and thunderstorm periods.",
                "Keep emergency phone numbers, torches, and first-aid kits accessible.",
                "Do not drive or walk through flooded underpasses or nullahs."
              ]).map((inst, idx) => (
                <li key={idx} className="flex items-start gap-2 bg-[#0B1120]/60 p-2.5 rounded-lg border border-white/5">
                  <Check className="w-4 h-4 text-[#4CAF50] shrink-0 mt-0.5" />
                  <span>{inst}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#2E7BFA]/10 border border-[#2E7BFA]/30 p-3 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-white block">State Disaster Helpline</span>
              <span className="text-[#8B95A8] text-[11px]">Dial 1077 (District Control) or 112 (National Emergency)</span>
            </div>
            <span className="px-3 py-1 bg-[#2E7BFA] text-white font-bold rounded-lg">
              Call 112
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0B1120] border-t border-[#1F2A44] flex items-center justify-between text-xs text-[#8B95A8]">
          <span>Issued by: {alert.source || 'Unavailable'}</span>
          <span>Valid until: {alert.expiresAt || 'Tomorrow evening'}</span>
        </div>

      </div>
    </div>
  );
};

// Set Alert Modal Component
interface SetAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationName: string;
}

export const SetAlertModal: React.FC<SetAlertModalProps> = ({ isOpen, onClose, locationName }) => {
  const [rainEnabled, setRainEnabled] = useState(true);
  const [tempEnabled, setTempEnabled] = useState(true);
  const [aqiEnabled, setAqiEnabled] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#141B2E] border border-[#1F2A44] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2A44] bg-[#0B1120]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-['Manrope']">
                Set Weather Alert Triggers
              </h3>
              <p className="text-[11px] text-[#8B95A8]">Location: {locationName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1F2A44] hover:bg-white/10 text-[#8B95A8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alert Toggles */}
        <div className="p-5 space-y-3.5">
          <label className="flex items-center justify-between p-3 rounded-xl bg-[#0B1120] border border-[#1F2A44] cursor-pointer">
            <div>
              <span className="text-xs font-bold text-white block">Heavy Rain & Cloudburst</span>
              <span className="text-[11px] text-[#8B95A8]">Notify if rain chance exceeds 60%</span>
            </div>
            <input
              type="checkbox"
              checked={rainEnabled}
              onChange={(e) => setRainEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-[#2E7BFA] bg-[#141B2E] border-[#1F2A44]"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#0B1120] border border-[#1F2A44] cursor-pointer">
            <div>
              <span className="text-xs font-bold text-white block">Heatwave & High Temp</span>
              <span className="text-[11px] text-[#8B95A8]">Notify when temperature crosses 38°C</span>
            </div>
            <input
              type="checkbox"
              checked={tempEnabled}
              onChange={(e) => setTempEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-[#2E7BFA] bg-[#141B2E] border-[#1F2A44]"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#0B1120] border border-[#1F2A44] cursor-pointer">
            <div>
              <span className="text-xs font-bold text-white block">Air Quality Degradation</span>
              <span className="text-[11px] text-[#8B95A8]">Notify when AQI exceeds 150 (Poor)</span>
            </div>
            <input
              type="checkbox"
              checked={aqiEnabled}
              onChange={(e) => setAqiEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-[#2E7BFA] bg-[#141B2E] border-[#1F2A44]"
            />
          </label>

          {savedSuccess && (
            <div className="p-3 bg-[#4CAF50]/15 border border-[#4CAF50] text-[#4CAF50] rounded-xl text-xs text-center font-bold animate-pulse">
              ✓ Alert Preferences Saved Locally
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#0B1120] border-t border-[#1F2A44] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#8B95A8] hover:text-white bg-[#141B2E] hover:bg-[#1F2A44]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#2E7BFA] hover:bg-[#2563EB] shadow-md shadow-[#2E7BFA]/20"
          >
            Save Alert Triggers
          </button>
        </div>

      </div>
    </div>
  );
};

// More Details Modal Component
interface MoreDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats?: WeatherStats;
  locationName: string;
}

export const MoreDetailsModal: React.FC<MoreDetailsModalProps> = ({ isOpen, onClose, stats, locationName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#141B2E] border border-[#1F2A44] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2A44] bg-[#0B1120]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2E7BFA]/20 border border-[#2E7BFA]/40 flex items-center justify-center text-[#2E7BFA]">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white font-['Manrope']">
                Comprehensive Meteorological Indices
              </h3>
              <p className="text-[11px] text-[#8B95A8]">Location: {locationName} • Forecast & AQI summary</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1F2A44] hover:bg-white/10 text-[#8B95A8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          
          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">Barometric Pressure</div>
            <div className="text-lg font-bold text-white">{stats?.pressure ?? '—'} hPa</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Estimate when available</div>
          </div>

          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">UV Radiation Index</div>
            <div className="text-lg font-bold text-amber-400">{stats?.uvIndex ?? '—'} of 11</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Estimate when available</div>
          </div>

          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">Dew Point</div>
            <div className="text-lg font-bold text-[#afc6ff]">—</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Not available</div>
          </div>

          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">Visibility Distance</div>
            <div className="text-lg font-bold text-white">—</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Not available</div>
          </div>

          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">Cloud Base Ceiling</div>
            <div className="text-lg font-bold text-white">—</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Not available</div>
          </div>

          <div className="bg-[#0B1120] border border-[#1F2A44] p-3.5 rounded-xl">
            <div className="text-[11px] text-[#8B95A8] uppercase font-semibold mb-1">Wind Speed</div>
            <div className="text-lg font-bold text-white">{stats?.wind ?? '—'} km/h</div>
            <div className="text-[10px] text-[#8B95A8] mt-0.5">Not available</div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0B1120] border-t border-[#1F2A44] flex items-center justify-between text-xs text-[#8B95A8]">
          <span>Values update as new forecast data arrives</span>
          <button
            onClick={onClose}
            className="px-4 py-1 rounded-lg bg-[#2E7BFA] text-white font-medium hover:bg-[#2563EB]"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
