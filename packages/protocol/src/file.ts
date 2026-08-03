export interface FileOfferPayload {
  type: "file_offer";
  fileId: string;
  name: string;
  size: number;
  mime?: string;
  chunkSize: number;
  totalChunks: number;
  sha256?: string;
}

export interface FileChunkPayload {
  type: "file_chunk";
  fileId: string;
  index: number;
  bytes: string;
}
