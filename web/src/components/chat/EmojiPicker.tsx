import React, { useState } from 'react';
import { Smile } from 'lucide-react';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

const EMOJI_CATEGORIES = [
  {
    name: 'Popüler & Yüzler',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '😏', '🤔', '🤫', '🥱', '😴', '🤯', '😱', '🥵', '🥶', '🥺', '😭', '😤', '😡'],
  },
  {
    name: 'El Hareketleri',
    emojis: ['👍', '👎', '👏', '🙌', '👐', '🤝', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏', '✍️'],
  },
  {
    name: 'Semboller & Kalpler',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '🔥', '✨', '⭐', '🌟', '💥', '💯', '⚡', '🎉', '🎊', '🎁', '🏆', '🎯'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 w-72 flex flex-col z-50 animate-fade-in">
      {/* Category Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
        <div className="flex gap-1 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                activeTab === idx ? 'bg-purple-950 text-purple-300 border border-purple-800/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1 max-h-44 overflow-y-auto p-1">
        {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              onSelect(emoji);
              if (onClose) onClose();
            }}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-lg transition-transform hover:scale-125"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

interface QuickReactionsProps {
  onReact: (emoji: string) => void;
  className?: string;
}

export const QuickReactionsBar: React.FC<QuickReactionsProps> = ({ onReact, className = '' }) => {
  return (
    <div className={`flex items-center gap-1 bg-slate-900/95 border border-slate-800/80 rounded-full py-1 px-2 shadow-xl backdrop-blur-md ${className}`}>
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className="w-7 h-7 rounded-full hover:bg-purple-950/60 hover:scale-125 transition-transform flex items-center justify-center text-sm"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
