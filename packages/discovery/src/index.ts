import type { PeerRecord, TransportCandidate } from "@ubridge/protocol";

export interface DiscoveryService {
  register(record: PeerRecord): Promise<void>;
  resolve(userId: string): Promise<PeerRecord | null>;
  unregister(userId: string, deviceId?: string): Promise<void>;
}

export class InMemoryDiscoveryService implements DiscoveryService {
  private peers = new Map<string, PeerRecord>();

  async register(record: PeerRecord): Promise<void> {
    this.peers.set(record.userId, { ...record, lastSeen: Date.now() });
  }

  async resolve(userId: string): Promise<PeerRecord | null> {
    return this.peers.get(userId) ?? null;
  }

  async unregister(userId: string, deviceId?: string): Promise<void> {
    if (!deviceId) { this.peers.delete(userId); return; }
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.devices = peer.devices.filter((d) => d.deviceId !== deviceId);
    if (peer.devices.length === 0) this.peers.delete(userId);
  }
}

export function relayCandidate(url: string, priority = 100): TransportCandidate {
  return { kind: "relay", url, priority };
}
