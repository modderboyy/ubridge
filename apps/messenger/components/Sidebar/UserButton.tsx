"use client";
import UIcon from "../UIcon";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };

export function UserButton({ 
  u, 
  active, 
  onClick, 
  bgConnected,
  isTrusted
}: { 
  u: UserRow; 
  active: boolean; 
  onClick: () => void; 
  bgConnected?: boolean;
  isTrusted?: boolean;
}) {
  return (
    <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}>
      <div className="avatar">
        {u.name[0]?.toUpperCase()}
        {u.online && <span className="online-dot" />}
      </div>
      <div className="chat-main">
        <div className="chat-name-row">
          <span className="chat-name">{u.name}</span>
          {bgConnected && <span className="trusted-badge small">BG ⚡</span>}
          {isTrusted && <span className="trusted-badge small uflow">UFlow</span>}
        </div>
        <div className="chat-preview">
          {bgConnected ? "BG connected • Fast" : u.status || (u.online ? "online" : "offline")}
        </div>
      </div>
      <div className="chat-meta">
        <span className="chat-time">{u.online ? "now" : ""}</span>
      </div>
    </button>
  );
}
