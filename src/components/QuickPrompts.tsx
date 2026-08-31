import React from 'react';
import { MessageSquare, Footprints, Plane, Sprout, Sparkles, CloudSun } from 'lucide-react';

interface QuickPromptsProps {
  onSelectPrompt: (prompt: string) => void;
  isLoading?: boolean;
}

export const STARTER_PROMPTS = [
  {
    id: 'prompt-mumbai',
    text: 'Will it rain tomorrow in Mumbai?',
    icon: MessageSquare,
    tag: 'Precipitation',
  },
  {
    id: 'prompt-manali',
    text: 'Can I go for a trek in Manali this weekend?',
    icon: Footprints,
    tag: 'Outdoor / Trek',
  },
  {
    id: 'prompt-kerala',
    text: 'Is it safe to travel to Kerala next week?',
    icon: Plane,
    tag: 'Travel Risk',
  },
  {
    id: 'prompt-crops',
    text: 'Give me crop advice for heavy rain',
    icon: Sprout,
    tag: 'Agriculture',
  },
];

export const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelectPrompt, isLoading }) => {
  return (
    <div className="w-full mb-6">
      {/* Title Header */}
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="w-8 h-8 rounded-lg bg-[#2E7BFA]/10 border border-[#2E7BFA]/30 flex items-center justify-center">
          <CloudSun className="w-4 h-4 text-[#2E7BFA]" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F5F7FA] font-['Manrope']">
            Your AI Weather Assistant
          </h2>
          <p className="text-xs text-[#8B95A8]">
            Ask anything in natural language or tap a quick question below
          </p>
        </div>
      </div>

      {/* 4 Starter Chips Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {STARTER_PROMPTS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              id={item.id}
              onClick={() => onSelectPrompt(item.text)}
              disabled={isLoading}
              className="group relative bg-[#141B2E] hover:bg-[#1A233A] border border-[#1F2A44] hover:border-[#2E7BFA]/50 rounded-xl p-3 sm:p-3.5 text-left transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-[#2E7BFA]/5 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 shrink-0 rounded-lg bg-[#1F2A44] group-hover:bg-[#2E7BFA]/20 border border-white/5 group-hover:border-[#2E7BFA]/30 flex items-center justify-center text-[#2E7BFA] transition-colors">
                <Icon className="w-4 h-4 transition-transform group-hover:scale-110" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-[13px] font-medium text-[#F5F7FA] group-hover:text-white leading-snug line-clamp-2">
                  {item.text}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
