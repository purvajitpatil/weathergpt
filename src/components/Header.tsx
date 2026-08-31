import React, { useState } from 'react';
import { Cloud, Globe, ChevronDown, Check, Sparkles, Smartphone, Monitor } from 'lucide-react';
import { LanguageOption } from '../types';

interface HeaderProps {
  currentLanguage: string;
  onLanguageChange: (langCode: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  mobilePreviewMode: boolean;
  onToggleMobilePreview: () => void;
  dataMode?: 'live' | 'demo';
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
];

export const Header: React.FC<HeaderProps> = ({
  currentLanguage,
  onLanguageChange,
  activeTab,
  onTabChange,
  mobilePreviewMode,
  onToggleMobilePreview,
  dataMode
}) => {
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const selectedLang = LANGUAGES.find(l => l.code === currentLanguage) || LANGUAGES[0];

  return (
    <header className="sticky top-0 z-40 bg-[#0B1120]/90 backdrop-blur-md border-b border-[#1F2A44] transition-all">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Logo & Tagline */}
        <div className="flex items-center gap-3">
          <div 
            id="brand-logo-btn"
            onClick={() => onTabChange('Dashboard')} 
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#141B2E] to-[#1F2A44] border border-[#2E7BFA]/40 flex items-center justify-center shadow-lg shadow-[#2E7BFA]/10 group-hover:border-[#2E7BFA] transition-all">
              <Cloud className="w-6 h-6 text-[#2E7BFA] fill-[#2E7BFA]/20 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-[#F5F7FA] font-['Manrope']">
                  Weather<span className="text-[#2E7BFA]">GPT</span>
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2E7BFA]/15 text-[#2E7BFA] border border-[#2E7BFA]/30">
                  AI v2.4
                </span>
                {dataMode === 'demo' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40" title="Currently serving clearly-labeled demo fixture data">
                    DEMO
                  </span>
                )}
                {dataMode === 'live' && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/40" title="Live provider connected">
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#8B95A8] hidden sm:block">National Weather Intelligence & Forecasting</p>
            </div>
          </div>
        </div>

        {/* Center Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-[#141B2E]/60 p-1 rounded-xl border border-[#1F2A44]/80">
          {['Dashboard', 'Forecast', 'Radar', 'History'].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                id={`nav-tab-${tab.toLowerCase()}`}
                onClick={() => onTabChange(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#2E7BFA] text-white shadow-md shadow-[#2E7BFA]/25'
                    : 'text-[#8B95A8] hover:text-[#F5F7FA] hover:bg-[#1F2A44]/50'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {/* Right Section: Mobile Toggle, Language Switcher, Profile */}
        <div className="flex items-center gap-3">
          
          {/* Responsive Layout Toggle */}
          <button
            id="mobile-layout-toggle-btn"
            onClick={onToggleMobilePreview}
            title={mobilePreviewMode ? "Switch to Full Desktop View" : "Simulate Mobile App Card View"}
            className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              mobilePreviewMode
                ? 'bg-[#2E7BFA]/15 border-[#2E7BFA] text-[#afc6ff]'
                : 'bg-[#141B2E] border-[#1F2A44] text-[#8B95A8] hover:text-[#F5F7FA]'
            }`}
          >
            {mobilePreviewMode ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-[#2E7BFA]" />
                <span>Desktop Grid</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-[#2E7BFA]" />
                <span>Mobile View</span>
              </>
            )}
          </button>

          {/* Language Switcher Dropdown */}
          <div className="relative">
            <button
              id="header-language-switcher-btn"
              onClick={() => setLangDropdownOpen(!langDropdownOpen)}
              className="flex items-center gap-2 bg-[#141B2E] hover:bg-[#1F2A44] border border-[#1F2A44] text-[#F5F7FA] px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm"
            >
              <Globe className="w-3.5 h-3.5 text-[#2E7BFA]" />
              <span>{selectedLang.name}</span>
              <span className="text-[#8B95A8] text-[10px]">({selectedLang.nativeName})</span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#8B95A8] transition-transform ${langDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {langDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setLangDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-52 bg-[#141B2E] border border-[#1F2A44] rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8B95A8] border-b border-[#1F2A44]">
                    Select Language / भाषा
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {LANGUAGES.map((lang) => {
                      const isSelected = lang.code === currentLanguage;
                      return (
                        <button
                          key={lang.code}
                          id={`lang-option-${lang.code}`}
                          onClick={() => {
                            onLanguageChange(lang.code);
                            setLangDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                            isSelected 
                              ? 'bg-[#2E7BFA]/20 text-[#2E7BFA] font-semibold' 
                              : 'text-[#F5F7FA] hover:bg-[#1F2A44]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{lang.name}</span>
                            <span className="text-[#8B95A8] text-[11px]">({lang.nativeName})</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#4CAF50]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Profile Avatar with Source Status */}
          <div className="relative flex items-center">
            <div className="w-8 h-8 rounded-full border border-[#2E7BFA]/40 overflow-hidden bg-[#141B2E] p-0.5 relative group cursor-pointer">
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#2E7BFA] bg-[#141B2E]">
                W
              </div>
              <span
                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0B1120]"
                style={{ backgroundColor: dataMode === 'demo' ? '#B8860B' : '#4CAF50' }}
                title={dataMode === 'demo' ? 'DEMO data (fixture, clearly labeled)' : dataMode === 'live' ? 'Live provider connected' : 'Connecting to data provider…'}
              />
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
