import React, { useState, useEffect } from 'react';
import { User as UserIcon } from 'lucide-react';
import { toSafeImageUrl, isLiteralSvgWord, isRawSvg } from '../../utils/sanitizeSvg';

interface SafeAvatarProps {
  src?: string | null;
  alt?: string;
  fallbackText?: string | null;
  fallbackIcon?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  size?: number;
}

export const SafeAvatar: React.FC<SafeAvatarProps> = ({
  src,
  alt = 'Profil Görseli',
  fallbackText,
  fallbackIcon,
  className = 'w-full h-full object-cover',
  containerClassName = '',
  size,
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state when src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const safeUrl = toSafeImageUrl(src);

  // Format initials cleanly, ensuring "svg" or empty/symbol garbage is never rendered
  let cleanInitials: string | null = null;
  if (fallbackText && typeof fallbackText === 'string') {
    const trimmed = fallbackText.trim();
    if (!isLiteralSvgWord(trimmed) && !isRawSvg(trimmed) && trimmed.length > 0) {
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        cleanInitials = (words[0][0] + words[words.length - 1][0]).toUpperCase();
      } else {
        cleanInitials = trimmed.slice(0, 2).toUpperCase();
      }
    }
  }

  // If safeUrl is available and haven't errored
  if (safeUrl && !hasError) {
    return (
      <img
        src={safeUrl}
        alt={alt}
        className={className}
        onError={() => setHasError(true)}
      />
    );
  }

  // Fallback: render initials or icon
  if (cleanInitials) {
    return (
      <span className={`select-none font-bold text-center leading-none ${containerClassName}`}>
        {cleanInitials}
      </span>
    );
  }

  return (
    <div className={`flex items-center justify-center select-none ${containerClassName}`}>
      {fallbackIcon || <UserIcon className="w-4 h-4 text-purple-200" />}
    </div>
  );
};
