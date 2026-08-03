import { decodePacket, encodePacket, createPacket, type UBridgePacket } from "@ubridge/core";
import { WebSocketServer, type WebSocket } from "ws";

type Session = { socket: WebSocket; userId?: string; connectedAt: number };

export class UBridgeRelayRoom {
  private sessions = new Set<Session>();

  connect(socket: WebSocket): void {
    const session: Session = { socket, connectedAt: Date.now() };
    this.sessions.add(session);
    socket.on("message", (event) => this.onMessage(session, event));
    socket.on("close", () => this.sessions.delete(session));
    socket.on("error", () => this.sessions.delete(session));
  }

  private onMessage(sender: Session, data: WebSocket.RawData): void {
    const packet = decodePacket(data instanceof Buffer ? new Uint8Array(data) : typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer)) as UBridgePacket;
    sender.userId = packet.header.from;

    let delivered = 0;
    for (const session of this.sessions) {
      if (session === sender) continue;
      if (packet.header.to && session.userId && session.userId !== packet.header.to) continue;
      session.socket.send(encodePacket(packet));
      delivered++;
    }

    const ack = createPacket({ kind: "ack", from: "relay", to: packet.header.from, payload: { type: "delivered", packetId: packet.header.id, at: Date.now(), delivered } });
    sender.socket.send(encodePacket(ack));
  }
}

export interface RelayServerHandle { port: number; url: string; close(): Promise<void>; }

export async function startRelayServer(port = 8787): Promise<RelayServerHandle> {
  const room = new UBridgeRelayRoom();
  const server = new WebSocketServer({ port });
  server.on("connection", (socket) => room.connect(socket));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
