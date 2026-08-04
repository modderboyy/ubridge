/**
 * UBridge P2P Connection Manager - Background persistent connections
 * - Keeps multiple peer connections alive in background
 * - Fast connecting via Trickle ICE + Supabase Realtime broadcast
 * - Chat restore when peer cleared cache
 */

import { chatIdFor, getChat, ensureChat, upsertChat, type LocalChat } from "./local-db";
import { exportPublicJwk, importPeerPublic, encryptForPeer, decryptForPeer } from "./crypto-ecdh";
import { CloudflareRelay } from "./cloudflare-relay";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type ConnectionState = "idle" | "connecting" | "connected" | "failed";

export type PeerConnection = {
  peerId: string;
  peer: UserRow;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  state: ConnectionState;
  lastConnectedAt: number | null;
  lastTriedAt: number;
  retryCount: number;
  isBackground: boolean;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.nextcloud.com:443" },
];

export class P2PManager {
  private connections = new Map<string, PeerConnection>();
  private supabase: any;
  private myId: string;
  private myName: string;
  private onMessage: ((peerId: string, data: any) => void) | null = null;
  private onStateChange: ((peerId: string, state: ConnectionState) => void) | null = null;
  private onDataChannelOpen: ((peerId: string) => void) | null = null;
  private signalChannel: any = null;
  private cfRelay: CloudflareRelay | null = null;
  private useCloudflare = true;

  constructor(supabase: any, myId: string, myName: string) {
    this.supabase = supabase;
    this.myId = myId;
    this.myName = myName;
    // Init Cloudflare relay for ultra-fast signaling
    try {
      this.cfRelay = new CloudflareRelay(myId, myName);
      this.cfRelay.setHandler((data) => {
        void this.handleSignal({ from_user: data.from_user, to_user: data.to_user, kind: data.kind, payload: data.payload } as any);
      });
      this.cfRelay.connect().catch(() => {
        this.useCloudflare = false;
      });
    } catch {
      this.useCloudflare = false;
    }
  }

  setHandlers(handlers: {
    onMessage?: (peerId: string, data: any) => void;
    onStateChange?: (peerId: string, state: ConnectionState) => void;
    onDataChannelOpen?: (peerId: string) => void;
  }) {
    if (handlers.onMessage) this.onMessage = handlers.onMessage;
    if (handlers.onStateChange) this.onStateChange = handlers.onStateChange;
    if (handlers.onDataChannelOpen) this.onDataChannelOpen = handlers.onDataChannelOpen;
  }

  // Fast signaling via Cloudflare + Supabase Realtime Broadcast + RPC fallback
  async initRealtime() {
    try {
      this.signalChannel = this.supabase.channel(`ubridge-signals-bg-${this.myId}`)
        .on("broadcast", { event: "signal" }, (payload: any) => {
          const { to, from, kind, data } = payload.payload;
          if (to === this.myId && from !== this.myId) {
            void this.handleSignal({ from_user: from, to_user: to, kind, payload: data } as any);
          }
        })
        .subscribe();
    } catch {}

    // Cloudflare already connecting in constructor, ensure connected
    if (this.cfRelay) {
      this.cfRelay.connect().catch(() => {});
    }
  }

  async signal(to: string, kind: string, payload: any) {
    let cfSent = false;

    // 1. Cloudflare WebSocket - FASTEST (0-50ms)
    if (this.useCloudflare && this.cfRelay) {
      try {
        cfSent = await this.cfRelay.signal(to, kind, payload);
      } catch {}
    }

    // 2. Supabase Realtime Broadcast - FAST (50-200ms)
    try {
      if (this.signalChannel) {
        await this.signalChannel.send({
          type: "broadcast",
          event: "signal",
          payload: { to, from: this.myId, kind, data: payload },
        });
      }
    } catch {}

    // 3. RPC fallback - RELIABLE but slower (200-800ms)
    // Only use RPC if Cloudflare failed or for critical signals (offer/answer)
    if (!cfSent || kind === "offer" || kind === "answer") {
      try {
        await this.supabase.rpc("ubridge_signal", { p_to: to, p_kind: kind, p_payload: payload });
      } catch {}
    }
  }

  // Trusted relay: send via selected online peers for speed & reliability
  async sendViaTrusted(to: string, trustedPeerIds: string[], originalBox: any): Promise<void> {
    if (this.cfRelay && trustedPeerIds.length > 0) {
      try {
        await this.cfRelay.sendTrusted(to, trustedPeerIds, originalBox);
      } catch {}
    }
    // Also try direct via existing DCs to trusted peers
    for (const trustedId of trustedPeerIds) {
      const dc = this.getDataChannel(trustedId);
      if (dc && dc.readyState === "open") {
        try {
          const forwardPayload = {
            type: "trusted_forward",
            finalTo: to,
            from: this.myId,
            originalBox,
            trusted: trustedPeerIds,
          };
          const box = await encryptForPeer(this.myId, trustedId, forwardPayload);
          dc.send(JSON.stringify({ box }));
        } catch {}
      }
    }
  }

