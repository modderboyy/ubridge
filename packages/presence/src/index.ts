import type { PresencePayload, PresenceState } from "@ubridge/protocol";

export type PresenceHandler = (userId: string, presence: PresencePayload) => void;

export class InMemoryPresenceService {
  private rows = new Map<string, PresencePayload>();
  private listeners = new Set<PresenceHandler>();

  heartbeat(userId: string, state: PresenceState = "online", ttlMs = 90_000): PresencePayload {
    const payload: PresencePayload = { type: "presence", state, at: Date.now(), ttlMs };
    this.rows.set(userId, payload);
    for (const l of this.listeners) l(userId, payload);
    return payload;
  }

  get(userId: string): PresencePayload | null {
    const p = this.rows.get(userId);
    if (!p) return null;
    if (p.ttlMs && Date.now() - p.at > p.ttlMs) return { ...p, state: "offline" };
    return p;
  }

  watch(handler: PresenceHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }
}
