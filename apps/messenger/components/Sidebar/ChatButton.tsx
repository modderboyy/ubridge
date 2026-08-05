"use client";
import type { LocalChat } from "../../lib/local-db";
import UIcon from "../UIcon";

export function ChatButton({ chat, active, onClick }: { chat: LocalChat; active: boolean; onClick: () => void }) {
  const hasDraft = !!chat.draft;
  const isMuted = !!chat.muted;
  const isBlocked = !!chat.blocked;

  return (
    <button className={`chat-item ${active ? "active" : ""} ${isMuted ? "muted" : ""} ${isBlocked ? "blocked" : ""}`} onClick={onClick}>
      <div className="avatar">
        {chat.title[0]?.toUpperCase()}
        {isMuted && <span className="muted-badge">🔇</span>}
      </div>
      <div className="chat-main">
        <div className="chat-name-row">
          <span className="chat-name">{chat.title}</span>
          {hasDraft && <span className="draft-mark">• draft</span>}
          {chat.pinned && <span className="pin-mark">📌</span>}
        </div>
        <div className="chat-preview">
          {hasDraft ? `Draft: ${chat.draft?.slice(0, 28)}` : chat.lastMessage || "No messages yet"}
        </div>
      </div>
      <div className="chat-meta">
        <span className="chat-time">
          {chat.lastAt ? new Date(chat.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
        {chat.unread > 0 && <span className="unread">{chat.unread > 99 ? "99+" : chat.unread}</span>}
      </div>
    </button>
  );
}
