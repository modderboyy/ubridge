import { UBridgeError, ERR, toBase64Url, fromBase64Url } from "@ubridge/core";

export function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new UBridgeError(ERR.CRYPTO_UNAVAILABLE, "WebCrypto is not available in this runtime");
  return c;
}

export async function generateAesKey(): Promise<CryptoKey> {
  return getCrypto().subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await getCrypto().subtle.exportKey("raw", key)));
}

export async function importAesKey(raw: string): Promise<CryptoKey> {
  const bytes = fromBase64Url(raw);
  const keyData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return getCrypto().subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
