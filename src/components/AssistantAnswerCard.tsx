import React from 'react';
import { 
  Cloud, 
  Map as MapIcon, 
  Info, 
  Bell, 
  ShieldAlert, 
  Play, 
  Maximize2, 
  Droplets, 
  Thermometer, 
  Wind, 
  CloudRain, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { WeatherStats, SourceInfo, MapThumbnailData } from '../types';

interface AssistantAnswerCardProps {
  summaryText: string;
  stats: WeatherStats;
  recommendation: string;
  source: SourceInfo;
  mapData?: MapThumbnailData;
  dataMode?: 'live' | 'demo';
  dataSourceLabel?: string;
  disclaimer?: string;
  evidenceCount?: number;
  llmUsed?: boolean;
  onShowMap: () => void;
  onMoreDetails: () => void;
  onSetAlert: () => void;
  onTriggerAction?: (actionName: string) => void;
}

export const AssistantAnswerCard: React.FC<AssistantAnswerCardProps> = ({
  summaryText,
  stats,
  recommendation,
  source,
  mapData,
  dataMode,
  dataSourceLabel,
  disclaimer,
  evidenceCount,
  llmUsed,
  onShowMap,
  onMoreDetails,
  onSetAlert,
  onTriggerAction,
}) => {
  // Helper to format bold markdown in summary
  const renderSummary = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="text-white font-semibold underline decoration-[#2E7BFA]/40 underline-offset-2">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="w-full flex items-start gap-3 my-2 animate-fadeIn">
      {/* Bot Icon */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#141B2E] to-[#1F2A44] border border-[#2E7BFA]/40 flex items-center justify-center shrink-0 mt-1 shadow-md shadow-[#2E7BFA]/10">
        <Cloud className="w-4 h-4 text-[#2E7BFA] fill-[#2E7BFA]/20" />
      </div>

      {/* Main Assistant Content Card */}
      <div className="flex-1 min-w-0 bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 sm:p-5 shadow-lg">
        
        {/* Header Title */}
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-[#1F2A44]/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#afc6ff] tracking-wide uppercase">
              WeatherGPT Intelligence
            </span>
            {dataMode === 'demo' ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40" title="Deterministic demo fixture data — not live observations">
                DEMO DATA
              </span>
            ) : dataMode === 'live' ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/40" title="Live provider data">
                LIVE DATA
              </span>
            ) : null}
          </div>
          <span className="text-[11px] text-[#8B95A8] font-mono">
            {source.updatedAt || 'Real-time'}
          </span>
        </div>

        {/* Answer Summary Text */}
        <div className="text-sm sm:text-[15px] text-[#F5F7FA] leading-relaxed mb-4">
          {renderSummary(summaryText)}
        </div>

        {/* Structured Bullet Stats */}
        <div className="bg-[#0B1120]/60 border border-[#1F2A44] rounded-xl p-3.5 mb-4 space-y-2">
          <div className="text-[11px] font-semibold text-[#8B95A8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#2E7BFA]" />
            Forecast Parameters
          </div>

          <ul className="space-y-1.5 text-xs sm:text-sm text-[#F5F7FA]">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7BFA]" />
              <span className="text-[#8B95A8]">Precipitation Probability:</span>
              <strong className="text-white font-semibold">
                {stats.rainChance}% chance of {stats.rainChance >= 60 ? 'moderate to heavy rain' : 'light showers'}
              </strong>
              {stats.rainChance >= 60 && (
                <span className="text-[11px] text-[#afc6ff] bg-[#2E7BFA]/20 px-1.5 py-0.5 rounded font-mono">
                  4 PM - 10 PM
                </span>
              )}
            </li>

            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7BFA]" />
              <span className="text-[#8B95A8]">Temperature Range:</span>
              <strong className="text-white font-semibold">
                Max: {stats.tempMax}°C | Min: {stats.tempMin}°C
              </strong>
            </li>

            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7BFA]" />
              <span className="text-[#8B95A8]">Atmosphere & Wind:</span>
              <span className="text-[#F5F7FA]">
                Wind speed: <strong>{stats.wind} km/h</strong> | Humidity: <strong>{stats.humidity}%</strong>
              </span>
            </li>

            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2E7BFA]" />
              <span className="text-[#8B95A8]">Cloud Cover:</span>
              <span className="text-[#F5F7FA]">
                <strong>{stats.cloudCover}%</strong>
              </span>
            </li>
          </ul>
        </div>

        {/* Recommendation Callout Line */}
        <div className="bg-[#2E7BFA]/10 border-l-[3px] border-[#2E7BFA] rounded-r-xl p-3 mb-4 text-xs sm:text-sm text-[#F5F7FA]">
          <div className="text-[11px] font-bold text-[#afc6ff] uppercase tracking-wider mb-0.5">
            Operational Recommendation
          </div>
          <p className="leading-snug">{recommendation}</p>
        </div>

        {/* Action Buttons: [Show on Map] [More Details] [Set Alert] */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            id="action-btn-show-map"
            onClick={onShowMap}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2E7BFA]/15 hover:bg-[#2E7BFA]/25 text-[#afc6ff] border border-[#2E7BFA]/40 transition-all hover:border-[#2E7BFA] shadow-sm"
          >
            <MapIcon className="w-3.5 h-3.5 text-[#2E7BFA]" />
            <span>Show on Map</span>
          </button>

          <button
            id="action-btn-more-details"
            onClick={onMoreDetails}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F2A44]/60 hover:bg-[#1F2A44] text-[#F5F7FA] border border-[#1F2A44] transition-all hover:border-white/20 shadow-sm"
          >
            <Info className="w-3.5 h-3.5 text-[#8B95A8]" />
            <span>More Details</span>
          </button>

          <button
            id="action-btn-set-alert"
            onClick={onSetAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#B8860B]/15 hover:bg-[#B8860B]/25 text-amber-300 border border-[#B8860B]/40 transition-all hover:border-amber-400 shadow-sm"
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span>Set Alert</span>
          </button>
        </div>

        {/* Inline Radar / Forecast Map Thumbnail */}
        <div 
          onClick={onShowMap}
          className="group relative h-48 sm:h-56 rounded-xl overflow-hidden border border-[#1F2A44] hover:border-[#2E7BFA]/60 cursor-pointer bg-[#0D1425] transition-all mb-3 shadow-inner"
        >
          {/* Detailed Street & Radar Layer */}
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80')`
            }}
          />

          {/* Precipitation Radar Simulation Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#2E7BFA]/30 via-emerald-500/20 to-amber-500/30 mix-blend-color-dodge opacity-80" />
          
          {/* Radar scan radial sweep effect */}
          <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(46,123,250,0.4)_70%,transparent_100%)] animate-pulse" />

          {/* Top Left Badge: Rain Forecast Map */}
          <div className="absolute top-2.5 left-2.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-semibold text-white border border-white/10 flex items-center gap-1.5 shadow-md">
            <span className="w-2 h-2 rounded-full bg-[#2E7BFA] animate-ping" />
            <span>{mapData?.title || 'Rain Forecast Map'}</span>
          </div>

          {/* Center Play & Expand Icon on Hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
            <div className="w-11 h-11 rounded-full bg-[#2E7BFA] text-white flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
              <Maximize2 className="w-5 h-5" />
            </div>
          </div>

          {/* Bottom Right Badge: Tomorrow, 6 PM */}
          <div className="absolute bottom-2.5 right-2.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-medium text-white border border-white/10 font-mono shadow-md flex items-center gap-1">
            <span>{mapData?.timeBadge || 'Tomorrow, 6 PM'}</span>
          </div>

          {/* City label on map */}
          <div className="absolute bottom-2.5 left-2.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-[#afc6ff] font-medium border border-white/5">
            {mapData?.location || '—'}
          </div>
        </div>

        {/* Disclaimer + evidence footer */}
        {(dataMode === 'demo' || disclaimer || evidenceCount !== undefined) && (
          <div className="text-[10px] text-[#8B95A8] leading-snug mb-3 px-2">
            {dataMode === 'demo' && <span className="text-amber-300/90 font-medium">DEMO data — deterministic fixture, not a live observation. </span>}
            {disclaimer && <span>{disclaimer} </span>}
            {evidenceCount !== undefined && evidenceCount > 0 && (
              <span>Grounded in {evidenceCount} evidence item(s){llmUsed ? '' : ' — deterministic answer (no LLM)'}. </span>
            )}
            {dataSourceLabel && <span>Source: {dataSourceLabel}</span>}
          </div>
        )}

        {/* Source and Trust Tag - NEVER OMITTED */}
        <div className="flex items-center justify-between text-[11px] text-[#8B95A8] pt-2 border-t border-[#1F2A44]/60">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[#F5F7FA]">Source:</span>
            <span className="text-[#afc6ff]">{source.name || 'Unknown source'}</span>
            <span className="text-[#8B95A8]">•</span>
            <span>as of {source.updatedAt ? new Date(source.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</span>
          </div>
          <span className="text-[10px] text-[#4CAF50] font-medium hidden sm:inline-flex items-center gap-1">
            ✓ Evidence-backed
          </span>
        </div>

      </div>
    </div>
  );
};
