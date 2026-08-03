export interface PeerRecord {
  userId: string;
  devices: PeerDevice[];
  publicKey?: string;
  lastSeen?: number;
}

export interface PeerDevice {
  deviceId: string;
  online: boolean;
  transports: TransportCandidate[];
  publicKey?: string;
}

export interface TransportCandidate {
  kind: "direct" | "relay" | "queue";
  url?: string;
  priority: number;
}
