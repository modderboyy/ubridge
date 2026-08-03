import { fromBase64Url, toBase64Url } from "@ubridge/core";
import { generateAesKey, getCrypto } from "./webcrypto.js";

export interface EncryptedBox {
  alg: "AES-GCM";
  nonce: string;
  ciphertext: string;
}

export async function encryptJson(key: CryptoKey, value: unknown, aad?: string): Promise<EncryptedBox> {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await getCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad ? new TextEncoder().encode(aad) : undefined },
    key,
    data,
  );
  return { alg: "AES-GCM", nonce: toBase64Url(nonce), ciphertext: toBase64Url(new Uint8Array(encrypted)) };
}

export async function decryptJson<T>(key: CryptoKey, box: EncryptedBox, aad?: string): Promise<T> {
  const plain = await getCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: (() => { const bytes = fromBase64Url(box.nonce); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; })(), additionalData: aad ? new TextEncoder().encode(aad) : undefined },
    key,
    (() => { const bytes = fromBase64Url(box.ciphertext); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; })(),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function createSessionKey(): Promise<CryptoKey> {
  return generateAesKey();
}
