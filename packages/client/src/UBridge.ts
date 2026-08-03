import { createPacket, type TextMessage, type UBridgePacket } from "@ubridge/core";
import type { UBridgeTransport } from "@ubridge/transport";

export interface UBridgeIdentity {
  userId: string;
  deviceId?: string;
}

export interface UBridgeConnectOptions {
  identity: UBridgeIdentity;
  transport: UBridgeTransport;
}

export class UBridge {
  private constructor(private readonly options: UBridgeConnectOptions) {}

  static async connect(options: UBridgeConnectOptions): Promise<UBridge> {
    await options.transport.open();
    const bridge = new UBridge(options);
    await options.transport.send(createPacket({
      kind: "hello",
      from: options.identity.userId,
      payload: {
        type: "hello",
        protocol: "ubridge/1",
        userId: options.identity.userId,
        deviceId: options.identity.deviceId ?? "default",
        capabilities: ["message", "presence", "file", "voice-signaling"],
      },
    }));
    return bridge;
  }

  async send(to: string, message: TextMessage | string): Promise<UBridgePacket> {
    const payload: TextMessage = typeof message === "string" ? { type: "text", text: message } : message;
    const packet = createPacket({ kind: "message", from: this.options.identity.userId, to, payload });
    await this.options.transport.send(packet);
    return packet;
  }

  onMessage(handler: (packet: UBridgePacket) => void): () => void {
    return this.options.transport.onPacket((packet) => {
      if (packet.header.kind === "message") handler(packet);
    });
  }

  async close(): Promise<void> {
    await this.options.transport.close();
  }
}
