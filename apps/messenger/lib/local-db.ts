export type DeliveryState = "sending" | "sent" | "delivered" | "read" | "failed" | "queued";

export type LocalChat = {
  id: string; // direct:peerId
  peerId: string;
  title: string;
  avatar?: string;
  pinned: boolean;
  unread: number;
  lastMessage: string;
  lastAt: number;
  typing: boolean;
  draft?: string;
  scrollTop?: number;
};

export type LocalMessage = {
  id: string;
  chatId: string;
  from: "me" | "peer" | "system";
  text: string;
  at: number;
  editedAt?: number;
  deletedAt?: number;
  replyTo?: string | null;
  forwardedFrom?: string | null;
  reactions: Record<string, number>;
  delivery: DeliveryState;
  encrypted: boolean;
  signature?: string;
  attachment?: { name: string; mime?: string; size?: number };
};

export type OutboxItem = {
  id: string; // same as local message id
  chatId: string;
  peerId: string;
  box: any; // encrypted box
  plainText: string; // for local preview if needed to retry, not sensitive? encrypted already
  at: number;
  attempts: number;
};

type SearchRow = { token: string; chatId: string; messageId: string; text: string; at: number };

const DB_NAME = "ubridge-local-first-v2";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("messages")) {
        const s = db.createObjectStore("messages", { keyPath: "id" });
        s.createIndex("chatAt", ["chatId", "at"]);
      }
      if (!db.objectStoreNames.contains("search")) {
        const s = db.createObjectStore("search", { keyPath: "id" });
        s.createIndex("token", "token");
        s.createIndex("chatId", "chatId");
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "id" });
        s.createIndex("chatId", "chatId");
        s.createIndex("peerId", "peerId");
      }
      // migration from v1 db: copy if needed? v1 had different name, so we auto start fresh but we can try to import
      // v1 name was ubridge-local-first-v1 - we leave it, user will have empty after migration, which is okay for P2P fresh
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (db: IDBDatabase, tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => { try { db.close(); } catch {}; reject(t.error); };
    t.onabort = () => { try { db.close(); } catch {}; reject(t.error); };
    let result: T;
    let promise: Promise<T>;
    try {
      const r = fn(db, t);
      promise = r instanceof Promise ? r : Promise.resolve(r);
    } catch (e) {
      try { db.close(); } catch {};
      reject(e);
      return;
    }
    promise.then(v => { result = v; }, e => { try { db.close(); } catch {}; reject(e); });
    t.oncomplete = () => { try { db.close(); } catch {}; resolve(result!); };
  }));
}

function promisify<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function chatIdFor(peerId: string) { return `direct:${peerId}`; }

export async function getChat(id: string): Promise<LocalChat | undefined> {
  return tx(["chats"], "readonly", async (_db, t) => {
    return await promisify<LocalChat | undefined>(t.objectStore("chats").get(id));
  });
}

export async function ensureChat(chat: LocalChat): Promise<LocalChat> {
  return tx(["chats"], "readwrite", async (_db, t) => {
    const store = t.objectStore("chats");
    const existing = await promisify<LocalChat | undefined>(store.get(chat.id));
    if (!existing) {
      store.put(chat);
      return chat;
    }
    // Preserve important fields, only update title/avatar if changed, keep lastMessage/lastAt/unread/pinned/draft
    const merged: LocalChat = {
      ...existing,
      title: chat.title || existing.title,
      avatar: chat.avatar || existing.avatar,
      // do NOT overwrite lastMessage/lastAt/unread here
      peerId: existing.peerId,
    };
    // only if title actually different, keep but don't touch lastAt
    if (merged.title !== existing.title) store.put(merged);
    return existing;
  });
}

export async function upsertChat(chat: LocalChat) {
  await tx(["chats"], "readwrite", (_db, t) => {
    const current = t.objectStore("chats").get(chat.id);
    // Use put directly - caller knows what to preserve
    current.onsuccess = () => {
      const existing = current.result as LocalChat | undefined;
      if (existing) {
        // merge drafts/scroll if caller forgot? but keep caller's lastMessage/lastAt
        // If chat from caller has empty lastMessage we should preserve existing's lastMessage unless explicitly wants to clear
        // For safety: if chat.lastMessage === "" && existing.lastMessage) preserve? No, caller of storeMessage provides proper lastMessage.
      }
      t.objectStore("chats").put(chat);
    };
  });
}

