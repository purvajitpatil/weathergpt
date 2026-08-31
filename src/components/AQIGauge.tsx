import React from 'react';
import { Wind, ShieldCheck, Activity, Info } from 'lucide-react';
import { AQIData } from '../types';

interface AQIGaugeProps {
  data: AQIData;
  onOpenDetails?: () => void;
}

export const AQIGauge: React.FC<AQIGaugeProps> = ({ data, onOpenDetails }) => {
  const { value, label, location, updatedAt } = data;

  // AQI color calculation
  const getAQIColor = (val: number) => {
    if (val <= 50) return { stroke: '#4CAF50', text: 'text-[#4CAF50]', bg: 'bg-[#4CAF50]/15' };
    if (val <= 100) return { stroke: '#F59E0B', text: 'text-amber-400', bg: 'bg-amber-500/15' };
    if (val <= 200) return { stroke: '#F97316', text: 'text-orange-400', bg: 'bg-orange-500/15' };
    if (val <= 300) return { stroke: '#EF4444', text: 'text-red-500', bg: 'bg-red-500/15' };
    return { stroke: '#8B5CF6', text: 'text-purple-400', bg: 'bg-purple-500/15' };
  };

  const aqiTheme = getAQIColor(value);
  
  // Calculate percentage of 300 max for gauge
  const percentage = Math.min(Math.round((value / 300) * 100), 100);
  const strokeDashoffset = 100 - percentage;

  return (
    <div 
      id="aqi-gauge-card"
      onClick={onOpenDetails}
      className="bg-[#141B2E] border border-[#1F2A44] hover:border-[#2E7BFA]/40 rounded-xl p-4 shadow-lg transition-all cursor-pointer group"
    >
      {/* Title */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1F2A44]">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#2E7BFA]" />
          <span className="text-xs font-bold text-[#F5F7FA] tracking-wide uppercase font-['Manrope']">
            Air Quality Index
          </span>
        </div>
        <button 
          className="text-[#8B95A8] hover:text-[#2E7BFA] transition-colors p-0.5"
          title="View Pollutant Breakdown"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Gauge & Info Row */}
      <div className="flex items-center justify-between gap-4">
        
        {/* Circular Gauge */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            {/* Background Track */}
            <path
              className="text-[#1F2A44]"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeDasharray="100, 100"
              strokeWidth="3.5"
            />
            {/* Progress Arc */}
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={aqiTheme.stroke}
              strokeDasharray={`${percentage}, 100`}
              strokeWidth="3.5"
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className={`text-xl sm:text-2xl font-extrabold tracking-tight font-['Manrope'] ${aqiTheme.text}`}>
              {value}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${aqiTheme.text}`}>
              {label}
            </span>
          </div>
        </div>

        {/* Location & Status Info */}
        <div className="flex-1 text-right">
          <div className="text-sm font-bold text-[#F5F7FA]">
            {location}
          </div>
          <div className="text-[11px] text-[#8B95A8] mt-0.5 font-mono">
            Last updated {updatedAt}
          </div>
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1F2A44] text-[#afc6ff] group-hover:bg-[#2E7BFA]/20 group-hover:text-white transition-colors">
            <span>PM2.5: {data.pm25} µg/m³</span>
          </div>
        </div>

      </div>

      {/* Advisory Bar */}
      <div className="mt-3 pt-2.5 border-t border-[#1F2A44]/60 text-[11px] text-[#8B95A8] flex items-center justify-between">
        <span className="truncate max-w-[200px]">{data.advice || 'Air quality is satisfactory'}</span>
        <span className="text-[#2E7BFA] text-[10px] font-medium shrink-0 group-hover:underline">
          Details →
        </span>
      </div>
    </div>
  );
};
