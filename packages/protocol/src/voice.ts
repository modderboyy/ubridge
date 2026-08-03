export type CallKind = "voice" | "video";
export type CallSignalType = "offer" | "answer" | "candidate" | "end" | "reject" | "missed";

export interface CallSignalPayload {
  type: "call_signal";
  callId: string;
  kind: CallKind;
  signal: CallSignalType;
  sdp?: string;
  candidate?: unknown;
}
