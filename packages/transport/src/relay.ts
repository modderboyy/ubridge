import type { UBridgeTransport } from "./types.js";

export interface RelayCandidate {
  url: string;
  priority: number;
}

export async function chooseRelay(candidates: RelayCandidate[]): Promise<RelayCandidate | null> {
  return [...candidates].sort((a, b) => a.priority - b.priority)[0] ?? null;
}

export interface TransportManagerOptions {
  direct?: UBridgeTransport;
  relay?: UBridgeTransport;
  queue?: UBridgeTransport;
}

export class TransportManager {
  constructor(private readonly options: TransportManagerOptions) {}

  async best(): Promise<UBridgeTransport> {
    if (this.options.direct?.state === "open") return this.options.direct;
    if (this.options.relay?.state !== "open") await this.options.relay?.open();
    if (this.options.relay?.state === "open") return this.options.relay;
    if (this.options.queue) return this.options.queue;
    throw new Error("No transport available");
  }
}
