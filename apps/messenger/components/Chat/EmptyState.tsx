"use client";
import UIcon from "../UIcon";

interface EmptyStateProps {
  t: any;
}

export function EmptyState({ t }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <img src="/ubridge-logo.svg" alt="UBridge" />
        <h1>{t.select}</h1>
        <p>{t.selectSub}</p>
        <div className="empty-hint">
          <UIcon name="shield" size={14} /> E2E • ECDH P-256 • BG P2P • Trusted Relay • Cloudflare Fast
        </div>
        <div className="empty-features">
          <div className="feature">
            <UIcon name="shield" size={20} />
            <div>
              <strong>End-to-End Encrypted</strong>
              <span>ECDH P-256 + AES-GCM 256-bit</span>
            </div>
          </div>
          <div className="feature">
            <UIcon name="link" size={20} />
            <div>
              <strong>P2P Fast</strong>
              <span>Cloudflare relay, trickle ICE, BG connections</span>
            </div>
          </div>
          <div className="feature">
            <UIcon name="database" size={20} />
            <div>
              <strong>Local First</strong>
              <span>No server storage, only your device</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
