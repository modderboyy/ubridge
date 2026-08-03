export { UBridge } from "@ubridge/client";

import WebSocket from "ws";
import { decodePacket, encodePacket, type UBridgePacket } from "@ubridge/core";
import type { TransportState, UBridgeTransport } from "@ubridge/transport";

export class NodeWebSocketTransport implements UBridgeTransport {
  state: TransportState = "idle";
  private ws?: WebSocket;
  private packetHandlers = new Set<(packet: UBridgePacket) => void>();
  private stateHandlers = new Set<(state: TransportState) => void>();

  constructor(private readonly url: string) {}

  async open(): Promise<void> {
    if (this.state === "open") return;
    this.setState("connecting");
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.on("open", () => { this.setState("open"); resolve(); });
      ws.on("error", reject);
      ws.on("close", () => this.setState("closed"));
      ws.on("message", (data) => {
        const bytes = data instanceof Buffer ? new Uint8Array(data) : typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer);
        const packet = decodePacket(bytes);
        for (const h of this.packetHandlers) h(packet);
      });
    });
  }

  async send(packet: UBridgePacket): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open");
    this.ws.send(encodePacket(packet));
  }

  close(): void { this.ws?.close(); this.setState("closed"); }
  onPacket(handler: (packet: UBridgePacket) => void): () => void { this.packetHandlers.add(handler); return () => this.packetHandlers.delete(handler); }
  onState(handler: (state: TransportState) => void): () => void { this.stateHandlers.add(handler); return () => this.stateHandlers.delete(handler); }
  private setState(s: TransportState) { this.state = s; for (const h of this.stateHandlers) h(s); }
}
