import React, { useState, useEffect, useRef } from 'react';
import { 
  Header 
} from './components/Header';
import { 
  QuickPrompts 
} from './components/QuickPrompts';
import { 
  MobilePreviewCard 
} from './components/MobilePreviewCard';
import { 
  AssistantAnswerCard 
} from './components/AssistantAnswerCard';
import { 
  AlertCard 
} from './components/AlertCard';
import { 
  AQIGauge 
} from './components/AQIGauge';
import { 
  BottomFeatureStrip 
} from './components/BottomFeatureStrip';
import { 
  FooterTrustBar 
} from './components/FooterTrustBar';
import { 
  MobileBottomNav 
} from './components/MobileBottomNav';
import { 
  MapModal, 
  AlertDetailModal, 
  SetAlertModal, 
  MoreDetailsModal 
} from './components/Modals';
import { 
  ChatMessage, 
  LocationWeather, 
  AlertItem, 
  AQIData, 
  WeatherStats 
} from './types';
import { 
  api, 
  mapChatToStructured, 
  mapWeatherToLocationWeather, 
  mapAlertsToItems, 
  mapAqi 
} from './lib/api';
import { 
  Mic, 
  MicOff, 
  ArrowUp, 
  Sparkles
} from 'lucide-react';

const DEFAULT_CITY = 'Pune';

// Neutral loading placeholder — real values are fetched from /api/v1 on mount.
const PLACEHOLDER_LOCATION: LocationWeather = {
  city: DEFAULT_CITY,
  state: '',
  country: '',
  temp: NaN,
  feelsLike: NaN,
  condition: 'loading live/demo data…',
  high: NaN,
  low: NaN,
  humidity: 0,
  windSpeed: 0,
  aqi: 0,
  aqiLabel: 'Good',
  banner: undefined,
  bgImage: undefined,
};

const INITIAL_ALERTS: AlertItem[] = [];

const INITIAL_AQI: AQIData | null = null;

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome',
    sender: 'assistant',
    text: 'Ask about current weather, forecasts, alerts, air quality, or crops (e.g. soybean) — I will answer using real Open-Meteo data when available, or clearly labeled demo fixtures offline.',
    timestamp: '10:14 AM'
  }
];

