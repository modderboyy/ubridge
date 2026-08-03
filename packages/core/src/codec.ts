import { UBridgeError, ERR } from "./errors.js";
import type { UBridgePacket } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodePacket(packet: UBridgePacket): Uint8Array {
  return encoder.encode(JSON.stringify(packet));
}

export function decodePacket(bytes: Uint8Array | ArrayBuffer | string): UBridgePacket {
  const text = typeof bytes === "string" ? bytes : decoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const parsed = JSON.parse(text) as UBridgePacket;
  assertPacket(parsed);
  return parsed;
}

export function assertPacket(packet: UBridgePacket): void {
  if (!packet || typeof packet !== "object") throw new UBridgeError(ERR.BAD_PACKET, "Packet must be an object");
  if (!packet.header || packet.header.version !== 1) throw new UBridgeError(ERR.BAD_PACKET, "Unsupported packet version");
  if (!packet.header.kind || !packet.header.id || !packet.header.from) throw new UBridgeError(ERR.BAD_PACKET, "Missing packet header fields");
}
