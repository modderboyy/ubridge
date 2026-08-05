"use client";
import UIcon from "../UIcon";
import type { LocalMessage } from "../../lib/local-db";

interface MessageBubbleProps {
  message: LocalMessage;
  onLongPress: (e: React.PointerEvent) => void;
  onCancelLongPress: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onReactionClick?: (emoji: string) => void;
  t: any;
  fileTransfers?: Map<string, any>;
}

const FULL_REACTIONS_TOP = ["❤️", "👍", "👏", "😂", "😮"];

export function MessageBubble({ message, onLongPress, onCancelLongPress, onContextMenu, onReactionClick, t, fileTransfers }: MessageBubbleProps) {
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusIcon = (delivery: string) => {
    switch (delivery) {
      case "waiting": return { icon: "⏳", text: t.waiting || "Kutilmoqda", class: "waiting" };
      case "sending": return { icon: "◍", text: t.sent || "Yuborilmoqda", class: "sending" };
      case "sent": return { icon: "✓", text: t.sent || "Yuborildi", class: "sent" };
      case "delivered": return { icon: "✓✓", text: t.delivered || "Yetkazildi", class: "delivered" };
      case "read": return { icon: "✓✓", text: t.read || "O'qildi", class: "read" };
      case "failed": return { icon: "⚠", text: t.failed || "Xatolik", class: "failed" };
      case "queued": return { icon: "⏳", text: "Navbatda", class: "waiting" };
      default: return { icon: "✓", text: delivery, class: delivery };
    }
  };

  const status = message.from === "me" ? getStatusIcon(message.delivery) : null;
  const ft = fileTransfers ? Array.from(fileTransfers.values()).find(f => message.text.includes(f.name)) : null;

  return (
    <div className={`message-row ${message.from}`}>
      <div 
        className={`message-bubble ${message.from === "me" ? "me" : "peer"} ${message.deletedAt ? "deleted" : ""}`}
        onPointerDown={onLongPress}
        onPointerUp={onCancelLongPress}
        onPointerCancel={onCancelLongPress}
        onPointerMove={(e) => {
          if (Math.abs(e.movementX) + Math.abs(e.movementY) > 12) onCancelLongPress();
        }}
        onContextMenu={onContextMenu}
      >
        {message.replyTo && <div className="reply-mark">{t.reply || "Javob"}</div>}
        
        <span className="message-text">{message.deletedAt ? "Message deleted" : message.text}</span>
        
        {message.attachment && (
          <div className="attachment">
            <div className="file-icon">📄</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{message.attachment.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {message.attachment.mime || "file"} • {message.attachment.size ? (message.attachment.size / 1024).toFixed(1) + " KB" : ""}
              </div>
            </div>
            {(() => {
              const transfer = fileTransfers ? Array.from(fileTransfers.values()).find(f => f.name === message.attachment!.name) : null;
              if (transfer?.blobUrl) {
                return (
                  <a href={transfer.blobUrl} download={transfer.name} className="action-button small">
                    <UIcon name="download" size={14} /> {t.download || "Yuklash"}
                  </a>
                );
              }
              return null;
            })()}
          </div>
        )}

        {ft && ft.state !== "completed" && (
          <div className="file-progress">
            <div className="file-progress-bar">
              <div className="file-progress-fill" style={{ width: `${ft.progress}%` }} />
            </div>
            <div className="file-progress-text">
              {ft.state === "sending" ? `${t.fileOffer || "Yuborilmoqda"} ${ft.progress}%` : `${t.fileReceiving || "Qabul"} ${ft.progress}%`}
            </div>
          </div>
        )}

        <div className="message-meta">
          <span className="message-time">{formatTime(message.at)}</span>
          {status && (
            <span className={`msg-status ${status.class}`} title={status.text}>
              {status.icon} {status.text}
            </span>
          )}
          {message.from !== "me" && <span className="message-delivery">{message.delivery}</span>}
        </div>

        {Object.keys(message.reactions).length > 0 && (
          <div className="reactions">
            {Object.entries(message.reactions).map(([emoji, count]) => (
              <span key={emoji} onClick={() => onReactionClick?.(emoji)} className="reaction-item" title={`${emoji} ${count}`}>
                {emoji} {count}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
