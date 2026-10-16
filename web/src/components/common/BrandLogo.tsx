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
        className="shrink-0 drop-shadow-[0_4px_14px_rgba(124,58,237,0.45)]"
      >
        <defs>
          <linearGradient id="xxq-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="50%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#3b0764" />
          </linearGradient>
          <linearGradient id="xxq-wing" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d8b4fe" />
            <stop offset="100%" stopColor="#f3e8ff" />
          </linearGradient>
        </defs>

        {/* Outer Rounded Container */}
        <rect width="40" height="40" rx="10" fill="url(#xxq-grad)" />

        {/* Dynamic Chat Bubble Base */}
        <path
          d="M10 14C10 10.6863 12.6863 8 16 8H24C27.3137 8 30 10.6863 30 14V22C30 25.3137 27.3137 28 24 28H18L12 32V27.18C10.76 25.9 10 24.06 10 22V14Z"
          fill="#08070B"
          fillOpacity="0.92"
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
          stroke="#c084fc"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.85"
        />
      </svg>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1">
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-purple-300 via-fuchsia-200 to-violet-400 bg-clip-text text-transparent">
              XXQ
            </span>
            <span className="font-semibold text-xl text-slate-100 tracking-tight">Chat</span>
          </div>
          <span className="text-[10px] font-medium text-purple-300/80 tracking-wider uppercase mt-0.5">
            Kuantum Güvenli
          </span>
        </div>
      )}
    </div>
  );
};
