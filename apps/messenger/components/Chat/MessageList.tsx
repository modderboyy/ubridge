"use client";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { LocalMessage } from "../../lib/local-db";

interface MessageListProps {
  messages: LocalMessage[];
  onMessageLongPress: (message: LocalMessage, e: React.PointerEvent) => void;
  onCancelLongPress: () => void;
  onMessageContextMenu: (message: LocalMessage, e: React.MouseEvent) => void;
  onReactionClick?: (message: LocalMessage, emoji: string) => void;
  t: any;
  fileTransfers?: Map<string, any>;
  searchQuery?: string;
}

export function MessageList({ 
  messages, 
  onMessageLongPress, 
  onCancelLongPress, 
  onMessageContextMenu,
  onReactionClick,
  t,
  fileTransfers,
  searchQuery
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredMessages = searchQuery 
    ? messages.filter(m => 
        m.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.attachment?.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  useEffect(() => {
    if (!searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, searchQuery]);

  if (filteredMessages.length === 0 && searchQuery) {
    return (
      <div className="messages empty-search">
        <div className="empty-search-content">
          <div className="empty-icon">🔍</div>
          <h3>Hech narsa topilmadi</h3>
          <p>"{searchQuery}" bo'yicha xabar topilmadi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={containerRef}>
      {searchQuery && (
        <div className="search-info">
          {filteredMessages.length} ta xabar topildi: "{searchQuery}"
        </div>
      )}
      
      {filteredMessages.slice(-200).map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onLongPress={(e) => onMessageLongPress(message, e)}
          onCancelLongPress={onCancelLongPress}
          onContextMenu={(e) => onMessageContextMenu(message, e)}
          onReactionClick={(emoji) => onReactionClick?.(message, emoji)}
          t={t}
          fileTransfers={fileTransfers}
        />
      ))}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
