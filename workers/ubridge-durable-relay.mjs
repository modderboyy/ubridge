export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    const room = url.pathname.startsWith('/room/') ? decodeURIComponent(url.pathname.slice(6)) : 'global';
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const id = env.UBRIDGE_ROOM.idFromName(room);
    return env.UBRIDGE_ROOM.get(id).fetch(request);
  }
};
export class UBridgeRoom {
  constructor(state, env) { this.state = state; this.env = env; this.sessions = new Map(); }
  async fetch(request) {
    const pair = new WebSocketPair(); const client = pair[0]; const server = pair[1]; server.accept();
    const url = new URL(request.url); const user = url.searchParams.get('user') || crypto.randomUUID();
    this.sessions.set(server, user);
    server.send(JSON.stringify({ type:'hello', user, at:Date.now() }));
    server.addEventListener('message', e => this.message(server, e.data));
    server.addEventListener('close', () => this.sessions.delete(server));
    server.addEventListener('error', () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client });
  }
  message(sender, data) {
    let packet; try { packet = typeof data === 'string' ? JSON.parse(data) : null; } catch { packet = null; }
    const to = packet?.header?.to;
    for (const [sock, user] of this.sessions) {
      if (sock === sender) continue;
      if (to && user !== to) continue;
      try { sock.send(data); } catch { this.sessions.delete(sock); }
    }
  }
}
