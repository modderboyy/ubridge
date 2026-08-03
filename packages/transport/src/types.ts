import type { UBridgePacket } from "@ubridge/core";

export type TransportState = "idle" | "connecting" | "open" | "closed";

export interface UBridgeTransport {
  readonly state: TransportState;
  open(): Promise<void>;
  close(): Promise<void> | void;
  send(packet: UBridgePacket): Promise<void>;
  onPacket(handler: (packet: UBridgePacket) => void): () => void;
  onState?(handler: (state: TransportState) => void): () => void;
}
