import { create } from "zustand";
import type { LocalChat, LocalMessage } from "./local-db";
import type { FileTransfer } from "./file-transfer";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type ConnectionState = "idle" | "connecting" | "connected";
type VoiceState = "idle" | "calling" | "live";

type CallState = {
  voice: VoiceState;
  videoEnabled: boolean;
  micMuted: boolean;
  speakerMuted: boolean;
  isIncoming: boolean;
  callerName?: string;
  callerId?: string;
  durationSec: number;
};

type AppState = {
  // Identity
  initialUser: { id: string; name: string } | null;
  setInitialUser: (u: { id: string; name: string }) => void;

  // Data
  users: UserRow[];
  setUsers: (u: UserRow[]) => void;

  chats: LocalChat[];
  setChats: (c: LocalChat[]) => void;
  upsertChatInState: (chat: LocalChat) => void;

  peer: UserRow | null;
  setPeer: (p: UserRow | null) => void;

  // Messages cache per chatId
  messagesMap: Map<string, LocalMessage[]>;
  setMessagesForChat: (chatId: string, msgs: LocalMessage[]) => void;
  appendMessage: (msg: LocalMessage) => void;
  updateMessageInState: (msg: LocalMessage) => void;

  // UI
  connection: ConnectionState;
  setConnection: (c: ConnectionState) => void;

  typingPeers: Record<string, boolean>;
  setTyping: (peerId: string, typing: boolean) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Drafts & scroll
  drafts: Map<string, string>;
  setDraft: (chatId: string, text: string) => void;

  // File transfers
  fileTransfers: Map<string, FileTransfer>;
  setFileTransfer: (ft: FileTransfer) => void;
  removeFileTransfer: (fileId: string) => void;

  // Call
  call: CallState;
  setCall: (patch: Partial<CallState>) => void;
  resetCall: () => void;
  toggleMic: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;

  // Theme
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;

  // Language
  lang: "uz" | "en" | "ru";
  setLang: (l: "uz" | "en" | "ru") => void;

  // Layout
  isInfoOpen: boolean;
  setInfoOpen: (v: boolean) => void;
};

const defaultCall: CallState = {
  voice: "idle",
  videoEnabled: false,
  micMuted: false,
  speakerMuted: false,
  isIncoming: false,
  durationSec: 0,
};

export const useUBridgeStore = create<AppState>((set, get) => ({
  initialUser: null,
  setInitialUser: (u) => set({ initialUser: u }),

  users: [],
  setUsers: (users) => set({ users }),
  
  chats: [],
  setChats: (chats) => set({ chats }),
  upsertChatInState: (chat) => set((s) => {
    const exists = s.chats.find(c => c.id === chat.id);
    let next: LocalChat[];
    if (exists) next = s.chats.map(c => c.id === chat.id ? chat : c);
    else next = [...s.chats, chat];
    next = next.sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.lastAt - a.lastAt);
    return { chats: next };
  }),

  peer: null,
  setPeer: (peer) => set({ peer }),

  messagesMap: new Map(),
  setMessagesForChat: (chatId, msgs) => set((s) => {
    const next = new Map(s.messagesMap);
    next.set(chatId, msgs);
    return { messagesMap: next };
  }),
  appendMessage: (msg) => set((s) => {
    const next = new Map(s.messagesMap);
    const existing = next.get(msg.chatId) || [];
    const idx = existing.findIndex(m => m.id === msg.id);
    let updated: LocalMessage[];
    if (idx >= 0) { updated = [...existing]; updated[idx] = msg; } else { updated = [...existing, msg].sort((a,b)=>a.at-b.at); }
    next.set(msg.chatId, updated.slice(-400));
    return { messagesMap: next };
  }),
  updateMessageInState: (msg) => {
    get().appendMessage(msg);
  },

  connection: "idle",
  setConnection: (connection) => set({ connection }),

  typingPeers: {},
  setTyping: (peerId, typing) => set((s) => ({ typingPeers: { ...s.typingPeers, [peerId]: typing } })),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  drafts: new Map(),
  setDraft: (chatId, text) => set((s) => {
    const next = new Map(s.drafts);
    if (text) next.set(chatId, text); else next.delete(chatId);
    return { drafts: next };
  }),

  fileTransfers: new Map(),
  setFileTransfer: (ft) => set((s) => {
    const next = new Map(s.fileTransfers);
    next.set(ft.fileId, ft);
    return { fileTransfers: next };
  }),
  removeFileTransfer: (fileId) => set((s) => {
    const next = new Map(s.fileTransfers);
    next.delete(fileId);
    return { fileTransfers: next };
  }),

  call: { ...defaultCall },
  setCall: (patch) => set((s) => ({ call: { ...s.call, ...patch } })),
  resetCall: () => set({ call: { ...defaultCall } }),
  toggleMic: () => set((s) => ({ call: { ...s.call, micMuted: !s.call.micMuted } })),
  toggleVideo: () => set((s) => ({ call: { ...s.call, videoEnabled: !s.call.videoEnabled } })),
  toggleSpeaker: () => set((s) => ({ call: { ...s.call, speakerMuted: !s.call.speakerMuted } })),

  theme: "light",
  setTheme: (theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", theme === "dark");
      localStorage.setItem("ubridge_theme", theme);
    }
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },

  lang: "en",
  setLang: (lang) => {
    try { localStorage.setItem("ubridge_lang", lang); localStorage.setItem("uflow_lang", lang); } catch {}
    set({ lang });
  },

  isInfoOpen: false,
  setInfoOpen: (isInfoOpen) => set({ isInfoOpen }),
}));
