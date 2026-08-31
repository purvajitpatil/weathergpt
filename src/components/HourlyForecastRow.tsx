import React from 'react';
import { Sun, Cloud, CloudRain, CloudDrizzle, CloudLightning, Moon, CloudSun } from 'lucide-react';

interface HourlyItem {
  time: string;
  temp: number;
  icon: string;
  pop: number; // probability of precipitation
}

interface HourlyForecastRowProps {
  data: HourlyItem[];
}

const getIcon = (iconName: string, className: string = 'w-5 h-5') => {
  switch (iconName) {
    case 'sun': return <Sun className={`${className} text-amber-400`} />;
    case 'moon': return <Moon className={`${className} text-indigo-300`} />;
    case 'cloud': return <Cloud className={`${className} text-[#afc6ff]`} />;
    case 'cloud-sun': return <CloudSun className={`${className} text-amber-300`} />;
    case 'cloud-rain': return <CloudRain className={`${className} text-[#2E7BFA]`} />;
    case 'cloud-drizzle': return <CloudDrizzle className={`${className} text-blue-300`} />;
    case 'cloud-heavy-rain': return <CloudRain className={`${className} text-blue-500`} />;
    case 'cloud-lightning': return <CloudLightning className={`${className} text-amber-400`} />;
    default: return <Cloud className={`${className} text-[#afc6ff]`} />;
  }
};

export const HourlyForecastRow: React.FC<HourlyForecastRowProps> = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-[10px] text-[#8B95A8] uppercase font-semibold tracking-wider mb-1.5 px-0.5">
        Hourly Forecast
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {data.map((item, idx) => {
          const isHighPop = item.pop >= 60;
          return (
            <div
              key={idx}
              className={`flex flex-col items-center gap-1 py-2 px-2.5 rounded-xl border shrink-0 min-w-[56px] transition-all ${
                isHighPop
                  ? 'bg-[#2E7BFA]/10 border-[#2E7BFA]/30'
                  : 'bg-black/30 border-white/5'
              }`}
            >
              <span className="text-[10px] text-[#8B95A8] font-medium">{item.time}</span>
              {getIcon(item.icon, 'w-4.5 h-4.5')}
              <span className="text-xs font-bold text-[#F5F7FA]">{item.temp}°</span>
              {item.pop > 0 && (
                <span className={`text-[9px] font-mono font-medium ${
                  isHighPop ? 'text-[#2E7BFA]' : 'text-[#8B95A8]'
                }`}>
                  {item.pop}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