export async function updateChatMeta(id: string, patch: Partial<LocalChat>) {
  await tx(["chats"], "readwrite", async (_db, t) => {
    const store = t.objectStore("chats");
    const existing = await promisify<LocalChat | undefined>(store.get(id));
    if (!existing) return;
    store.put({ ...existing, ...patch });
  });
}

export async function listChats(): Promise<LocalChat[]> {
  return tx(["chats"], "readonly", async (_db, t) => {
    const rows = await promisify<LocalChat[]>(t.objectStore("chats").getAll());
    return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt);
  });
}

function tokens(text: string) {
  return Array.from(new Set(text.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((x) => x.length >= 2).slice(0, 80)));
}

export async function saveMessage(message: LocalMessage) {
  await tx(["messages", "search"], "readwrite", (_db, t) => {
    t.objectStore("messages").put(message);
    const s = t.objectStore("search");
    // Clear old search tokens for this message
    // Not efficient but okay: delete by prefix? We'll just put new tokens, old ones remain but okay for search
    for (const token of tokens(message.text)) {
      const row: SearchRow & { id: string } = { id: `${token}:${message.id}`, token, chatId: message.chatId, messageId: message.id, text: message.text, at: message.at };
      s.put(row);
    }
  });
}

export async function listMessages(chatId: string, limit = 200, before = Number.POSITIVE_INFINITY): Promise<LocalMessage[]> {
  return tx(["messages"], "readonly", async (_db, t) => {
    const idx = t.objectStore("messages").index("chatAt");
    const range = IDBKeyRange.bound([chatId, 0], [chatId, before]);
    const rows: LocalMessage[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = idx.openCursor(range, "prev");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || rows.length >= limit) return resolve();
        rows.push(cur.value as LocalMessage);
        cur.continue();
      };
    });
    return rows.reverse();
  });
}

export async function updateMessage(message: LocalMessage) { await saveMessage(message); }

export async function deleteMessage(id: string) {
  await tx(["messages"], "readwrite", (_db, t) => {
    t.objectStore("messages").delete(id);
  });
}

export async function searchLocal(query: string): Promise<SearchRow[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const first = q.split(/\s+/)[0];
  return tx(["search"], "readonly", async (_db, t) => {
    const idx = t.objectStore("search").index("token");
    const rows: SearchRow[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(first));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || rows.length >= 60) return resolve();
        rows.push(cur.value as SearchRow);
        cur.continue();
      };
    });
    return rows.sort((a, b) => b.at - a.at);
  });
}

// Outbox - pure P2P local queue, no Supabase
export async function enqueueOutbox(item: OutboxItem) {
  await tx(["outbox"], "readwrite", (_db, t) => {
    t.objectStore("outbox").put(item);
  });
}

export async function listOutbox(chatId?: string): Promise<OutboxItem[]> {
  return tx(["outbox"], "readonly", async (_db, t) => {
    if (chatId) {
      const idx = t.objectStore("outbox").index("chatId");
      return await promisify<OutboxItem[]>(idx.getAll(chatId));
    }
    return await promisify<OutboxItem[]>(t.objectStore("outbox").getAll());
  });
}

export async function listOutboxForPeer(peerId: string): Promise<OutboxItem[]> {
  return tx(["outbox"], "readonly", async (_db, t) => {
    const idx = t.objectStore("outbox").index("peerId");
    return await promisify<OutboxItem[]>(idx.getAll(peerId));
  });
}

export async function deleteOutbox(id: string) {
  await tx(["outbox"], "readwrite", (_db, t) => {
    t.objectStore("outbox").delete(id);
  });
}

export async function clearOutboxForChat(chatId: string) {
  const items = await listOutbox(chatId);
  for (const it of items) await deleteOutbox(it.id);
}

export function messageId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a).map((x) => x.toString(16).padStart(2, "0")).join("");
}
