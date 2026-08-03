import { decodePacket, encodePacket, type UBridgePacket } from "@ubridge/core";

type Session = { socket: WebSocket; userId?: string };

export class UBridgeRelayRoom {
  private sessions = new Set<Session>();

  connect(socket: WebSocket): void {
    const session: Session = { socket };
    this.sessions.add(session);
    socket.addEventListener("message", (event) => this.onMessage(session, event.data));
    socket.addEventListener("close", () => this.sessions.delete(session));
  }

  private onMessage(sender: Session, data: string | ArrayBuffer): void {
    const packet = decodePacket(data as ArrayBuffer) as UBridgePacket;
    sender.userId = packet.header.from;
    for (const session of this.sessions) {
      if (session === sender) continue;
      if (packet.header.to && session.userId && session.userId !== packet.header.to) continue;
      session.socket.send(encodePacket(packet));
    }
  }
}
