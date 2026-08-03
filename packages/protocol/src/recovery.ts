export interface RecoveryCursor {
  conversationId: string;
  afterPacketId?: string;
  afterTimestamp?: number;
}

export interface RecoveryRequestPayload {
  type: "recovery_request";
  cursors: RecoveryCursor[];
}
