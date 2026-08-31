import React from 'react';
import { AlertTriangle, AlertCircle, ShieldAlert, ArrowRight } from 'lucide-react';
import { AlertItem } from '../types';

interface AlertCardProps {
  alert: AlertItem;
  onClick?: (alert: AlertItem) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onClick }) => {
  const isCritical = alert.severity === 'critical';

  return (
    <div
      id={`alert-card-${alert.id}`}
      onClick={() => onClick?.(alert)}
      className={`relative rounded-xl p-3.5 border transition-all cursor-pointer group shadow-md ${
        isCritical
          ? 'bg-[#C0392B]/10 hover:bg-[#C0392B]/20 border-[#C0392B]/40 hover:border-[#C0392B]'
          : 'bg-[#B8860B]/10 hover:bg-[#B8860B]/20 border-[#B8860B]/40 hover:border-[#B8860B]'
      }`}
    >
      {/* Header: Icon + Title + Severity Pill */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          {isCritical ? (
            <AlertTriangle className="w-4 h-4 text-[#C0392B] shrink-0 fill-[#C0392B]/20 animate-pulse" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 fill-amber-400/20" />
          )}
          <span
            className={`text-xs font-bold tracking-tight uppercase ${
              isCritical ? 'text-[#ffb4ab]' : 'text-amber-300'
            }`}
          >
            {alert.title}
          </span>
        </div>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
            isCritical
              ? 'bg-[#C0392B]/30 text-[#ffb4ab] border border-[#C0392B]/50'
              : 'bg-[#B8860B]/30 text-amber-300 border border-[#B8860B]/50'
          }`}
        >
          {alert.severity}
        </span>
      </div>

      {/* Location */}
      <div className="text-xs font-semibold text-[#F5F7FA] mb-1">
        {alert.location}
      </div>

      {/* Message */}
      <p className="text-[12px] text-[#8B95A8] leading-relaxed mb-3 group-hover:text-[#c2c6d7] transition-colors">
        {alert.message}
      </p>

      {/* Footer: Source + Relative Time + Tap to view */}
      <div className="flex items-center justify-between text-[10px] text-[#8B95A8] border-t border-white/5 pt-2">
        <div className="flex items-center gap-1 font-mono">
          <span>Source: {alert.source || '—'}</span>
        </div>
        <div className="flex items-center gap-1 font-medium group-hover:text-white transition-colors">
          <span>{alert.timestampRelative}</span>
          <ArrowRight className="w-2.5 h-2.5 transform group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};
