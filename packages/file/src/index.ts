import { randomId, toBase64Url, fromBase64Url } from "@ubridge/core";
import type { FileChunkPayload, FileOfferPayload } from "@ubridge/protocol";

export function createFileOffer(input: { name: string; size: number; mime?: string; chunkSize?: number; sha256?: string }): FileOfferPayload {
  const chunkSize = input.chunkSize ?? 64 * 1024;
  return { type: "file_offer", fileId: randomId("file"), name: input.name, size: input.size, mime: input.mime, chunkSize, totalChunks: Math.ceil(input.size / chunkSize), sha256: input.sha256 };
}

export function chunkBytes(fileId: string, bytes: Uint8Array, chunkSize = 64 * 1024): FileChunkPayload[] {
  const chunks: FileChunkPayload[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push({ type: "file_chunk", fileId, index: chunks.length, bytes: toBase64Url(bytes.slice(i, i + chunkSize)) });
  return chunks;
}

export function assembleChunks(chunks: FileChunkPayload[]): Uint8Array {
  const sorted = [...chunks].sort((a, b) => a.index - b.index).map((c) => fromBase64Url(c.bytes));
  const total = sorted.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of sorted) { out.set(b, off); off += b.length; }
  return out;
}
