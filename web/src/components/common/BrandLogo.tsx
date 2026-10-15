import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 32, showText = true }) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_4px_12px_rgba(37,99,235,0.4)]"
      >
        <defs>
          <linearGradient id="xxq-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>
          <linearGradient id="xxq-wing" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
        </defs>

        {/* Outer Hex-Rounded Background */}
        <rect width="40" height="40" rx="10" fill="url(#xxq-grad)" />

        {/* Dynamic Chat Bubble Base */}
        <path
          d="M10 14C10 10.6863 12.6863 8 16 8H24C27.3137 8 30 10.6863 30 14V22C30 25.3137 27.3137 28 24 28H18L12 32V27.18C10.76 25.9 10 24.06 10 22V14Z"
          fill="#0B1120"
          fillOpacity="0.88"
        />

        {/* Bespoke Geometric 'Q' Emblem & Quantum Wings */}
        <circle cx="20" cy="18" r="6" stroke="url(#xxq-wing)" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M24 22L27 26"
          stroke="url(#xxq-wing)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Left Dynamic Speed Notch */}
        <path
          d="M14 15L17 18L14 21"
          stroke="#38BDF8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.75"
        />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1">
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              XXQ
            </span>
            <span className="font-semibold text-xl text-slate-100 tracking-tight">Chat</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase mt-0.5">
            Quantum Secure
          </span>
        </div>
      )}
    </div>
  );
};
