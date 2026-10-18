import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../../services/socket';
import { User } from '../../types';
import { SafeAvatar } from '../common/SafeAvatar';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Maximize2,
  Minimize2,
  AlertCircle,
  Loader2,
  Users,
  Volume2,
  VolumeX,
  Volume1,
  Settings,
  RotateCcw,
  Keyboard,
  X,
} from 'lucide-react';

export interface ActiveCallState {
  conversationId: string;
  targetUser: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  mode: 'audio' | 'video' | 'screen';
  isInitiator: boolean;
}

interface ActiveCallModalProps {
  callState: ActiveCallState | null;
  currentUser: User | null;
  onEndCall: () => void;
}

// Standard Public STUN servers for WebRTC P2P NAT traversal
const getIceServers = (): RTCConfiguration => {
  const customTurn = import.meta.env.VITE_TURN_CONFIG;
  if (customTurn) {
    try {
      const parsed = JSON.parse(customTurn);
      if (parsed.iceServers) return parsed;
    } catch (_) {}
  }

  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };
};

export const ActiveCallModal: React.FC<ActiveCallModalProps> = ({
  callState,
  currentUser,
  onEndCall,
}) => {
  if (!callState) return null;

  const [callStatus, setCallStatus] = useState<'outgoing' | 'connecting' | 'connected' | 'ended'>(
    callState.isInitiator ? 'outgoing' : 'connecting'
  );
  const [currentMode, setCurrentMode] = useState<'audio' | 'video' | 'screen'>(callState.mode);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(callState.mode === 'screen');
  const [remoteScreenActive, setRemoteScreenActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Volume slider for remote participant (local playback only)
  const [remoteVolume, setRemoteVolume] = useState<number>(100);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);

  // Configurable Keyboard Shortcuts
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcutKeys, setShortcutKeys] = useState<{
    mute: string;
    video: string;
    screen: string;
    end: string;
  }>(() => {
    try {
      const saved = localStorage.getItem('xxq_call_shortcuts');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return { mute: 'm', video: 'v', screen: 's', end: 'Escape' };
  });
  const [shortcutConflict, setShortcutConflict] = useState<string | null>(null);

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(100, newVol));
    setRemoteVolume(clamped);
    setIsRemoteMuted(clamped === 0);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = clamped / 100;
    }
  };

  const toggleRemoteMute = () => {
    if (isRemoteMuted) {
      const restoreVol = remoteVolume === 0 ? 100 : remoteVolume;
      setRemoteVolume(restoreVol);
      setIsRemoteMuted(false);
      if (remoteAudioRef.current) remoteAudioRef.current.volume = restoreVol / 100;
    } else {
      setIsRemoteMuted(true);
      if (remoteAudioRef.current) remoteAudioRef.current.volume = 0;
    }
  };

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const timerIntervalRef = useRef<any>(null);

  // Format MM:SS
  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Safe Track Teardown
  const cleanUpMedia = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

  const handleEndCall = useCallback(() => {
    const socket = getSocket();
    if (socket && callState) {
      socket.emit('call:end', {
        conversationId: callState.conversationId,
        targetUserId: callState.targetUser.id,
      });
    }
    cleanUpMedia();
    onEndCall();
  }, [callState, cleanUpMedia, onEndCall]);

  // Acquire local media stream based on mode with desktop fallback
  const setupLocalMedia = useCallback(async (mode: 'audio' | 'video' | 'screen'): Promise<MediaStream> => {
    let stream: MediaStream;

    try {
      if (mode === 'screen') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Tarayıcınız ekran paylaşımını desteklemiyor.');
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenTrackRef.current = screenStream.getVideoTracks()[0];

        // Also acquire mic audio if available
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach((track) => screenStream.addTrack(track));
        } catch (_) {}

        stream = screenStream;
        setIsScreenSharing(true);
      } else if (mode === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          });
        } catch (initialErr) {
          // PC Device Fallback: desktop without microphone or webcam
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            });
          } catch (_) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
          }
        }
        cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      } else {
        // Audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } catch (audioErr) {
          // PC without microphone: try requesting audio with relaxed constraints
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        }
      }

      localStreamRef.current = stream;

      if (localVideoRef.current && (mode === 'video' || mode === 'screen')) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      return stream;
    } catch (err: any) {
      console.error('[WebRTC] Media permission or device error:', err);
      let userMsg = 'Medya cihazlarına erişilemedi.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMsg = 'Kamera veya mikrofon erişim izni reddedildi. Lütfen tarayıcı izinlerini kontrol edin.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'Mikrofon veya kamera cihazı bulunamadı. Lütfen cihazınızın bağlı olduğundan emin olun.';
      } else if (err.message) {
        userMsg = err.message;
      }
      setErrorMessage(userMsg);
      throw err;
    }
  }, []);

  // WebRTC PeerConnection Setup
  const initializePeerConnection = useCallback((localStream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(getIceServers());
    peerConnectionRef.current = pc;

    // Add local tracks to RTCPeerConnection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Remote Track Receiver
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      remoteStreamRef.current = remoteStream;

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    // ICE Candidate Exchange
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        if (socket && callState) {
          socket.emit('webrtc:ice-candidate', {
            conversationId: callState.conversationId,
            targetUserId: callState.targetUser.id,
            candidate: event.candidate,
          });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        setErrorMessage(null);
        // Start duration counter
        if (!timerIntervalRef.current) {
          timerIntervalRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setErrorMessage('Ağ bağlantısı koptu veya yeniden bağlanıyor...');
      } else if (pc.connectionState === 'closed') {
        handleEndCall();
      }
    };

    return pc;
  }, [callState, handleEndCall]);

  // Main WebRTC Flow Setup
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !callState) return;

    let isMounted = true;

    const startCallFlow = async () => {
      try {
        const localStream = await setupLocalMedia(callState.mode);
        if (!isMounted) return;

        const pc = initializePeerConnection(localStream);

        // If initiator, send call:initiate
        if (callState.isInitiator) {
          socket.emit(
            'call:initiate',
            {
              conversationId: callState.conversationId,
              mode: callState.mode,
              targetUserId: callState.targetUser.id,
            },
            async (res: any) => {
              if (!res?.success) {
                setErrorMessage(res?.message || 'Arama başlatılamadı.');
                setTimeout(() => onEndCall(), 3000);
              }
            }
          );
        } else {
          // Responder accepts call
          socket.emit(
            'call:accept',
            {
              conversationId: callState.conversationId,
              callerId: callState.targetUser.id,
              mode: callState.mode,
            },
            (res: any) => {
              if (!res?.success) {
                setErrorMessage(res?.message || 'Arama kabul edilemedi.');
                setTimeout(() => onEndCall(), 3000);
              }
            }
          );
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Cihaz başlatılamadı.');
      }
    };

    startCallFlow();

    // Socket Event Handlers
    const handleCallAccepted = async (data: { conversationId: string; responderId: string }) => {
      if (data.conversationId !== callState.conversationId) return;
      setCallStatus('connecting');

      // Initiator creates and sends WebRTC Offer once call is accepted
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('webrtc:offer', {
            conversationId: callState.conversationId,
            targetUserId: callState.targetUser.id,
            sdp: offer,
          });
        } catch (err: any) {
          console.error('[WebRTC] Create offer error:', err);
        }
      }
    };

    const handleCallRejected = (data: { conversationId: string; reason?: string }) => {
      if (data.conversationId !== callState.conversationId) return;
      setCallStatus('ended');
      setErrorMessage(
        data.reason === 'busy'
          ? 'Kullanıcı şu anda başka bir aramada meşgul.'
          : 'Arama karşı tarafça reddedildi.'
      );
      setTimeout(() => onEndCall(), 2500);
    };

    const handleCallEnded = (data: { conversationId: string }) => {
      if (data.conversationId !== callState.conversationId) return;
      setCallStatus('ended');
      cleanUpMedia();
      onEndCall();
    };

    const handleWebRtcOffer = async (data: { conversationId: string; sdp: any; senderId: string }) => {
      if (data.conversationId !== callState.conversationId) return;

      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:answer', {
            conversationId: callState.conversationId,
            targetUserId: data.senderId,
            sdp: answer,
          });
        } catch (err: any) {
          console.error('[WebRTC] Answer creation error:', err);
        }
      }
    };

    const handleWebRtcAnswer = async (data: { conversationId: string; sdp: any }) => {
      if (data.conversationId !== callState.conversationId) return;

      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch (err: any) {
          console.error('[WebRTC] Set remote answer error:', err);
        }
      }
    };

    const handleIceCandidate = async (data: { conversationId: string; candidate: any }) => {
      if (data.conversationId !== callState.conversationId) return;

      const pc = peerConnectionRef.current;
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err: any) {
          console.warn('[WebRTC] Add ICE candidate warning:', err);
        }
      }
    };

    const handleModeChanged = (data: {
      conversationId: string;
      mode: 'audio' | 'video' | 'screen';
      isScreenSharing: boolean;
      isVideoMuted: boolean;
    }) => {
      if (data.conversationId !== callState.conversationId) return;
      setRemoteScreenActive(data.isScreenSharing);
    };

    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:ended', handleCallEnded);
    socket.on('webrtc:offer', handleWebRtcOffer);
    socket.on('webrtc:answer', handleWebRtcAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('call:mode-changed', handleModeChanged);

    return () => {
      isMounted = false;
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:ended', handleCallEnded);
      socket.off('webrtc:offer', handleWebRtcOffer);
      socket.off('webrtc:answer', handleWebRtcAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('call:mode-changed', handleModeChanged);
      cleanUpMedia();
    };
  }, [callState, cleanUpMedia, initializePeerConnection, onEndCall, setupLocalMedia]);

  // Audio Mute Toggle
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  // Video Camera Toggle with WebRTC renegotiation if starting from audio
  const toggleVideo = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (currentMode === 'audio' || !cameraTrackRef.current) {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        const vTrack = vidStream.getVideoTracks()[0];
        cameraTrackRef.current = vTrack;
        if (localStreamRef.current) {
          localStreamRef.current.addTrack(vTrack);
        }

        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(vTrack);
        } else {
          pc.addTrack(vTrack, localStreamRef.current || vidStream);
          // Perform WebRTC renegotiation
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const socket = getSocket();
          if (socket && callState) {
            socket.emit('webrtc:offer', {
              conversationId: callState.conversationId,
              targetUserId: callState.targetUser.id,
              sdp: offer,
            });
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current || vidStream;
          localVideoRef.current.play().catch(() => {});
        }

        setCurrentMode('video');
        setIsVideoMuted(false);

        const socket = getSocket();
        if (socket && callState) {
          socket.emit('call:mode-change', {
            conversationId: callState.conversationId,
            targetUserId: callState.targetUser.id,
            mode: 'video',
            isVideoMuted: false,
            isScreenSharing,
          });
        }
      } catch (err: any) {
        setErrorMessage('Kamera başlatılamadı: ' + err.message);
      }
      return;
    }

    if (cameraTrackRef.current) {
      cameraTrackRef.current.enabled = !cameraTrackRef.current.enabled;
      setIsVideoMuted(!cameraTrackRef.current.enabled);

      const socket = getSocket();
      if (socket && callState) {
        socket.emit('call:mode-change', {
          conversationId: callState.conversationId,
          targetUserId: callState.targetUser.id,
          mode: currentMode,
          isVideoMuted: !cameraTrackRef.current.enabled,
          isScreenSharing,
        });
      }
    }
  };

  // Screen Sharing Toggle during call with renegotiation
  const toggleScreenShare = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setErrorMessage('Ekran paylaşımı bu tarayıcıda desteklenmiyor.');
      return;
    }

    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const newScreenTrack = screenStream.getVideoTracks()[0];
        screenTrackRef.current = newScreenTrack;

        // Replace or add video track in RTCPeerConnection sender
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newScreenTrack);
        } else {
          pc.addTrack(newScreenTrack, localStreamRef.current!);
          // Perform WebRTC renegotiation offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const socket = getSocket();
          if (socket && callState) {
            socket.emit('webrtc:offer', {
              conversationId: callState.conversationId,
              targetUserId: callState.targetUser.id,
              sdp: offer,
            });
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
          localVideoRef.current.play().catch(() => {});
        }

        setIsScreenSharing(true);
        setCurrentMode('screen');

        newScreenTrack.onended = () => {
          stopLocalScreenShare();
        };

        const socket = getSocket();
        if (socket && callState) {
          socket.emit('call:mode-change', {
            conversationId: callState.conversationId,
            targetUserId: callState.targetUser.id,
            mode: 'screen',
            isScreenSharing: true,
          });
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          setErrorMessage('Ekran paylaşımı başlatılamadı: ' + err.message);
        }
      }
    } else {
      stopLocalScreenShare();
    }
  };

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (showShortcutsModal) return;

      const key = e.key.toLowerCase();
      if (key === shortcutKeys.mute.toLowerCase() || (shortcutKeys.mute.toLowerCase() === 'space' && e.code === 'Space')) {
        e.preventDefault();
        toggleAudio();
      } else if (key === shortcutKeys.video.toLowerCase()) {
        e.preventDefault();
        toggleVideo();
      } else if (key === shortcutKeys.screen.toLowerCase()) {
        e.preventDefault();
        toggleScreenShare();
      } else if (e.key === shortcutKeys.end || (shortcutKeys.end.toLowerCase() === 'escape' && e.key === 'Escape')) {
        e.preventDefault();
        handleEndCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutKeys, showShortcutsModal, isAudioMuted, isVideoMuted, isScreenSharing]);

  const stopLocalScreenShare = async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    setIsScreenSharing(false);
    setCurrentMode('video');

    const pc = peerConnectionRef.current;
    if (pc && cameraTrackRef.current) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(cameraTrackRef.current);
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    const socket = getSocket();
    if (socket && callState) {
      socket.emit('call:mode-change', {
        conversationId: callState.conversationId,
        targetUserId: callState.targetUser.id,
        mode: 'video',
        isScreenSharing: false,
      });
    }
  };

  const toggleFullscreen = () => {
    if (!modalContainerRef.current) return;
    if (!document.fullscreenElement) {
      modalContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const isVideoOrScreen = currentMode === 'video' || currentMode === 'screen' || remoteScreenActive;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md animate-fade-in select-none">
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div
        ref={modalContainerRef}
        className={`bg-[#0d0a17] border border-[#271e3d] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative transition-all ${
          isFullscreen
            ? 'w-screen h-screen rounded-none'
            : isVideoOrScreen
            ? 'w-full max-w-4xl h-[82vh]'
            : 'w-full max-w-md h-[460px]'
        }`}
      >
        {/* Call Top Header */}
        <div className="px-5 py-3.5 border-b border-[#221838] bg-[#120e22]/90 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${
                currentMode === 'audio'
                  ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                  : currentMode === 'video'
                  ? 'bg-blue-950/80 text-blue-300 border-blue-800'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
              }`}
            >
              {currentMode === 'audio' && <Phone className="w-3 h-3" />}
              {currentMode === 'video' && <Video className="w-3 h-3" />}
              {currentMode === 'screen' && <Monitor className="w-3 h-3" />}
              <span>
                {currentMode === 'audio'
                  ? 'Sesli Arama'
                  : currentMode === 'video'
                  ? 'Görüntülü Arama'
                  : 'Ekran Paylaşımı'}
              </span>
            </span>

            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-xs text-white truncate">{callState.targetUser.displayName}</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {callStatus === 'outgoing'
                  ? 'Çalıyor...'
                  : callStatus === 'connecting'
                  ? 'Bağlanıyor...'
                  : formatDuration(callDuration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1f1736] transition-colors"
              title="Klavye Kısayolları"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            {isVideoOrScreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1f1736] transition-colors"
                title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800/80 text-rose-200 text-xs flex items-center gap-2 shrink-0 z-20">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Center Media Stage */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {isVideoOrScreen ? (
            <>
              {/* Remote Video Stream (Main View) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-contain ${callStatus !== 'connected' ? 'hidden' : ''}`}
              />

              {callStatus !== 'connected' && (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center animate-fade-in">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 border-2 border-purple-500/40 flex items-center justify-center text-white text-xl font-bold shadow-xl animate-pulse overflow-hidden">
                    <SafeAvatar
                      src={callState.targetUser.avatarUrl}
                      alt={callState.targetUser.displayName}
                      className="w-full h-full object-cover rounded-full"
                      fallbackText={callState.targetUser.displayName}
                      size={80}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-white">{callState.targetUser.displayName}</p>
                    <p className="text-xs text-purple-300 flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{callStatus === 'outgoing' ? 'Bağlantı bekleniyor...' : 'Görüntü aktarılıyor...'}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Local Video Stream (Picture-in-Picture) */}
              <div className="absolute bottom-4 right-4 w-32 sm:w-44 aspect-video bg-[#141022] border-2 border-[#2f244a] rounded-2xl overflow-hidden shadow-2xl z-10 transition-all hover:scale-105">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isVideoMuted ? 'hidden' : ''}`}
                />
                {isVideoMuted && (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-[#0d0a17]">
                    <VideoOff className="w-6 h-6 mb-1 text-slate-600" />
                    <span className="text-[10px]">Kamera Kapalı</span>
                  </div>
                )}
                <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-semibold text-slate-300">
                  {isScreenSharing ? 'Ekranınız' : 'Siz'}
                </div>
              </div>
            </>
          ) : (
            // Audio Only Stage
            <div className="flex flex-col items-center justify-center gap-4 p-6 text-center animate-fade-in">
              <div className="relative my-2">
                {callStatus === 'connected' && (
                  <div className="absolute -inset-3 rounded-full bg-purple-500/20 animate-ping opacity-60" />
                )}
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-tr from-purple-800 to-indigo-600 border-4 border-[#251b3d] flex items-center justify-center text-white text-3xl font-bold shadow-2xl overflow-hidden">
                  <SafeAvatar
                    src={callState.targetUser.avatarUrl}
                    alt={callState.targetUser.displayName}
                    className="w-full h-full object-cover"
                    fallbackText={callState.targetUser.displayName}
                    size={112}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">{callState.targetUser.displayName}</h3>
                <p className="text-xs font-semibold text-purple-400">
                  {callStatus === 'outgoing'
                    ? 'Çalıyor...'
                    : callStatus === 'connecting'
                    ? 'Bağlanıyor...'
                    : `Görüşme Devam Ediyor (${formatDuration(callDuration)})`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="px-6 py-4 bg-[#120e22]/95 border-t border-[#221838] flex items-center justify-center gap-4 sm:gap-6 shrink-0 z-20">
          {/* Audio Mute/Unmute */}
          <button
            type="button"
            onClick={toggleAudio}
            className={`p-3.5 rounded-2xl border transition-all ${
              isAudioMuted
                ? 'bg-rose-950/70 border-rose-800 text-rose-300 hover:bg-rose-900/80'
                : 'bg-[#1e1732] border-[#31254e] text-slate-200 hover:bg-[#281f44]'
            }`}
            title={isAudioMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle (Starts camera or toggles video) */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-3.5 rounded-2xl border transition-all ${
              isVideoMuted || currentMode === 'audio'
                ? 'bg-[#1e1732] border-[#31254e] text-slate-400 hover:text-slate-200 hover:bg-[#281f44]'
                : 'bg-blue-950/70 border-blue-800 text-blue-300 hover:bg-blue-900/80'
            }`}
            title={isVideoMuted || currentMode === 'audio' ? 'Kamerayı Aç' : 'Kamerayı Kapat'}
          >
            {isVideoMuted || currentMode === 'audio' ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Screen Share Toggle */}
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-2xl border transition-all ${
              isScreenSharing
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300 hover:bg-emerald-900/80'
                : 'bg-[#1e1732] border-[#31254e] text-slate-200 hover:bg-[#281f44]'
            }`}
            title={isScreenSharing ? 'Ekran Paylaşımını Durdur' : 'Ekranını Paylaş'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          {/* Local Audio Playback Volume Slider */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1a142c] border border-[#2f244a] rounded-2xl text-slate-300 shadow-inner">
            <button
              type="button"
              onClick={toggleRemoteMute}
              className="text-slate-400 hover:text-white transition-colors"
              title={isRemoteMuted ? 'Karşı Tarafın Sesini Aç' : 'Karşı Tarafın Sesini Kıs'}
            >
              {isRemoteMuted || remoteVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : remoteVolume < 50 ? (
                <Volume1 className="w-4 h-4 text-purple-300" />
              ) : (
                <Volume2 className="w-4 h-4 text-purple-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isRemoteMuted ? 0 : remoteVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-16 sm:w-20 accent-purple-500 cursor-pointer h-1.5 bg-[#0e0a1a] rounded-lg"
              title={`Karşı Tarafın Ses Seviyesi: %${isRemoteMuted ? 0 : remoteVolume}`}
            />
            <span className="text-[10px] font-mono text-slate-400 w-7 text-right">
              %{isRemoteMuted ? 0 : remoteVolume}
            </span>
          </div>

          {/* End Call Button */}
          <button
            type="button"
            onClick={handleEndCall}
            className="px-5 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-950/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-rose-500/30"
            title="Aramayı Sonlandır"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="hidden sm:inline">Sonlandır</span>
          </button>
        </div>
      </div>

      {/* Configurable Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-[#120f1e] border border-[#2e2448] w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#251c38] pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Keyboard className="w-4 h-4 text-purple-400" />
                <span>Görüşme Klavye Kısayolları</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1f1734]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shortcutConflict && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{shortcutConflict}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Mikrofon Aç/Kapat</span>
                <input
                  type="text"
                  maxLength={10}
                  value={shortcutKeys.mute}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setShortcutKeys((prev) => ({ ...prev, mute: val }));
                  }}
                  className="w-20 px-2 py-1 bg-[#0b0914] border border-[#2a2244] rounded-lg text-center text-purple-300 font-mono font-bold focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Kamera Aç/Kapat</span>
                <input
                  type="text"
                  maxLength={10}
                  value={shortcutKeys.video}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setShortcutKeys((prev) => ({ ...prev, video: val }));
                  }}
                  className="w-20 px-2 py-1 bg-[#0b0914] border border-[#2a2244] rounded-lg text-center text-purple-300 font-mono font-bold focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Ekran Paylaşımı</span>
                <input
                  type="text"
                  maxLength={10}
                  value={shortcutKeys.screen}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setShortcutKeys((prev) => ({ ...prev, screen: val }));
                  }}
                  className="w-20 px-2 py-1 bg-[#0b0914] border border-[#2a2244] rounded-lg text-center text-purple-300 font-mono font-bold focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Aramayı Sonlandır</span>
                <input
                  type="text"
                  maxLength={10}
                  value={shortcutKeys.end}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setShortcutKeys((prev) => ({ ...prev, end: val }));
                  }}
                  className="w-20 px-2 py-1 bg-[#0b0914] border border-[#2a2244] rounded-lg text-center text-purple-300 font-mono font-bold focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#251c38]">
              <button
                type="button"
                onClick={() => {
                  const defaults = { mute: 'm', video: 'v', screen: 's', end: 'Escape' };
                  setShortcutKeys(defaults);
                  setShortcutConflict(null);
                  localStorage.setItem('xxq_call_shortcuts', JSON.stringify(defaults));
                }}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Varsayılanlara Sıfırla</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  // Check for conflicts
                  const values = [shortcutKeys.mute, shortcutKeys.video, shortcutKeys.screen, shortcutKeys.end].map((s) => s.toLowerCase());
                  const unique = new Set(values);
                  if (unique.size !== values.length) {
                    setShortcutConflict('Çakışma tespit edildi: Aynı tuş birden fazla işleme atanamaz!');
                    return;
                  }
                  setShortcutConflict(null);
                  localStorage.setItem('xxq_call_shortcuts', JSON.stringify(shortcutKeys));
                  setShowShortcutsModal(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
