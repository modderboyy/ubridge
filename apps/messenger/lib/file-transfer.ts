// Full file chunking over WebRTC DataChannel - P2P, encrypted, no server storage
export type FileOffer = {
  type: "file_offer";
  fileId: string;
  name: string;
  size: number;
  mime?: string;
  chunkSize: number;
  totalChunks: number;
  sha256?: string;
};

export type FileChunk = {
  type: "file_chunk";
  fileId: string;
  index: number;
  data: string; // base64
  isLast?: boolean;
};

export type FileAck = {
  type: "file_ack";
  fileId: string;
  index: number;
};

export type FileDone = {
  type: "file_done";
  fileId: string;
};

export type FileError = {
  type: "file_error";
  fileId: string;
  error: string;
};

export type FileTransferState = "offering" | "sending" | "receiving" | "completed" | "error" | "paused";

export type FileTransfer = {
  fileId: string;
  name: string;
  size: number;
  mime?: string;
  chunkSize: number;
  totalChunks: number;
  transferred: number; // bytes
  receivedChunks: number;
  state: FileTransferState;
  progress: number; // 0-100
  blobUrl?: string;
  error?: string;
  direction: "send" | "receive";
  chunks?: Map<number, Uint8Array>; // for receiving
  file?: File; // for sending
};

export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16KB - safe for DataChannel

export function createFileOffer(file: File, chunkSize = DEFAULT_CHUNK_SIZE): FileOffer {
  return {
    type: "file_offer",
    fileId: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: file.name,
    size: file.size,
    mime: file.type,
    chunkSize,
    totalChunks: Math.ceil(file.size / chunkSize),
  };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export async function* chunkFile(file: File, chunkSize = DEFAULT_CHUNK_SIZE): AsyncGenerator<{ index: number; data: Uint8Array }> {
  let offset = 0;
  let index = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buf = await slice.arrayBuffer();
    yield { index: index++, data: new Uint8Array(buf) };
    offset += chunkSize;
  }
}

export function assembleChunks(chunks: Map<number, Uint8Array>, totalChunks: number): Uint8Array | null {
  if (chunks.size !== totalChunks) return null;
  // check all indices present
  let total = 0;
  for (let i = 0; i < totalChunks; i++) {
    const c = chunks.get(i);
    if (!c) return null;
    total += c.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < totalChunks; i++) {
    const c = chunks.get(i)!;
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// P2P Sender with backpressure handling
export class FileSender {
  private dc: RTCDataChannel;
  private file: File;
  private offer: FileOffer;
  private onProgress: (p: number) => void;
  private aborted = false;

  constructor(dc: RTCDataChannel, file: File, offer: FileOffer, onProgress: (p: number) => void) {
    this.dc = dc;
    this.file = file;
    this.offer = offer;
    this.onProgress = onProgress;
    // optimize bufferedAmountLowThreshold
    try { this.dc.bufferedAmountLowThreshold = 256 * 1024; } catch {}
  }

  abort() { this.aborted = true; }

  async send(encryptFn: (data: any) => Promise<any>) {
    // send offer first
    const encOffer = await encryptFn(this.offer);
    this.dc.send(JSON.stringify({ box: encOffer }));

    let sent = 0;
    for await (const { index, data } of chunkFile(this.file, this.offer.chunkSize)) {
      if (this.aborted) throw new Error("Aborted");
      // backpressure - wait if bufferedAmount too high
      while (this.dc.bufferedAmount > 512 * 1024) {
        await new Promise<void>((res) => {
          const onLow = () => { this.dc.removeEventListener("bufferedamountlow", onLow); res(); };
          this.dc.addEventListener("bufferedamountlow", onLow);
          setTimeout(() => { this.dc.removeEventListener("bufferedamountlow", onLow); res(); }, 100);
        });
      }
      const chunk: FileChunk = { type: "file_chunk", fileId: this.offer.fileId, index, data: bytesToBase64(data), isLast: index === this.offer.totalChunks - 1 };
      const enc = await encryptFn(chunk);
      this.dc.send(JSON.stringify({ box: enc }));
      sent += data.length;
      this.onProgress(Math.round((sent / this.file.size) * 100));
    }
    const done: FileDone = { type: "file_done", fileId: this.offer.fileId };
    const encDone = await encryptFn(done);
    this.dc.send(JSON.stringify({ box: encDone }));
  }
}

// Receiver
export class FileReceiver {
  public transfer: FileTransfer;
  private onUpdate: (t: FileTransfer) => void;

  constructor(offer: FileOffer, onUpdate: (t: FileTransfer) => void) {
    this.transfer = {
      fileId: offer.fileId,
      name: offer.name,
      size: offer.size,
      mime: offer.mime,
      chunkSize: offer.chunkSize,
      totalChunks: offer.totalChunks,
      transferred: 0,
      receivedChunks: 0,
      state: "receiving",
      progress: 0,
      direction: "receive",
      chunks: new Map(),
    };
    this.onUpdate = onUpdate;
  }

  receiveChunk(chunk: FileChunk) {
    if (!this.transfer.chunks) this.transfer.chunks = new Map();
    if (this.transfer.chunks.has(chunk.index)) return; // duplicate
    const bytes = base64ToBytes(chunk.data);
    this.transfer.chunks.set(chunk.index, bytes);
    this.transfer.receivedChunks = this.transfer.chunks.size;
    this.transfer.transferred += bytes.length;
    this.transfer.progress = Math.round((this.transfer.transferred / this.transfer.size) * 100);
    this.onUpdate({ ...this.transfer });
  }

  complete(): FileTransfer {
    if (!this.transfer.chunks) throw new Error("No chunks");
    const assembled = assembleChunks(this.transfer.chunks, this.transfer.totalChunks);
    if (!assembled) throw new Error("Missing chunks");
    const blob = new Blob([assembled as any], { type: this.transfer.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    this.transfer.blobUrl = url;
    this.transfer.state = "completed";
    this.transfer.progress = 100;
    this.onUpdate({ ...this.transfer });
    return this.transfer;
  }

  getProgress() { return this.transfer.progress; }
}