export default function App() {
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [activeTab, setActiveTab] = useState<string>('Dashboard');
  const [mobilePreviewMode, setMobilePreviewMode] = useState<boolean>(false);
  const [activeMobileNav, setActiveMobileNav] = useState<string>('Home');
  
  // Data States
  const [weather, setWeather] = useState<LocationWeather>(PLACEHOLDER_LOCATION);
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [aqi, setAqi] = useState<AQIData | null>(INITIAL_AQI);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [dataMode, setDataMode] = useState<'live' | 'demo' | undefined>(undefined);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(true);
  
  // Chat composer state
  const [inputText, setInputText] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  
  // Voice state
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'unsupported'>('idle');
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);

  // Modals state
  const [mapModalOpen, setMapModalOpen] = useState<boolean>(false);
  const [selectedAlertForModal, setSelectedAlertForModal] = useState<AlertItem | null>(null);
  const [setAlertModalOpen, setSetAlertModalOpen] = useState<boolean>(false);
  const [moreDetailsModalOpen, setMoreDetailsModalOpen] = useState<boolean>(false);
  const [activeStatsForModal, setActiveStatsForModal] = useState<WeatherStats>({
    rainChance: 0, tempMax: 0, tempMin: 0, wind: 0, humidity: 0, cloudCover: 0,
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isAiLoading]);

  // Load system meta + default-location weather on mount (honest: from the API)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await api.meta();
        if (!cancelled) setDataMode(meta.mode);
      } catch { /* offline — leave undefined */ }

      try {
        const data = await api.weather(DEFAULT_CITY);
        if (cancelled) return;
        setWeather(mapWeatherToLocationWeather(data));
        if (!dataMode) setDataMode(data.mode);
        setAlerts(mapAlertsToItems(data.alerts));
        setAqi(mapAqi(data.aqi));
      } catch (err) {
        console.error('Failed to load weather:', err);
      } finally {
        if (!cancelled) setIsWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Handle location switch
  const handleLocationChange = async (cityName: string) => {
    setIsWeatherLoading(true);
    try {
      const data = await api.weather(cityName);
      setWeather(mapWeatherToLocationWeather(data));
      setDataMode(data.mode);
      setAlerts(mapAlertsToItems(data.alerts));
      setAqi(mapAqi(data.aqi));
    } catch (e) {
      console.error("Error fetching location data:", e);
    } finally {
      setIsWeatherLoading(false);
    }
  };

  // Send message to backend (v1 chat, deterministic or LLM-grounded)
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isAiLoading) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: timeStr
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsAiLoading(true);

    const locationLabel = weather.city ? `${weather.city}, ${weather.state || ''}`.replace(/,\s*$/, '') : DEFAULT_CITY;

    try {
      const { data } = await api.chat(query, locationLabel, currentLanguage);
      const structured = mapChatToStructured(data);

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        structuredData: structured,
        timestamp: timeStr
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setActiveStatsForModal(structured.stats);
      if (data.mode) setDataMode(data.mode);

      // Optional text to speech feedback if the user asked via voice
      if (voiceState === 'listening' || voiceState === 'processing') {
        speakText(structured.summaryText.replace(/\*\*/g, ''));
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Honest fallback — grounded in what we already know, never invented.
      const fallbackMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: `I could not reach the weather service just now. ${Number.isFinite(weather.temp) ? `Latest known conditions for ${weather.city}: ${weather.temp}°C, ${weather.condition}.` : `Please retry in a moment.`}`,
        timestamp: timeStr
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Text to Speech playback
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (currentLanguage === 'hi') utterance.lang = 'hi-IN';
      else if (currentLanguage === 'mr') utterance.lang = 'mr-IN';
      else utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // Real-time Voice Recognition
  const handleToggleVoice = () => {
    if (voiceState === 'listening') {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setVoiceState('idle');
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceState('unsupported');
      setTimeout(() => setVoiceState('idle'), 4000);
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      speechRecognitionRef.current = recognition;
      recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : currentLanguage === 'mr' ? 'mr-IN' : 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setVoiceState('listening');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setVoiceState('processing');
        setInputText(transcript);
        handleSendMessage(transcript);
      };

      recognition.onerror = (err: SpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error:', err);
        setVoiceState('idle');
      };

      recognition.onend = () => {
        setVoiceState('idle');
      };

      recognition.start();
    } catch (e) {
      console.error("Speech recognition initialization error:", e);
      setVoiceState('idle');
    }
  };

  // Get active follow up suggestions from the latest assistant message
  const latestAssistantMessage = [...messages].reverse().find(m => m.sender === 'assistant' && m.structuredData?.followUpSuggestions);
  const followUpChips = latestAssistantMessage?.structuredData?.followUpSuggestions || [
    "Should I carry an umbrella?",
    "How is the weather this weekend?",
    "Air quality in Pune?"
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] text-[#F5F7FA] flex flex-col font-['Geist'] selection:bg-[#2E7BFA]/30 selection:text-white">
      
      {/* Top Navbar */}
      <Header
        currentLanguage={currentLanguage}
        onLanguageChange={(lang) => setCurrentLanguage(lang)}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'Radar') setMapModalOpen(true);
        }}
        mobilePreviewMode={mobilePreviewMode}
        onToggleMobilePreview={() => setMobilePreviewMode(!mobilePreviewMode)}
        dataMode={dataMode}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col">
        
        {/* Quick Prompts Row */}
        <QuickPrompts 
          onSelectPrompt={(p) => handleSendMessage(p)} 
          isLoading={isAiLoading}
        />

        {/* 3-Column Layout or Mobile View */}
        <div className={`grid gap-6 flex-1 ${
          mobilePreviewMode
            ? 'max-w-md mx-auto grid-cols-1'
            : 'grid-cols-1 lg:grid-cols-12'
        }`}>
          
          {/* LEFT COLUMN: Mobile Preview Card (Desktop: 3 or 4 cols) */}
          <div className={`${mobilePreviewMode ? 'w-full' : 'lg:col-span-3'} flex flex-col gap-4`}>
            <MobilePreviewCard
              weather={weather}
              onLocationChange={handleLocationChange}
              onQuickQuery={(q) => handleSendMessage(q)}
            />
          </div>

          {/* CENTER COLUMN: Chat Panel (Desktop: 6 cols) */}
          <div className={`${
            mobilePreviewMode ? 'w-full' : 'lg:col-span-6'
          } bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xl relative min-h-[560px]`}>
            
            {/* Messages Thread */}
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[500px] mb-4 scrollbar-thin"
            >
              {messages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="flex items-start justify-end gap-2.5 my-2 animate-fadeIn">
                      <div className="bg-[#2E7BFA]/20 border border-[#2E7BFA]/40 text-[#F5F7FA] rounded-2xl rounded-tr-none px-4 py-2.5 text-sm max-w-[85%] sm:max-w-[75%] leading-relaxed shadow-sm">
                        {msg.text}
                      </div>
                      <div
                        className="w-7 h-7 rounded-full border border-white/20 mt-1 shrink-0 bg-[#2E7BFA]/20 flex items-center justify-center text-[10px] font-bold text-[#2E7BFA]"
                      >
                        U
                      </div>
                    </div>
                  );
                }

                // Assistant structured block
                if (msg.structuredData) {
                  return (
                    <AssistantAnswerCard
                      key={msg.id}
                      summaryText={msg.structuredData.summaryText}
                      stats={msg.structuredData.stats}
                      recommendation={msg.structuredData.recommendation}
                      source={msg.structuredData.source}
                      mapData={msg.structuredData.mapData}
                      dataMode={msg.structuredData.mode}
                      dataSourceLabel={msg.structuredData.dataSourceLabel}
                      disclaimer={msg.structuredData.disclaimer}
                      evidenceCount={msg.structuredData.evidenceCount}
                      llmUsed={msg.structuredData.llmUsed}
                      onShowMap={() => setMapModalOpen(true)}
                      onMoreDetails={() => {
                        setActiveStatsForModal(msg.structuredData!.stats);
                        setMoreDetailsModalOpen(true);
                      }}
                      onSetAlert={() => setSetAlertModalOpen(true)}
                    />
                  );
                }

                // Plain assistant text (honest fallback / welcome)
                if (msg.text) {
                  return (
                    <div key={msg.id} className="flex items-start gap-2.5 my-2 animate-fadeIn">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#141B2E] to-[#1F2A44] border border-[#2E7BFA]/40 flex items-center justify-center shrink-0 mt-1">
                        <Sparkles className="w-4 h-4 text-[#2E7BFA]" />
                      </div>
                      <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl rounded-tl-none px-4 py-2.5 text-sm max-w-[85%] leading-relaxed text-[#F5F7FA]">
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {/* AI Loading State */}
              {isAiLoading && (
                <div className="flex items-center gap-3 p-4 bg-[#0B1120]/60 border border-[#1F2A44] rounded-2xl animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-[#2E7BFA]/20 border border-[#2E7BFA]/40 flex items-center justify-center text-[#2E7BFA]">
                    <Sparkles className="w-4 h-4 animate-spin" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[#afc6ff]">
                      Analysing weather data and preparing your answer...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Section: Follow-up chips + Composer Input */}
            <div className="mt-auto pt-2 border-t border-[#1F2A44]/60">
              
              {/* Follow-up Suggestion Chips */}
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1.5 scrollbar-none">
                {followUpChips.map((chip, idx) => (
                  <button
                    key={idx}
                    id={`follow-up-chip-${idx}`}
                    onClick={() => handleSendMessage(chip)}
                    className="whitespace-nowrap bg-[#0B1120]/70 hover:bg-[#1F2A44] text-[#8B95A8] hover:text-[#F5F7FA] text-xs px-3 py-1.5 rounded-full border border-[#1F2A44] hover:border-[#2E7BFA]/40 transition-all shrink-0"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Composer Input Bar */}
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="relative flex items-center"
              >
                <input
                  type="text"
                  id="chat-composer-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask anything about weather, rain, crops, or travel..."
                  className="w-full bg-[#0B1120]/90 border border-[#1F2A44] hover:border-[#2E7BFA]/40 focus:border-[#2E7BFA] rounded-full py-3.5 pl-4 pr-24 text-sm text-[#F5F7FA] placeholder-[#8B95A8] focus:outline-none focus:ring-1 focus:ring-[#2E7BFA] transition-all shadow-inner"
                />

                <div className="absolute right-2 flex items-center gap-1.5">
                  
                  {/* Mic Button */}
                  <button
                    type="button"
                    id="chat-mic-btn"
                    onClick={handleToggleVoice}
                    className={`p-2 rounded-full transition-all ${
                      voiceState === 'listening'
                        ? 'bg-red-500 text-white animate-bounce'
                        : 'text-[#8B95A8] hover:text-white hover:bg-[#1F2A44]'
                    }`}
                    title={
                      voiceState === 'listening'
                        ? 'Listening... Tap to stop'
                        : voiceState === 'unsupported'
                        ? 'Voice input is not supported in this browser'
                        : 'Speak voice prompt'
                    }
                  >
                    {voiceState === 'listening' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Send Button */}
                  <button
                    type="submit"
                    id="chat-send-btn"
                    disabled={!inputText.trim() && !isAiLoading}
                    className="w-8 h-8 rounded-full bg-[#2E7BFA] hover:bg-[#2563EB] disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-[#2E7BFA]/30 transition-all hover:scale-105"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>

                </div>
              </form>

            </div>

          </div>

          {/* RIGHT COLUMN: Active Alerts & AQI (Desktop: 3 cols) */}
          <div className={`${mobilePreviewMode ? 'w-full' : 'lg:col-span-3'} flex flex-col gap-4`}>
            
            {/* Active Alerts Rail */}
            <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 shadow-xl flex flex-col">
              
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1F2A44]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#C0392B] animate-ping" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5F7FA] font-['Manrope']">
                    Active Alerts
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-[#8B95A8] bg-[#0B1120] px-1.5 py-0.5 rounded border border-white/5">
                  {alerts.length} Warnings
                </span>
              </div>

              {/* Stacked Severity Alerts */}
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onClick={(a) => setSelectedAlertForModal(a)}
                  />
                ))}
              </div>

            </div>

            {/* AQI Widget */}
            {aqi ? (
              <AQIGauge
                data={aqi}
                onOpenDetails={() => setMoreDetailsModalOpen(true)}
              />
            ) : (
              <div className="bg-[#141B2E] border border-[#1F2A44] rounded-2xl p-4 shadow-xl text-xs text-[#8B95A8]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#F5F7FA] mb-1">Air Quality</div>
                AQI data unavailable for this location in the current configuration.
              </div>
            )}

          </div>

        </div>

        {/* Bottom Feature Strip (5 Columns) */}
        <BottomFeatureStrip
          currentLanguage={currentLanguage}
          onLanguageChange={(l) => setCurrentLanguage(l)}
          voiceState={voiceState}
          onToggleVoice={handleToggleVoice}
          onSelectRecommendation={(rec) => handleSendMessage(rec)}
          onSelectUseCase={(uc) => handleSendMessage(`Provide weather advisory and decision metrics for ${uc} in ${weather.city}`)}
        />

      </main>

      {/* Footer Trust Bar */}
      <FooterTrustBar />

      {/* Mobile Bottom Nav */}
      <MobileBottomNav
        activeTab={activeMobileNav}
        onTabChange={(tab) => {
          setActiveMobileNav(tab);
          if (tab === 'Alerts' && alerts[0]) {
            setSelectedAlertForModal(alerts[0]);
          } else if (tab === 'Map') {
            setMapModalOpen(true);
          } else if (tab === 'Profile') {
            setMoreDetailsModalOpen(true);
          }
        }}
        unreadAlertsCount={alerts.length}
      />

      {/* Modals & Dialogs */}
      <MapModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        locationName={`${weather.city}, ${weather.state}`}
      />

      <AlertDetailModal
        alert={selectedAlertForModal}
        onClose={() => setSelectedAlertForModal(null)}
      />

      <SetAlertModal
        isOpen={setAlertModalOpen}
        onClose={() => setSetAlertModalOpen(false)}
        locationName={`${weather.city}, ${weather.state}`}
      />

      <MoreDetailsModal
        isOpen={moreDetailsModalOpen}
        onClose={() => setMoreDetailsModalOpen(false)}
        stats={activeStatsForModal}
        locationName={`${weather.city}, ${weather.state}`}
      />

    </div>
  );
}
