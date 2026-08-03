import { randomId } from "@ubridge/core";
import type { CallKind, CallSignalPayload, CallSignalType } from "@ubridge/protocol";

export function createCallSignal(kind: CallKind, signal: CallSignalType, data: Partial<CallSignalPayload> = {}): CallSignalPayload {
  return { type: "call_signal", callId: data.callId ?? randomId("call"), kind, signal, sdp: data.sdp, candidate: data.candidate };
}

export const voice = {
  offer: (sdp: string) => createCallSignal("voice", "offer", { sdp }),
  answer: (callId: string, sdp: string) => createCallSignal("voice", "answer", { callId, sdp }),
  end: (callId: string) => createCallSignal("voice", "end", { callId }),
};
