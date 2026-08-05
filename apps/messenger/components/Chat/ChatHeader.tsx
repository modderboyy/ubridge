"use client";
import UIcon from "../UIcon";
import { useUBridgeStore } from "../../lib/store";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };

interface ChatHeaderProps {
  peer: UserRow;
  connection: string;
  typing: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onInfoToggle: () => void;
  onMenuOpen: (e: React.MouseEvent) => void;
  t: any;
  isBgConnected: boolean;
}

export function ChatHeader({ peer, connection, typing, onBack, onCall, onInfoToggle, onMenuOpen, t, isBgConnected }: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <button className="icon-button mobile-back" onClick={onBack} aria-label="Back">
        <UIcon name="arrow-left" size={20} />
      </button>
      
      <div className="peer-info" onClick={onInfoToggle} style={{ cursor: "pointer" }}>
        <div className="avatar large">
          {peer.name[0]?.toUpperCase()}
          <span className="online-dot" />
          {isBgConnected && <span className="bg-connected-dot" title="BG Connected">⚡</span>}
        </div>
        <div className="peer-copy">
          <strong>{peer.name}</strong>
          <div className={`peer-status ${connection}`}>
            {typing ? "typing…" : connection === "connected" ? t.connected : connection === "connecting" ? t.connecting : peer.online ? t.ready : t.offlinePeer}
            {isBgConnected && <span className="bg-badge">BG ⚡ Fast</span>}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <button className="action-button" onClick={() => onCall(false)} title={t.call}>
          <UIcon name="phone" size={18} /> 
          <span className="hide-mobile">{t.call}</span>
        </button>
        <button className="action-button primary" onClick={() => onCall(true)} title={t.videoCall}>
          <UIcon name="video" size={18} /> 
          <span className="hide-mobile">{t.videoCall}</span>
        </button>
        <button className="icon-button" onClick={onMenuOpen} aria-label="More options">
          <UIcon name="more" size={18} />
        </button>
      </div>
    </header>
  );
}
