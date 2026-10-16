import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../services/socket';
import { User } from '../../types';
import { Monitor, X, Maximize2, Minimize2, VideoOff, Loader2, AlertCircle } from 'lucide-react';

interface ScreenShareModalProps {
  conversationId: string;
  currentUser: User | null;
  isOpen: boolean;
  onClose: () => void;
  isInitiator?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({
  conversationId,
  currentUser,
  isOpen,
  onClose,
  isInitiator = false,
}) => {
  const [isSharing, setIsSharing] = useState(false);
  const [sharerName, setSharerName] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (peerConnRef.current) {
      peerConnRef.current.close();
      peerConnRef.current = null;
    }
    const socket = getSocket();
    if (socket) {
      socket.emit('screen:stop', { conversationId });
    }
    setIsSharing(false);
  }, [conversationId]);

  const startSharing = useCallback(async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Tarayıcınız ekran paylaşımını desteklemiyor.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setIsSharing(true);
      setSharerName(currentUser?.displayName || 'Siz');

      // Detect when user stops sharing via browser bar
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

      const socket = getSocket();
      if (socket) {
        socket.emit('screen:start', { conversationId });
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setError(err.message || 'Ekran paylaşımı başlatılamadı.');
      }
    }
  }, [conversationId, currentUser, stopSharing]);

  // Handle socket signaling
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();
    if (!socket) return;

    const handleScreenStarted = (data: { conversationId: string; sharerId: string; sharerName: string }) => {
      if (data.conversationId === conversationId && data.sharerId !== currentUser?.id) {
        setSharerName(data.sharerName);
        setIsSharing(true);
      }
    };

    const handleScreenStopped = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        stopSharing();
      }
    };

    socket.on('screen:started', handleScreenStarted);
    socket.on('screen:stopped', handleScreenStopped);

    if (isInitiator && !isSharing) {
      startSharing();
    }

    return () => {
      socket.off('screen:started', handleScreenStarted);
      socket.off('screen:stopped', handleScreenStopped);
    };
  }, [isOpen, conversationId, currentUser, isInitiator, isSharing, startSharing, stopSharing]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        ref={containerRef}
        className={`bg-[#100d1c] border border-[#2a2244] rounded-3xl shadow-2xl overflow-hidden flex flex-col ${
          isFullscreen ? 'w-screen h-screen rounded-none' : 'w-full max-w-4xl max-h-[85vh]'
        }`}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#241c38] flex items-center justify-between bg-[#0c0a16]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-purple-300">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <span>Canlı Ekran Paylaşımı</span>
                {isSharing && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </h3>
              <p className="text-[10px] text-slate-400">
                {isSharing ? `${sharerName} ekranını paylaşıyor` : 'Ekran paylaşımı bekleniyor...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white transition-colors"
              title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                stopSharing();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-[#1b152d] hover:bg-[#251d3e] text-slate-400 hover:text-white transition-colors"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Display Area */}
        <div className="flex-1 bg-black flex items-center justify-center relative min-h-[360px] overflow-hidden">
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/90 z-10">
              <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
              <p className="text-sm font-semibold text-white">{error}</p>
              <button
                onClick={startSharing}
                className="mt-3 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />

          {!isSharing && !error && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <Monitor className="w-12 h-12 text-purple-600/40 animate-pulse" />
              <p className="text-xs font-medium text-slate-300">Ekran paylaşımı henüz başlatılmadı</p>
              <button
                onClick={startSharing}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all"
              >
                <Monitor className="w-4 h-4" />
                <span>Ekranımı Paylaş</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-3 bg-[#0c0a16] border-t border-[#241c38] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            WebRTC güvenli eşler arası akış (P2P)
          </span>

          <div className="flex items-center gap-2">
            {isSharing ? (
              <button
                onClick={stopSharing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <VideoOff className="w-3.5 h-3.5" />
                <span>Paylaşımı Durdur</span>
              </button>
            ) : (
              <button
                onClick={startSharing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Ekranımı Paylaş</span>
              </button>
            )}
            <button
              onClick={() => {
                stopSharing();
                onClose();
              }}
              className="px-3 py-1.5 bg-[#1b152d] hover:bg-[#251d3e] text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
