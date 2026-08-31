import React from 'react';
import { Radio, Sparkles, MapPin, ShieldCheck, Heart, Cloud } from 'lucide-react';

export const FooterTrustBar: React.FC = () => {
  return (
    <footer className="w-full bg-[#0B0E15] border-t border-[#1F2A44] mt-12 py-10 text-xs text-[#8B95A8]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        
        {/* 5 Trust Badges Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pb-8 border-b border-[#1F2A44]/80">
          
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141B2E]/40 border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-[#2E7BFA]/10 border border-[#2E7BFA]/20 flex items-center justify-center text-[#2E7BFA]">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#F5F7FA] text-xs">Real-Time Data</div>
              <div className="text-[10px] text-[#8B95A8]">Open-Meteo · DEMO fixtures</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141B2E]/40 border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#F5F7FA] text-xs">AI Powered</div>
              <div className="text-[10px] text-[#8B95A8]">Frontier Gemini LLM</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141B2E]/40 border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-[#4CAF50]/10 border border-[#4CAF50]/20 flex items-center justify-center text-[#4CAF50]">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#F5F7FA] text-xs">Hyper-Local</div>
              <div className="text-[10px] text-[#8B95A8]">Pincode & Ward level</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141B2E]/40 border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#F5F7FA] text-xs">Secure & Reliable</div>
              <div className="text-[10px] text-[#8B95A8]">Deterministic fallbacks</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141B2E]/40 border border-white/5 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-[#F5F7FA] text-xs">Built for Bharat</div>
              <div className="text-[10px] text-[#8B95A8]">12+ Indian languages</div>
            </div>
          </div>

        </div>

        {/* Brand & Links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Cloud className="w-5 h-5 text-[#2E7BFA]" />
              <span className="font-extrabold text-base text-[#F5F7FA] font-['Manrope']">WeatherGPT</span>
            </div>
            <p className="text-xs text-[#8B95A8] max-w-md mb-2">
              © 2026 WeatherGPT Intelligence. Precise, local, and reliable meteorological forecasting for citizens, agriculture, logistics, and smart cities.
            </p>
            <p className="text-[11px] text-[#afc6ff]/70 italic">
              WeatherGPT — Because weather is better understood when it talks to you.
            </p>
            <p className="text-[11px] text-[#8B95A8]/70 mt-1">
              Data sourced from Open-Meteo forecast models when live; otherwise clearly-labeled demo fixtures. Not an official IMD product.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-bold text-[#F5F7FA] text-xs mb-1">Legal & Compliance</span>
            <a href="#privacy" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">Privacy Policy</a>
            <a href="#terms" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">Terms of Service</a>
            <a href="#disclaimer" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">Meteorological Advisory Disclaimer</a>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-bold text-[#F5F7FA] text-xs mb-1">Developers & Support</span>
            <a href="#api" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">API Documentation</a>
            <a href="#support" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">Contact Support</a>
            <a href="#status" onClick={(e) => e.preventDefault()} className="hover:text-[#2E7BFA] transition-colors">System Status: All Operational</a>
          </div>
        </div>

      </div>
    </footer>
  );
};
