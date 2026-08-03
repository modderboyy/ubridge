import { randomId } from "./ids.js";
import type { PacketKind, UBridgePacket } from "./types.js";

export interface PacketInput<T> {
  kind: PacketKind;
  from: string;
  to?: string;
  payload: T;
  conversation?: string;
  route?: "direct" | "trusted" | "relay" | "queue";
}

export function createPacket<T>(input: PacketInput<T>): UBridgePacket<T> {
  return {
    header: {
      version: 1,
      kind: input.kind,
      id: randomId("pkt"),
      from: input.from,
      to: input.to,
      conversation: input.conversation,
      timestamp: Date.now(),
      route: input.route,
    },
    payload: input.payload,
  };
}
