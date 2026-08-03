import { decodePacket, encodePacket, type UBridgePacket } from "@ubridge/core";
import type { TransportState, UBridgeTransport } from "./types.js";

export class WebSocketTransport implements UBridgeTransport {
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
      ws.binaryType = "arraybuffer";
      ws.onopen = () => { this.setState("open"); resolve(); };
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
      ws.onclose = () => this.setState("closed");
      ws.onmessage = (event) => {
        const packet = decodePacket(typeof event.data === "string" ? event.data : event.data as ArrayBuffer);
        for (const h of this.packetHandlers) h(packet);
      };
    });
  }

  async send(packet: UBridgePacket): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket is not open");
    this.ws.send(encodePacket(packet));
  }

  close(): void {
    this.ws?.close();
    this.setState("closed");
  }

  onPacket(handler: (packet: UBridgePacket) => void): () => void {
    this.packetHandlers.add(handler);
    return () => this.packetHandlers.delete(handler);
  }

  onState(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  private setState(state: TransportState) {
    this.state = state;
    for (const h of this.stateHandlers) h(state);
  }
}
