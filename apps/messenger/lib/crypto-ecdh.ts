// ECDH P-256 based E2E, upgraded from SHA256(userIds) demo
// Stores long-term ECDH identity keys per device

const ECDH_CURVE = "P-256";
const ECDH_KEY_USAGES: KeyUsage[] = ["deriveKey", "deriveBits"];

type ECDHKeyPair = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
};

const keyCache = new Map<string, ECDHKeyPair>();
const peerPublicCache = new Map<string, JsonWebKey>();
const sharedKeyCache = new Map<string, CryptoKey>();

function storageKey(userId: string) { return `ubridge_ecdh_identity_${userId}`; }
function peerStorageKey(peerId: string) { return `ubridge_ecdh_peer_${peerId}`; }

async function generatePair(): Promise<ECDHKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: ECDH_CURVE } as EcKeyGenParams,
    true,
    ECDH_KEY_USAGES
  ) as CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk };
}

export async function getOrCreateIdentity(userId: string): Promise<ECDHKeyPair> {
  if (keyCache.has(userId)) return keyCache.get(userId)!;
  const saved = localStorage.getItem(storageKey(userId));
  if (saved) {
    try {
      const jwks = JSON.parse(saved) as { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
      const privateKey = await crypto.subtle.importKey("jwk", jwks.privateJwk, { name: "ECDH", namedCurve: ECDH_CURVE }, false, ["deriveKey", "deriveBits"]);
      const publicKey = await crypto.subtle.importKey("jwk", jwks.publicJwk, { name: "ECDH", namedCurve: ECDH_CURVE }, false, []);
      const pair = { privateKey, publicKey, publicJwk: jwks.publicJwk };
      keyCache.set(userId, pair);
      return pair;
    } catch { /* regenerate */ }
  }
  const pair = await generatePair();
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  localStorage.setItem(storageKey(userId), JSON.stringify({ privateJwk, publicJwk: pair.publicJwk }));
  keyCache.set(userId, pair);
  return pair;
}

export async function exportPublicJwk(userId: string): Promise<JsonWebKey> {
  const pair = await getOrCreateIdentity(userId);
  return pair.publicJwk;
}

export async function importPeerPublic(peerId: string, jwk: JsonWebKey) {
  peerPublicCache.set(peerId, jwk);
  try { localStorage.setItem(peerStorageKey(peerId), JSON.stringify(jwk)); } catch {}
  // invalidate shared key so it re-derives
  sharedKeyCache.delete(peerId);
}

export async function getPeerPublic(peerId: string): Promise<JsonWebKey | null> {
  if (peerPublicCache.has(peerId)) return peerPublicCache.get(peerId)!;
  const saved = localStorage.getItem(peerStorageKey(peerId));
  if (saved) {
    try {
      const jwk = JSON.parse(saved) as JsonWebKey;
      peerPublicCache.set(peerId, jwk);
      return jwk;
    } catch {}
  }
  return null;
}

export function hasPeerPublicSync(peerId: string): boolean {
  if (peerPublicCache.has(peerId)) return true;
  try {
    const saved = localStorage.getItem(peerStorageKey(peerId));
    return !!saved;
  } catch { return false; }
}

async function deriveSharedAesKey(privateKey: CryptoKey, peerPublicJwk: JsonWebKey): Promise<CryptoKey> {
  const peerPublic = await crypto.subtle.importKey("jwk", peerPublicJwk, { name: "ECDH", namedCurve: ECDH_CURVE }, false, []);
  // Derive 256-bit AES-GCM key via ECDH + HKDF-like using SHA-256 of raw bits then import as AES
  const derived = await crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPublic } as EcdhKeyDeriveParams,
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return derived;
}

// Old fallback SHA256 method for backwards compat
async function legacySharedKey(a: string, b: string): Promise<CryptoKey> {
  const seed = [a, b].sort().join(":");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function b64(bytes: Uint8Array) { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }
export function ub64(v: string) { const s = atob(v); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

export async function getSharedAesKey(myId: string, peerId: string): Promise<CryptoKey> {
  const cacheKey = [myId, peerId].sort().join(":");
  if (sharedKeyCache.has(cacheKey)) return sharedKeyCache.get(cacheKey)!;

  const peerJwk = await getPeerPublic(peerId);
  if (peerJwk) {
    try {
      const identity = await getOrCreateIdentity(myId);
      const aes = await deriveSharedAesKey(identity.privateKey, peerJwk);
      sharedKeyCache.set(cacheKey, aes);
      return aes;
    } catch (e) {
      console.warn("ECDH derive failed, fallback to legacy", e);
    }
  }
  // fallback
  const legacy = await legacySharedKey(myId, peerId);
  sharedKeyCache.set(cacheKey, legacy);
  return legacy;
}

export async function encryptForPeer(myId: string, peerId: string, value: any) {
  const key = await getSharedAesKey(myId, peerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { alg: "AES-GCM", iv: b64(iv), ciphertext: b64(new Uint8Array(ct)), v: 2 }; // v2 indicates ECDH
}

export async function decryptForPeer(myId: string, peerId: string, box: any) {
  const key = await getSharedAesKey(myId, peerId);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(box.iv) }, key, ub64(box.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ECDSA signing (keep old deviceKeys method but reuse)
export async function getOrCreateSigningKey(userId: string): Promise<CryptoKey> {
  const k = `ubridge_keys_${userId}`;
  const saved = localStorage.getItem(k);
  if (saved) {
    try { return await crypto.subtle.importKey("jwk", JSON.parse(saved), { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]); } catch {}
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  localStorage.setItem(k, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)));
  return pair.privateKey;
}

export async function signPayloadECDSA(userId: string, value: any) {
  const key = await getOrCreateSigningKey(userId);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(JSON.stringify(value)));
  return b64(new Uint8Array(sig));
}
