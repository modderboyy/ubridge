export type DeliveryState = "sending" | "sent" | "delivered" | "read" | "failed";

export type LocalChat = {
  id: string;
  peerId: string;
  title: string;
  avatar?: string;
  pinned: boolean;
  unread: number;
  lastMessage: string;
  lastAt: number;
  typing: boolean;
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

type SearchRow = { token: string; chatId: string; messageId: string; text: string; at: number };

const DB_NAME = "ubridge-local-first-v1";
const DB_VERSION = 1;

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
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (db: IDBDatabase, tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => reject(t.error);
    t.oncomplete = () => db.close();
    Promise.resolve(fn(db, t)).then(resolve, reject);
  }));
}

function promisify<T = unknown>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function chatIdFor(peerId: string) { return `direct:${peerId}`; }

export async function upsertChat(chat: LocalChat) {
  await tx(["chats"], "readwrite", (_db, t) => { t.objectStore("chats").put(chat); });
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
    for (const token of tokens(message.text)) {
      const row: SearchRow & { id: string } = { id: `${token}:${message.id}`, token, chatId: message.chatId, messageId: message.id, text: message.text, at: message.at };
      s.put(row);
    }
  });
}

export async function listMessages(chatId: string, limit = 120, before = Number.POSITIVE_INFINITY): Promise<LocalMessage[]> {
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

export function messageId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a).map((x) => x.toString(16).padStart(2, "0")).join("");
}
