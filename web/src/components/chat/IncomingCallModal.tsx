import React from 'react';
import { Phone, PhoneOff, Video, Monitor } from 'lucide-react';
import { SafeAvatar } from '../common/SafeAvatar';

export interface IncomingCallData {
  conversationId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  mode: 'audio' | 'video' | 'screen';
  createdAt: string;
}

interface IncomingCallModalProps {
  incomingCall: IncomingCallData | null;
  onAccept: (call: IncomingCallData) => void;
  onReject: (call: IncomingCallData) => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  onAccept,
  onReject,
}) => {
  if (!incomingCall) return null;

  const modeLabels: Record<string, { title: string; icon: any; color: string }> = {
    audio: { title: 'Sesli Arama', icon: Phone, color: 'text-purple-400 bg-purple-950/80 border-purple-800' },
    video: { title: 'Görüntülü Arama', icon: Video, color: 'text-blue-400 bg-blue-950/80 border-blue-800' },
    screen: { title: 'Ekran Paylaşımı Araması', icon: Monitor, color: 'text-emerald-400 bg-emerald-950/80 border-emerald-800' },
  };

  const currentMode = modeLabels[incomingCall.mode] || modeLabels.audio;
  const ModeIcon = currentMode.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#120e22] border border-[#2d2248] w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center space-y-5 relative overflow-hidden">
        {/* Glow ambient effect */}
        <div className="absolute -top-16 -left-16 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Mode Badge */}
        <div className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${currentMode.color}`}>
          <ModeIcon className="w-3.5 h-3.5" />
          <span>Gelen {currentMode.title}</span>
        </div>

        {/* Caller Avatar with Pulse Animation */}
        <div className="relative my-2">
          <div className="absolute inset-0 rounded-full bg-purple-600/30 animate-ping opacity-75" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 border-4 border-[#22183d] flex items-center justify-center text-white text-2xl font-bold overflow-hidden shadow-xl">
            <SafeAvatar
              src={incomingCall.callerAvatar}
              alt={incomingCall.callerName}
              className="w-full h-full object-cover"
              fallbackText={incomingCall.callerName}
              size={96}
            />
          </div>
        </div>

        {/* Caller Info */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white tracking-tight">{incomingCall.callerName}</h3>
          <p className="text-xs text-slate-400 animate-pulse">Sizi arıyor...</p>
        </div>

        {/* Action Buttons: Accept / Reject */}
        <div className="flex items-center justify-center gap-8 pt-2 w-full">
          {/* Reject */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => onReject(incomingCall)}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-950/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-rose-500/30"
              title="Aramayı Reddet"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-semibold text-rose-300">Reddet</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAccept(incomingCall)}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-950/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 animate-bounce"
              title="Aramayı Yanıtla"
            >
              <Phone className="w-6 h-6" />
            </button>
            <span className="text-[11px] font-semibold text-emerald-300">Yanıtla</span>
          </div>
        </div>
      </div>
    </div>
  );
};
