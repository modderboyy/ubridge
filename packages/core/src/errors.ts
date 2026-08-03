export class UBridgeError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "UBridgeError";
    this.code = code;
    this.details = details;
  }
}

export const ERR = {
  BAD_PACKET: "BAD_PACKET",
  BAD_SIGNATURE: "BAD_SIGNATURE",
  CRYPTO_UNAVAILABLE: "CRYPTO_UNAVAILABLE",
  TRANSPORT_CLOSED: "TRANSPORT_CLOSED",
  PEER_OFFLINE: "PEER_OFFLINE",
  TIMEOUT: "TIMEOUT",
} as const;