  private createPC(peer: UserRow, isBackground = false): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
    
    pc.onicecandidate = (e) => {
      if (e.candidate) void this.signal(peer.user_id, "candidate", e.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const conn = this.connections.get(peer.user_id);
      if (!conn) return;
      const state = pc.connectionState;
      if (state === "connected") {
        conn.state = "connected";
        conn.lastConnectedAt = Date.now();
        conn.retryCount = 0;
        this.onStateChange?.(peer.user_id, "connected");
        // Chat restore: when just connected, announce our chats
        void this.announceChatRestore(peer.user_id);
      } else if (state === "connecting") {
        conn.state = "connecting";
        this.onStateChange?.(peer.user_id, "connecting");
      } else if (state === "failed" || state === "disconnected" || state === "closed") {
        conn.state = "failed";
        this.onStateChange?.(peer.user_id, "failed");
        // Auto-retry after delay if it was background connection
        if (isBackground && conn.retryCount < 3) {
          conn.retryCount++;
          setTimeout(() => {
            if (this.connections.has(peer.user_id)) void this.ensureConnection(peer, true);
          }, 3000 * conn.retryCount);
        }
      }
    };

    pc.ondatachannel = (ev) => {
      this.setupDataChannel(peer, ev.channel);
    };

    return pc;
  }

  private setupDataChannel(peer: UserRow, channel: RTCDataChannel) {
    const conn = this.connections.get(peer.user_id);
    if (conn) conn.dc = channel;

    channel.onopen = async () => {
      if (conn) conn.state = "connected";
      this.onStateChange?.(peer.user_id, "connected");
      this.onDataChannelOpen?.(peer.user_id);

      // Fast ECDH announce
      try {
        const pub = await exportPublicJwk(this.myId);
        const box = await encryptForPeer(this.myId, peer.user_id, { type: "ecdh_announce", publicJwk: pub });
        channel.send(JSON.stringify({ box }));
      } catch {}

      // Chat restore - announce that we have chat history
      void this.announceChatRestore(peer.user_id);
    };

    channel.onclose = () => {
      if (conn) conn.state = "idle";
      this.onStateChange?.(peer.user_id, "idle");
    };

    channel.onmessage = async (ev) => {
      try {
        const raw = JSON.parse(String(ev.data));
        if (raw.typing !== undefined) {
          this.onMessage?.(peer.user_id, { typing: raw.typing });
          return;
        }
        const body = raw.box ? await decryptForPeer(this.myId, peer.user_id, raw.box) : raw;
        if (!body) return;

        if (body.type === "ecdh_announce" && body.publicJwk) {
          await importPeerPublic(peer.user_id, body.publicJwk);
          return;
        }

        // Chat restore handling
        if (body.type === "chat_restore") {
          const chatId = chatIdFor(peer.user_id);
          const existing = await getChat(chatId);
          if (!existing) {
            // Peer has our chat but we cleared - restore it!
            await ensureChat({
              id: chatId,
              peerId: peer.user_id,
              title: body.title || peer.name,
              pinned: false,
              unread: 0,
              lastMessage: body.lastMessage || "",
              lastAt: body.lastAt || Date.now(),
              typing: false,
            });
            // Could trigger UI refresh via callback
            this.onMessage?.(peer.user_id, { type: "chat_restored", chatId });
          }
          return;
        }

        this.onMessage?.(peer.user_id, body);
      } catch (e) {
        console.warn("P2P BG message error", e);
      }
    };
  }

  private async announceChatRestore(peerId: string) {
    const conn = this.connections.get(peerId);
    if (!conn || !conn.dc || conn.dc.readyState !== "open") return;
    try {
      const chatId = chatIdFor(peerId);
      const chat = await getChat(chatId);
      if (chat) {
        const payload = {
          type: "chat_restore",
          peerId: this.myId,
          title: this.myName,
          lastMessage: chat.lastMessage,
          lastAt: chat.lastAt,
        };
        const box = await encryptForPeer(this.myId, peerId, payload);
        conn.dc.send(JSON.stringify({ box }));
      }
    } catch {}
  }

