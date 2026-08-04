/**
 * UBridge Fast Signaling Relay - Cloudflare Durable Objects
 * Ultra-fast WebRTC signaling with trickle ICE support
 * Supports: offer/answer/candidate, presence, trusted relay
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ 
        ok: true, 
        at: Date.now(),
        region: request.cf?.colo || "unknown",
        ip: request.headers.get("CF-Connecting-IP") || "unknown"
      }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Upgrade, Sec-WebSocket-Protocol, Sec-WebSocket-Version",
        }
      });
    }

    // Get room from path: /room/<userId> or /signal/<userId>
    const match = url.pathname.match(/^\/(?:room|signal|ws)\/([^\/]+)/);
    const roomName = match ? decodeURIComponent(match[1]) : (url.searchParams.get("room") || url.searchParams.get("user") || "global");
    
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket - UBridge Fast Relay. Connect to /room/<userId>", { 
        status: 426,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const id = env.UBRIDGE_ROOM.idFromName(roomName);
    const stub = env.UBRIDGE_ROOM.get(id);
    return stub.fetch(request);
  }
};

export class UBridgeRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> {userId, joinedAt, lastSeen}
    this.userSockets = new Map(); // userId -> Set<ws>
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    
    // @ts-ignore - Cloudflare specific
    server.accept();

    const url = new URL(request.url);
    const userId = url.searchParams.get("user") || url.searchParams.get("peer") || crypto.randomUUID();
    const userName = url.searchParams.get("name") || "Anonymous";

    const session = {
      userId,
      userName,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
      colo: request.cf?.colo || "unknown",
    };

    this.sessions.set(server, session);
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId).add(server);

    // Send hello with server time for sync
    server.send(JSON.stringify({
      type: "hello",
      userId,
      at: Date.now(),
      serverTime: Date.now(),
      region: request.cf?.colo || "unknown",
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
      ]
    }));

    // Notify others about presence (fast)
    this.broadcastPresence();

    server.addEventListener("message", ev => this.onMessage(server, ev.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  onClose(ws) {
    const session = this.sessions.get(ws);
    if (session) {
      const set = this.userSockets.get(session.userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) this.userSockets.delete(session.userId);
      }
    }
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  broadcastPresence() {
    const users = Array.from(this.userSockets.keys()).map(userId => {
      const set = this.userSockets.get(userId);
      const first = set ? Array.from(set)[0] : null;
      const sess = first ? this.sessions.get(first) : null;
      return {
        userId,
        name: sess?.userName || userId,
        online: true,
        count: set?.size || 0,
      };
    });

    const payload = JSON.stringify({ type: "presence", users, at: Date.now() });
    for (const [ws] of this.sessions) {
      try { ws.send(payload); } catch { this.sessions.delete(ws); }
    }
  }

  onMessage(sender, raw) {
    let packet;
    try {
      packet = typeof raw === "string" ? JSON.parse(raw) : null;
    } catch {
      return;
    }
    if (!packet) return;

    const senderSession = this.sessions.get(sender);
    if (!senderSession) return;
    senderSession.lastSeen = Date.now();

    const to = packet.to || packet.header?.to || packet.target;
    const type = packet.type || packet.kind || packet.header?.kind;

    // Fast path for ICE trickle - relay immediately
    if (type === "candidate" || type === "offer" || type === "answer" || type === "hangup") {
      this.relayToUser(to, raw, sender);
      return;
    }

    // Trusted relay forwarding
    if (type === "trusted_forward" || packet.type === "trusted_forward") {
      // Forward to trusted peers + final destination if online
      const finalTo = packet.finalTo || packet.to;
      const trustedList = packet.trusted || packet.trustedPeers || [];
      
      // Send to all trusted peers
      for (const trustedId of trustedList) {
        this.relayToUser(trustedId, raw, sender);
      }
      // Also try final destination
      if (finalTo) this.relayToUser(finalTo, raw, sender);
      return;
    }

    // Broadcast to room or specific user
    if (to) {
      this.relayToUser(to, raw, sender);
    } else {
      // Broadcast to all except sender (for discovery)
      for (const [ws] of this.sessions) {
        if (ws === sender) continue;
        try { ws.send(raw); } catch { this.sessions.delete(ws); }
      }
    }
  }

  relayToUser(userId, raw, sender) {
    if (!userId) return;
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    for (const ws of sockets) {
      if (ws === sender) continue;
      try {
        ws.send(raw);
      } catch {
        this.sessions.delete(ws);
        sockets.delete(ws);
      }
    }
  }
}
