export interface SyncPatch<T = unknown> { channel: string; version: number; op: "set" | "delete" | "merge"; key: string; value?: T; }

export class SyncState<T = unknown> {
  private version = 0;
  private data = new Map<string, T>();
  apply(patch: SyncPatch<T>): void { this.version = Math.max(this.version, patch.version); if (patch.op === "delete") this.data.delete(patch.key); else this.data.set(patch.key, patch.value as T); }
  set(channel: string, key: string, value: T): SyncPatch<T> { const p = { channel, key, value, op: "set" as const, version: ++this.version }; this.apply(p); return p; }
  get(key: string): T | undefined { return this.data.get(key); }
  snapshot(): Record<string, T> { return Object.fromEntries(this.data); }
}
