/**
 * Cloudflare Fast Signaling Client
 * Ultra-fast WebRTC signaling via WebSocket to Cloudflare Durable Object
 * Fallback to Supabase RPC if Cloudflare unavailable
 */

type SignalCallback = (data: { from_user: string; to_user: string; kind: string; payload: any }) => void;

export class CloudflareRelay {
  private ws: WebSocket | null = null;
  private url: string;
  private userId: string;
  private userName: string;
  private onSignal: SignalCallback | null = null;
  private reconnectAttempts = 0;
  private maxReconnect = 5;
  private connected = false;
  private messageQueue: any[] = [];

  constructor(userId: string, userName: string, relayUrl?: string) {
    this.userId = userId;
    this.userName = userName;
    // Default to worker, but allow override via env
    const envUrl = process.env.NEXT_PUBLIC_RELAY_URL || (typeof window !== "undefined" ? (window as any).__UBRIDGE_RELAY_URL__ : null);
    this.url = relayUrl || envUrl || "wss://ubridge-relay.modderboyy.workers.dev/room/" + encodeURIComponent(userId) + `?user=${encodeURIComponent(userId)}&name=${encodeURIComponent(userName)}`;
    // If no relay deployed, use local fallback (will fail quickly and fallback to supabase)
    if (!this.url.startsWith("ws")) {
      this.url = this.url.replace(/^http/, "ws");
    }
  }

  setHandler(cb: SignalCallback) {
    this.onSignal = cb;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.connected) { resolve(); return; }

      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          try { this.ws?.close(); } catch {}
          reject(new Error("Relay connect timeout"));
        }
      }, 4000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        // Flush queue
        while (this.messageQueue.length) {
          const msg = this.messageQueue.shift();
          try { this.ws?.send(JSON.stringify(msg)); } catch {}
        }
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "presence" || data.type === "hello") return; // handled elsewhere if needed
          // Normalize to supabase signal format
          const normalized = {
            from_user: data.from || data.from_user || data.header?.from,
            to_user: data.to || data.to_user || data.header?.to || this.userId,
            kind: data.kind || data.type || data.header?.kind,
            payload: data.payload || data.data || data,
          };
          if (normalized.from_user && normalized.from_user !== this.userId) {
            this.onSignal?.(normalized);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.reconnectAttempts < this.maxReconnect) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect().catch(() => {}), 1000 * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (e) => {
        clearTimeout(timeout);
        this.connected = false;
        reject(e);
      };
    });
  }

  async signal(to: string, kind: string, payload: any): Promise<boolean> {
    const packet = {
      from: this.userId,
      to,
      kind,
      payload,
      at: Date.now(),
    };

    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(packet));
        return true;
      } catch {
        this.connected = false;
      }
    }

    // Queue for when connected
    this.messageQueue.push(packet);
    if (this.messageQueue.length > 100) this.messageQueue.shift();

    // Try to connect if not connected
    if (!this.connected) {
      this.connect().catch(() => {});
    }

    return false;
  }

  // For trusted relay forwarding
  async sendTrusted(to: string, trustedPeers: string[], originalPayload: any): Promise<void> {
    const packet = {
      type: "trusted_forward",
      from: this.userId,
      to,
      finalTo: to,
      trusted: trustedPeers,
      payload: originalPayload,
      at: Date.now(),
    };

    // Send via relay to trusted peers
    if (this.ws && this.connected) {
      try { this.ws.send(JSON.stringify(packet)); } catch {}
    }

    // Also send directly via supabase fallback? The trusted peers will handle via their own relay
  }

  disconnect() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}
