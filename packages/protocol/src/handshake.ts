export interface HelloPayload {
  type: "hello";
  protocol: "ubridge/1";
  userId: string;
  deviceId: string;
  publicKey?: string;
  capabilities: string[];
}

export interface HandshakePayload {
  type: "handshake";
  sessionId: string;
  ephemeralPublicKey: string;
  supportedTransports: Array<"websocket" | "webrtc" | "relay" | "queue">;
}