  async ensureConnection(peer: UserRow, isBackground = false): Promise<PeerConnection> {
    const existing = this.connections.get(peer.user_id);
    if (existing) {
      if (existing.state === "connected" && existing.pc.connectionState === "connected") {
        return existing;
      }
      // If connecting, return existing
      if (existing.state === "connecting" && Date.now() - existing.lastTriedAt < 10000) {
        return existing;
      }
      // Close old if failed
      try { existing.pc.close(); } catch {}
    }

    const pc = this.createPC(peer, isBackground);
    const conn: PeerConnection = {
      peerId: peer.user_id,
      peer,
      pc,
      dc: null,
      state: "connecting",
      lastConnectedAt: null,
      lastTriedAt: Date.now(),
      retryCount: 0,
      isBackground,
    };
    this.connections.set(peer.user_id, conn);

    // For background, we create data channel immediately for fast connect
    const channel = pc.createDataChannel(`ubridge-bg-${isBackground ? "bg" : "main"}`, { ordered: true });
    this.setupDataChannel(peer, channel);

    // Trickle ICE - send offer immediately without waiting
    const myPub = await exportPublicJwk(this.myId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
    await pc.setLocalDescription(offer);
    await this.signal(peer.user_id, "offer", {
      sdp: offer.sdp,
      type: offer.type,
      ecdhPublic: myPub,
      callerName: this.myName,
      media: {}, // no media for bg
      isBackground,
    });

    return conn;
  }

  async handleSignal(row: { from_user: string; to_user: string; kind: string; payload: any }) {
    const peerId = row.from_user;
    if (peerId === this.myId) return;

    // Import ECDH
    if (row.payload?.ecdhPublic) {
      await importPeerPublic(peerId, row.payload.ecdhPublic);
    }

    let conn = this.connections.get(peerId);
    const peer: UserRow = conn?.peer || { user_id: peerId, name: row.payload?.callerName || "Peer", online: true, status: null, relay: null, last_seen: null };

    if (row.kind === "offer") {
      // If we already have a connected PC, ignore duplicate offers unless it's a call
      const isCall = !!(row.payload?.media?.audio || row.payload?.media?.video);
      if (conn && conn.state === "connected" && !isCall && !row.payload?.isBackground) {
        // Already connected for messaging, but still answer to keep alive? Skip for bg
        if (row.payload?.isBackground) return;
      }

      if (!conn) {
        const pc = this.createPC(peer, !!row.payload?.isBackground);
        conn = {
          peerId,
          peer,
          pc,
          dc: null,
          state: "connecting",
          lastConnectedAt: null,
          lastTriedAt: Date.now(),
          retryCount: 0,
          isBackground: !!row.payload?.isBackground,
        };
        this.connections.set(peerId, conn);
      }

      try {
        await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: row.payload.type || "offer", sdp: row.payload.sdp }));
        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);
        const myPub = await exportPublicJwk(this.myId);
        await this.signal(peerId, "answer", { sdp: answer.sdp, type: answer.type, ecdhPublic: myPub });
      } catch (e) {
        console.warn("BG handle offer failed", e);
      }
    } else if (row.kind === "answer" && conn) {
      try {
        await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: row.payload.type, sdp: row.payload.sdp }));
      } catch {}
    } else if (row.kind === "candidate" && conn) {
      try {
        await conn.pc.addIceCandidate(new RTCIceCandidate(row.payload));
      } catch {}
    } else if (row.kind === "hangup" && conn) {
      try { conn.pc.close(); } catch {}
      this.connections.delete(peerId);
      this.onStateChange?.(peerId, "idle");
    }
  }

  // Poll fallback for signals (if realtime fails)
  async pollSignals() {
    try {
      const { data } = await this.supabase.rpc("ubridge_poll_signals");
      if (!Array.isArray(data)) return;
      for (const row of data) {
        if (row.from_user === this.myId) continue;
        await this.handleSignal(row);
      }
    } catch {}
  }

  getConnection(peerId: string): PeerConnection | undefined {
    return this.connections.get(peerId);
  }

  getAllConnections(): PeerConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectedPeers(): string[] {
    return Array.from(this.connections.values()).filter(c => c.state === "connected").map(c => c.peerId);
  }

  // Ensure background connections for all chats
  async ensureBackgroundConnections(peers: UserRow[]) {
    // Only try to connect to online peers, limit to 5 at a time for performance
    const online = peers.filter(p => p.online).slice(0, 6);
    for (const peer of online) {
      if (!this.connections.has(peer.user_id)) {
        // Small delay between connections to avoid flooding
        await new Promise(r => setTimeout(r, 400));
        void this.ensureConnection(peer, true).catch(() => {});
      }
    }
  }

  disconnectAll() {
    for (const conn of this.connections.values()) {
      try { conn.pc.close(); } catch {}
    }
    this.connections.clear();
  }

  getDataChannel(peerId: string): RTCDataChannel | null {
    return this.connections.get(peerId)?.dc || null;
  }

  isConnected(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return !!conn && conn.state === "connected" && conn.pc.connectionState === "connected";
  }

  // Add media tracks to existing connection (for voice/video calls)
  async addMediaTracks(peerId: string, stream: MediaStream): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    const pc = conn.pc;
    // Replace or add tracks
    stream.getTracks().forEach(track => {
      const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track).catch(() => {});
      } else {
        pc.addTrack(track, stream);
      }
    });
  }

  // Remove all media senders (end call)
  async removeMediaTracks(peerId: string): Promise<void> {
    const conn = this.connections.get(peerId);
    if (!conn) return;
    const pc = conn.pc;
    pc.getSenders().forEach(sender => {
      if (sender.track && (sender.track.kind === "audio" || sender.track.kind === "video")) {
        try { pc.removeTrack(sender); } catch {}
      }
    });
  }

  // Get PC for media handling
  getPC(peerId: string): RTCPeerConnection | null {
    return this.connections.get(peerId)?.pc || null;
  }
}
