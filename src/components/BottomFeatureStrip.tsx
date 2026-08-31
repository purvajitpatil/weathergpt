import React, { useState, useEffect } from 'react';
import { 
  Languages, 
  Check, 
  Mic, 
  MicOff, 
  Volume2, 
  Tractor, 
  Truck, 
  HardHat, 
  PartyPopper, 
  Users, 
  Umbrella, 
  ShieldAlert, 
  Droplets, 
  Sprout, 
  SunMedium, 
  Database, 
  Cpu, 
  Layers, 
  ArrowRight,
  Sparkles,
  Radio
} from 'lucide-react';
import { LANGUAGES } from './Header';

interface BottomFeatureStripProps {
  currentLanguage: string;
  onLanguageChange: (lang: string) => void;
  voiceState: 'idle' | 'listening' | 'processing' | 'unsupported';
  onToggleVoice: () => void;
  onSelectRecommendation?: (text: string) => void;
  onSelectUseCase?: (useCase: string) => void;
}

export const BottomFeatureStrip: React.FC<BottomFeatureStripProps> = ({
  currentLanguage,
  onLanguageChange,
  voiceState,
  onToggleVoice,
  onSelectRecommendation,
  onSelectUseCase,
}) => {
  const [activeArchStep, setActiveArchStep] = useState(1);

  // Auto-cycle architecture highlights for subtle dynamism
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveArchStep((prev) => (prev % 3) + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full mt-8 pt-8 border-t border-[#1F2A44]">
      
      {/* 5 Equal Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Column 1: Multi-language Support */}
        <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-[#2E7BFA]/40 transition-all">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#2E7BFA]/15 flex items-center justify-center text-[#2E7BFA]">
                <Languages className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                Multi-Language Support
              </h3>
            </div>
            <p className="text-[11px] text-[#8B95A8] mb-3 leading-relaxed">
              Localized weather intelligence across Indic languages & vernacular dialects.
            </p>

            {/* Language Pills with Green Check */}
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {LANGUAGES.map((lang) => {
                const isSelected = lang.code === currentLanguage;
                return (
                  <button
                    key={lang.code}
                    id={`strip-lang-${lang.code}`}
                    onClick={() => onLanguageChange(lang.code)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between border transition-all ${
                      isSelected
                        ? 'bg-[#4CAF50]/15 border-[#4CAF50] text-white font-semibold'
                        : 'bg-[#0B1120]/60 border-[#1F2A44] text-[#8B95A8] hover:text-[#F5F7FA] hover:border-white/20'
                    }`}
                  >
                    <span className="truncate">{lang.nativeName}</span>
                    {isSelected && <Check className="w-3 h-3 text-[#4CAF50] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-[#4CAF50] mt-3 pt-2 border-t border-[#1F2A44] flex items-center gap-1 font-mono">
            <span>● Dynamic LLM translation active</span>
          </div>
        </div>

        {/* Column 2: Voice Interaction */}
        <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-[#2E7BFA]/40 transition-all text-center">
          <div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#2E7BFA]/15 flex items-center justify-center text-[#2E7BFA]">
                <Volume2 className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                Voice Interaction
              </h3>
            </div>
            <p className="text-[11px] text-[#8B95A8] mb-3">
              Hands-free voice queries in regional languages with speech synthesis.
            </p>

            {/* Waveform Visualization */}
            <div className="h-12 bg-[#0B1120]/70 border border-[#1F2A44] rounded-xl flex items-center justify-center gap-1 px-3 mb-4 overflow-hidden">
              {[0.4, 0.8, 1.2, 0.6, 1.5, 0.9, 1.3, 0.7, 1.1, 0.5, 1.4, 0.8, 0.5].map((h, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full transition-all duration-200 ${
                    voiceState === 'listening'
                      ? 'bg-[#2E7BFA] animate-wave-bar'
                      : voiceState === 'processing'
                      ? 'bg-amber-400 animate-pulse'
                      : voiceState === 'unsupported'
                      ? 'bg-red-400/60'
                      : 'bg-[#1F2A44]'
                  }`}
                  style={{
                    height: voiceState === 'listening' ? `${Math.min(100, h * 24)}px` : '6px',
                    animationDelay: `${i * 0.08}s`
                  }}
                />
              ))}
            </div>

            {/* Large Circular Mic Button */}
            <div className="flex flex-col items-center justify-center">
              <div className="relative">
                {voiceState === 'listening' && (
                  <span className="absolute -inset-2 rounded-full bg-[#2E7BFA]/30 animate-ping" />
                )}
                <button
                  id="bottom-voice-mic-btn"
                  onClick={onToggleVoice}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all shadow-xl ${
                    voiceState === 'listening'
                      ? 'bg-red-500 scale-105 shadow-red-500/30'
                      : voiceState === 'processing'
                      ? 'bg-amber-500 animate-pulse'
                      : voiceState === 'unsupported'
                      ? 'bg-[#1F2A44] opacity-60 cursor-not-allowed'
                      : 'bg-[#2E7BFA] hover:bg-[#2563EB] shadow-[#2E7BFA]/30 hover:scale-105'
                  }`}
                >
                  {voiceState === 'listening' ? (
                    <MicOff className="w-6 h-6 animate-bounce" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
              </div>

              <span className="text-xs font-semibold mt-2.5 text-[#F5F7FA]">
                {voiceState === 'listening' ? (
                  <span className="text-red-400 animate-pulse font-mono">Listening… Tap to stop</span>
                ) : voiceState === 'processing' ? (
                  <span className="text-amber-300 font-mono">Processing audio...</span>
                ) : voiceState === 'unsupported' ? (
                  <span className="text-red-300 font-mono text-[10px]">Voice not supported in this browser. Use text input.</span>
                ) : (
                  'Tap to speak / बोलें'
                )}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-[#8B95A8] mt-3 pt-2 border-t border-[#1F2A44] font-mono">
            Web Speech API + browser TTS (when supported)
          </div>
        </div>

        {/* Column 3: Use Cases */}
        <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-[#2E7BFA]/40 transition-all">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#2E7BFA]/15 flex items-center justify-center text-[#2E7BFA]">
                <Users className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                Sector Use Cases
              </h3>
            </div>
            <p className="text-[11px] text-[#8B95A8] mb-3 leading-relaxed">
              Tailored decision frameworks for industries and everyday life:
            </p>

            <ul className="space-y-1.5 text-xs text-[#F5F7FA]">
              <li 
                onClick={() => onSelectUseCase?.('Farmers')}
                className="flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] cursor-pointer transition-colors border border-transparent hover:border-[#2E7BFA]/30"
              >
                <Tractor className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold block text-[11px]">Farmers & Agri</span>
                  <span className="text-[10px] text-[#8B95A8] block truncate">Sowing windows & irrigation alerts</span>
                </div>
              </li>

              <li 
                onClick={() => onSelectUseCase?.('Logistics')}
                className="flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] cursor-pointer transition-colors border border-transparent hover:border-[#2E7BFA]/30"
              >
                <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold block text-[11px]">Logistics & Fleet</span>
                  <span className="text-[10px] text-[#8B95A8] block truncate">Highway fog & storm routing</span>
                </div>
              </li>

              <li 
                onClick={() => onSelectUseCase?.('Construction')}
                className="flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] cursor-pointer transition-colors border border-transparent hover:border-[#2E7BFA]/30"
              >
                <HardHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold block text-[11px]">Construction</span>
                  <span className="text-[10px] text-[#8B95A8] block truncate">High-wind crane & concrete safety</span>
                </div>
              </li>

              <li 
                onClick={() => onSelectUseCase?.('Event Planners')}
                className="flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] cursor-pointer transition-colors border border-transparent hover:border-[#2E7BFA]/30"
              >
                <PartyPopper className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold block text-[11px]">Event Planners</span>
                  <span className="text-[10px] text-[#8B95A8] block truncate">Outdoor venues & waterproofing</span>
                </div>
              </li>

              <li 
                onClick={() => onSelectUseCase?.('Daily Life')}
                className="flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] cursor-pointer transition-colors border border-transparent hover:border-[#2E7BFA]/30"
              >
                <Umbrella className="w-3.5 h-3.5 text-[#2E7BFA] shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold block text-[11px]">Daily Life</span>
                  <span className="text-[10px] text-[#8B95A8] block truncate">Commute, clothing & outdoor plans</span>
                </div>
              </li>
            </ul>
          </div>

          <div className="text-[10px] text-[#8B95A8] mt-3 pt-2 border-t border-[#1F2A44] font-mono">
            Select any use case to run analysis
          </div>
        </div>

        {/* Column 4: Smart Recommendations */}
        <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-[#2E7BFA]/40 transition-all">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#2E7BFA]/15 flex items-center justify-center text-[#2E7BFA]">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                Smart Recommendations
              </h3>
            </div>
            <p className="text-[11px] text-[#8B95A8] mb-3 leading-relaxed">
              Automated advisories derived from the evidence-based weather pipeline:
            </p>

            <div className="space-y-1.5">
              {[
                { label: 'Carry umbrella today', icon: Umbrella, color: 'text-[#2E7BFA]', query: 'Should I carry an umbrella today?' },
                { label: 'Avoid open spaces (Lightning)', icon: ShieldAlert, color: 'text-amber-400', query: 'Is there a lightning hazard nearby?' },
                { label: 'Postpone irrigation (Rain > 70%)', icon: Droplets, color: 'text-blue-300', query: 'Should I postpone field irrigation?' },
                { label: 'Good time for kharif sowing', icon: Sprout, color: 'text-emerald-400', query: 'Is it a good window for sowing crops?' },
                { label: 'High UV: Sunscreen required', icon: SunMedium, color: 'text-yellow-400', query: 'What is the UV index right now?' }
              ].map((rec, i) => {
                const Icon = rec.icon;
                return (
                  <button
                    key={i}
                    id={`rec-item-${i}`}
                    onClick={() => onSelectRecommendation?.(rec.query)}
                    className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-[#0B1120]/50 hover:bg-[#1F2A44] border border-[#1F2A44]/50 hover:border-[#2E7BFA]/40 text-left text-xs transition-all group"
                  >
                    <Icon className={`w-3.5 h-3.5 ${rec.color} shrink-0 group-hover:scale-110 transition-transform`} />
                    <span className="text-[#F5F7FA] group-hover:text-white text-[11px] font-medium truncate">
                      {rec.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[10px] text-[#2E7BFA] mt-3 pt-2 border-t border-[#1F2A44] font-mono">
            Tap recommendation to query
          </div>
        </div>

        {/* Column 5: Our Architecture */}
        <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 flex flex-col justify-between shadow-md hover:border-[#2E7BFA]/40 transition-all">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-[#2E7BFA]/15 flex items-center justify-center text-[#2E7BFA]">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                Our Architecture
              </h3>
            </div>
            <p className="text-[11px] text-[#8B95A8] mb-3 leading-relaxed">
              Evidence-grounded pipeline uniting forecast data with explainable reasoning:
            </p>

            {/* 3-Node Architecture Interactive Diagram */}
            <div className="space-y-1.5">
              
              {/* Node 1: Data Sources */}
              <div 
                className={`p-2.5 rounded-xl border transition-all ${
                  activeArchStep === 1
                    ? 'bg-[#2E7BFA]/15 border-[#2E7BFA] shadow-md shadow-[#2E7BFA]/10'
                    : 'bg-[#0B1120]/60 border-[#1F2A44]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Database className="w-3.5 h-3.5 text-[#2E7BFA]" />
                  <span className="text-[11px] font-bold text-white">Data Sources</span>
                </div>
                <div className="text-[9px] text-[#8B95A8] leading-tight pl-5">
                  Open-Meteo forecast models (live) · clearly-labeled demo fixtures (offline)
                </div>
              </div>

              <div className="flex justify-center -my-0.5">
                <div className="flex flex-col items-center">
                  <span className="text-[#2E7BFA] text-[10px]">▼</span>
                </div>
              </div>

              {/* Node 2: AI Engine */}
              <div 
                className={`p-2.5 rounded-xl border transition-all ${
                  activeArchStep === 2
                    ? 'bg-[#2E7BFA]/15 border-[#2E7BFA] shadow-md shadow-[#2E7BFA]/10'
                    : 'bg-[#0B1120]/60 border-[#1F2A44]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] font-bold text-white">AI Engine</span>
                  <span className="text-[8px] font-mono text-[#4CAF50] bg-[#4CAF50]/10 px-1 rounded">RAG+LLM</span>
                </div>
                <div className="text-[9px] text-[#8B95A8] leading-tight pl-5">
                  Gemini Tool-Calling, XGBoost Risk Classifier, Safety Validator, Multi-Language Translation
                </div>
              </div>

              <div className="flex justify-center -my-0.5">
                <div className="flex flex-col items-center">
                  <span className="text-[#2E7BFA] text-[10px]">▼</span>
                </div>
              </div>

              {/* Node 3: User Interface */}
              <div 
                className={`p-2.5 rounded-xl border transition-all ${
                  activeArchStep === 3
                    ? 'bg-[#2E7BFA]/15 border-[#2E7BFA] shadow-md shadow-[#2E7BFA]/10'
                    : 'bg-[#0B1120]/60 border-[#1F2A44]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Layers className="w-3.5 h-3.5 text-[#4CAF50]" />
                  <span className="text-[11px] font-bold text-white">User Interface</span>
                </div>
                <div className="text-[9px] text-[#8B95A8] leading-tight pl-5">
                  Web Dashboard, Mobile PWA, Voice交互, Real-Time SSE Alerts, 8 Indic Languages
                </div>
              </div>

            </div>
          </div>

          <div className="text-[10px] text-[#4CAF50] mt-3 pt-2 border-t border-[#1F2A44] font-mono flex items-center justify-between">
            <span>Latency: &lt; 250ms</span>
            <span>Transparent sourcing</span>
          </div>
        </div>

      </div>

    </div>
  );
};
