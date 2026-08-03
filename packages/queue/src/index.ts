import type { UBridgePacket } from "@ubridge/core";

export interface OfflineQueue {
  enqueue(packet: UBridgePacket): Promise<void>;
  drain(userId: string): Promise<UBridgePacket[]>;
}

export class InMemoryOfflineQueue implements OfflineQueue {
  private byUser = new Map<string, UBridgePacket[]>();

  async enqueue(packet: UBridgePacket): Promise<void> {
    const to = packet.header.to;
    if (!to) return;
    const list = this.byUser.get(to) ?? [];
    list.push(packet);
    this.byUser.set(to, list);
  }

  async drain(userId: string): Promise<UBridgePacket[]> {
    const list = this.byUser.get(userId) ?? [];
    this.byUser.delete(userId);
    return list;
  }
}
