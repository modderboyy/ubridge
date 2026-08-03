export type PresenceState = "online" | "offline" | "away" | "typing" | "in_call";

export interface PresencePayload {
  type: "presence";
  state: PresenceState;
  at: number;
  ttlMs?: number;
}
