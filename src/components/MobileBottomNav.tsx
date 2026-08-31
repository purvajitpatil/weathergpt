import React from 'react';
import { Home, MessageSquare, AlertTriangle, Map, User } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadAlertsCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  unreadAlertsCount = 2,
}) => {
  const tabs = [
    { id: 'Home', label: 'Home', icon: Home },
    { id: 'Chat', label: 'Chat', icon: MessageSquare },
    { id: 'Alerts', label: 'Alerts', icon: AlertTriangle, badge: unreadAlertsCount },
    { id: 'Map', label: 'Map', icon: Map },
    { id: 'Profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1120]/95 backdrop-blur-lg border-t border-[#1F2A44] py-2 px-3">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab.toLowerCase() === tab.id.toLowerCase();
          return (
            <button
              key={tab.id}
              id={`mobile-nav-${tab.id.toLowerCase()}`}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all relative ${
                isActive
                  ? 'text-[#2E7BFA] font-bold'
                  : 'text-[#8B95A8] hover:text-[#F5F7FA]'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                {tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-[#C0392B] text-white text-[9px] font-bold flex items-center justify-center border border-[#0B1120]">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
