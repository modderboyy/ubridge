"use client";
import { useEffect, useState } from "react";

const FULL_REACTIONS = ["❤️", "👍", "👏", "😂", "😮", "😢", "🔥", "🎉", "💯", "🙏", "😍", "🤔", "😎", "🤩", "😭"];

interface ReactionBarProps {
  x: number;
  y: number;
  messageId: string;
  userId: string;
  currentReactions: Record<string, number>;
  onReaction: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionsBar({ x, y, messageId, userId, currentReactions, onReaction, onClose }: ReactionBarProps) {
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    // Adjust to stay in viewport
    const padding = 10;
    let adjustedX = x;
    let adjustedY = y - 50; // Show above

    if (typeof window !== "undefined") {
      const barWidth = 340;
      const barHeight = 48;
      
      if (adjustedX + barWidth > window.innerWidth - padding) {
        adjustedX = window.innerWidth - barWidth - padding;
      }
      if (adjustedX < padding) adjustedX = padding;
      
      if (adjustedY < padding) adjustedY = y + 20; // Show below if not enough space above
      if (adjustedY + barHeight > window.innerHeight - padding) {
        adjustedY = window.innerHeight - barHeight - padding;
      }
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  return (
    <>
      <div className="reactions-backdrop" onClick={onClose} />
      <div className="reactions-bar" style={{ left: position.x, top: position.y }}>
        {FULL_REACTIONS.map(emoji => {
          const isActive = localStorage.getItem(`reaction_${messageId}_${userId}`) === emoji;
          const count = currentReactions[emoji] || 0;
          
          return (
            <button 
              key={emoji} 
              className={`reaction-btn ${isActive ? "active" : ""}`}
              onClick={() => onReaction(emoji)}
              title={`${emoji} ${count > 0 ? `(${count})` : ""}`}
            >
              <span className="reaction-emoji">{emoji}</span>
              {count > 0 && <span className="reaction-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
