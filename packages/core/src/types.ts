export type UBridgeId = string;
export type DeviceId = string;
export type ConversationId = string;
export type UnixMs = number;

export type PacketKind =
  | "hello"
  | "handshake"
  | "message"
  | "presence"
  | "ack"
  | "file"
  | "voice"
  | "video"
  | "sync"
  | "error";

export interface PacketHeader {
  version: 1;
  kind: PacketKind;
  id: string;
  from: UBridgeId;
  fromDevice?: DeviceId;
  to?: UBridgeId;
  toDevice?: DeviceId;
  conversation?: ConversationId;
  timestamp: UnixMs;
  ttlMs?: number;
  route?: "direct" | "trusted" | "relay" | "queue";
  contentType?: string;
}

export interface UBridgePacket<TPayload = unknown> {
  header: PacketHeader;
  payload: TPayload;
  signature?: string;
}

export interface EncryptedPayload {
  alg: "AES-GCM" | "XCHACHA20-POLY1305";
  keyId: string;
  nonce: string;
  ciphertext: string;
  aad?: string;
}

export interface TextMessage {
  type: "text";
  text: string;
  replyTo?: string | null;
  clientMessageId?: string;
}

export interface AckPayload {
  type: "received" | "delivered" | "read";
  packetId: string;
  at: UnixMs;
}
