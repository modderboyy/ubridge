"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "../lib/supabase/client";
import UIcon from "./UIcon";
import { useUBridgeStore } from "../lib/store";
import { chatIdFor, getChat, ensureChat, listChats, listMessages, messageId, saveMessage, searchLocal, updateMessage, upsertChat, updateChatMeta, enqueueOutbox, listOutboxForPeer, deleteOutbox, clearMessagesForChat, deleteChat, type LocalChat, type LocalMessage } from "../lib/local-db";
import { getOrCreateIdentity, exportPublicJwk, importPeerPublic, hasPeerPublicSync, encryptForPeer, decryptForPeer, signPayloadECDSA } from "../lib/crypto-ecdh";
import { createFileOffer, FileSender, FileReceiver, type FileOffer, type FileChunk, type FileTransfer } from "../lib/file-transfer";
import { P2PManager } from "../lib/p2p-manager";
import { Sidebar } from "./Sidebar/Sidebar";
import { ChatHeader } from "./Chat/ChatHeader";
import { HeaderPopup } from "./Chat/HeaderPopup";
import { MessageList } from "./Chat/MessageList";
import { Composer } from "./Chat/Composer";
import { EmptyState } from "./Chat/EmptyState";
import { ReactionsBar } from "./Modals/ReactionsBar";
import { ContextMenu } from "./Modals/ContextMenu";
import { TrustedRelayModal } from "./Modals/TrustedRelayModal";
import { CallModal } from "./Modals/CallModal";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type Lang = "uz" | "en" | "ru";

const T = {
  uz: { search: "Qidirish", chats: "Chatlar", pinned: "Mahkamlangan", online: "Online", offline: "Offline", uflow: "UFlow", trusted: "Ishonchli", select: "Chatni tanlang", selectSub: "P2P shifrlangan, faqat sizda saqlanadi, BG ulanish, trusted relay, tez", connected: "P2P ulandi ⚡", connecting: "Ulanmoqda...", ready: "Tayyor", offlinePeer: "Offline — navbatda", call: "Qo'ng'iroq", videoCall: "Video", hangup: "Tugatish", message: "Xabar...", send: "Yuborish", file: "Fayl", reaction: "Reaksiya", reply: "Javob", edit: "Tahrir", copy: "Nusxa", del: "O'chirish", download: "Yuklash", voiceTitle: "Qo'ng'iroq", videoTitle: "Video", voiceSub: "E2E P2P", p2p: "P2P • E2E", ecdhActive: "ECDH faol", installApp: "O'rnatish", info: "Ma'lumot", mute: "Ovozsiz", clear: "Tozalash", block: "Blok", trustedTitle: "Ishonchli relay", trustedSub: "UFlow tepada, har doim online, tez. Multi-select.", waiting: "Kutilmoqda", sent: "Yuborildi", delivered: "Yetkazildi", read: "O'qildi" },
  en: { search: "Search", chats: "Chats", pinned: "Pinned", online: "Online", offline: "Offline", uflow: "UFlow", trusted: "Trusted", select: "Select chat", selectSub: "P2P encrypted, local only, BG, trusted, fast", connected: "P2P Connected ⚡", connecting: "Connecting...", ready: "Ready", offlinePeer: "Offline", call: "Call", videoCall: "Video", hangup: "End", message: "Message...", send: "Send", file: "File", reaction: "Reaction", reply: "Reply", edit: "Edit", copy: "Copy", del: "Delete", download: "Download", voiceTitle: "Voice", videoTitle: "Video", voiceSub: "E2E P2P", p2p: "P2P • E2E", ecdhActive: "ECDH active", installApp: "Install", info: "Info", mute: "Mute", clear: "Clear", block: "Block", trustedTitle: "Trusted relay", trustedSub: "UFlow on top, always online, fast. Multi-select.", waiting: "Waiting", sent: "Sent", delivered: "Delivered", read: "Read" },
  ru: { search: "Поиск", chats: "Чаты", pinned: "Закреп", online: "Онлайн", offline: "Офлайн", uflow: "UFlow", trusted: "Довер", select: "Выберите чат", selectSub: "P2P шифр, локально, BG, довер, быстро", connected: "P2P Подкл ⚡", connecting: "Соединение...", ready: "Готово", offlinePeer: "Офлайн", call: "Звонок", videoCall: "Видео", hangup: "Конец", message: "Сообщение...", send: "Отправить", file: "Файл", reaction: "Реакция", reply: "Ответ", edit: "Изм", copy: "Копия", del: "Удалить", download: "Скачать", voiceTitle: "Звонок", videoTitle: "Видео", voiceSub: "E2E P2P", p2p: "P2P • E2E", ecdhActive: "ECDH акт", installApp: "Уст", info: "Инфо", mute: "Мут", clear: "Очист", block: "Блок", trustedTitle: "Довер релеи", trustedSub: "UFlow наверху, всегда онлайн, быстро.", waiting: "Ожид", sent: "Отпр", delivered: "Дост", read: "Проч" },
} satisfies Record<Lang, any>;

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string; email?: string | null } }) {
  const supabase = useMemo(() => createClient(), []);
  const store = useUBridgeStore();
  const [lang, setLang] = useState<Lang>("uz");
  const t = T[lang];

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ chatId: string; messageId: string; text: string; at: number }[]>([]);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [context, setContext] = useState<{ message: LocalMessage; x: number; y: number } | null>(null);
  const [reactionBar, setReactionBar] = useState<{ message: LocalMessage; x: number; y: number } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [pushState, setPushState] = useState<"checking" | "granted" | "default" | "denied" | "unsupported">("checking");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [trustedOpen, setTrustedOpen] = useState<{ peer: UserRow; message: LocalMessage; box: any } | null>(null);

  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const messagesCacheRef = useRef<Map<string, LocalMessage[]>>(new Map());
  const draftsRef = useRef<Map<string, string>>(new Map());
  const scrollPosRef = useRef<Map<string, number>>(new Map());
  const prevChatIdRef = useRef<string>("");
  const fileSendersRef = useRef<Map<string, FileSender>>(new Map());
  const fileReceiversRef = useRef<Map<string, FileReceiver>>(new Map());
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const p2pManagerRef = useRef<P2PManager | null>(null);
  const bgConnectedPeers = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const peer = store.peer;
  const peerRef = useRef<UserRow | null>(null);
  const chatKey = peer ? chatIdFor(peer.user_id) : "";

  useEffect(() => { peerRef.current = peer; }, [peer]);

  // Init
  useEffect(() => {
    store.setTheme((localStorage.getItem("ubridge_theme") as any) || "light");
    const savedLang = (localStorage.getItem("ubridge_lang") || "uz") as Lang;
    if (["uz", "en", "ru"].includes(savedLang)) setLang(savedLang);
    void getOrCreateIdentity(initialUser.id);
    if (!("Notification" in window)) setPushState("unsupported");
    else setPushState(Notification.permission as any);
    const onInstall = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  // Global close popups
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (context && !target.closest(".context-menu") && !target.closest(".message-bubble") && !target.closest(".reactions-bar")) {
        setContext(null);
        setReactionBar(null);
      }
      if (headerMenu && !target.closest(".header-popup") && !target.closest(".header-actions")) setHeaderMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setContext(null); setReactionBar(null); setHeaderMenu(null); setTrustedOpen(null); } };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [context, reactionBar, headerMenu]);

  useEffect(() => { void searchLocal(query).then(setSearchResults); }, [query]);

  // Scroll preservation
  useEffect(() => {
    const box = messagesBoxRef.current;
    if (!box) return;
    if (prevChatIdRef.current !== chatKey) {
      const saved = scrollPosRef.current.get(chatKey);
      requestAnimationFrame(() => { if (box) box.scrollTop = saved ?? box.scrollHeight; });
      prevChatIdRef.current = chatKey;
      return;
    }
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 180;
    if (isNearBottom) box.scrollTop = box.scrollHeight;
  }, [store.messagesMap, chatKey]);

  useEffect(() => {
    const box = messagesBoxRef.current;
    if (!box) return;
    const onScroll = () => { if (chatKey) scrollPosRef.current.set(chatKey, box.scrollTop); };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [chatKey]);

  // Call timer
  useEffect(() => {
    if (store.call.voice === "live") {
      callTimerRef.current = setInterval(() => store.setCall({ durationSec: store.call.durationSec + 1 }), 1000) as any;
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (store.call.voice === "idle") store.setCall({ durationSec: 0 });
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [store.call.voice]);

  // Helper: refresh chats
  const refreshChats = useCallback(async () => store.setChats(await listChats()), []);
  const cleanup = useCallback(async () => { try { await supabase.rpc("ubridge_cleanup"); } catch {} }, [supabase]);
  const upsertMe = useCallback(async (status: string) => { try { await supabase.rpc("ubridge_upsert_me", { p_name: initialUser.name, p_relay: "webrtc-v4-fast-bg", p_status: status }); } catch {} }, [supabase, initialUser.name]);
  const loadUsers = useCallback(async () => {
    try {
      const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false });
      if (data) {
        store.setUsers(data as UserRow[]);
        // BG connections for online
        if (p2pManagerRef.current) void p2pManagerRef.current.ensureBackgroundConnections(data as UserRow[]);
      }
    } catch {}
  }, [supabase, initialUser.id, store]);

  // P2P Manager - FAST + BG + Trusted
  useEffect(() => {
    const manager = new P2PManager(supabase, initialUser.id, initialUser.name);
    p2pManagerRef.current = manager;

    manager.setHandlers({
      onMessage: async (peerId, body) => {
        if (body.typing !== undefined) { store.setTyping(peerId, Boolean(body.typing)); return; }
        if (body.type === "chat_restored") { void refreshChats(); return; }
        if (body.type === "receipt") {
          const chatId = chatIdFor(peerId);
          const cache = messagesCacheRef.current.get(chatId) || [];
          const msg = cache.find(m => m.id === body.messageId);
          if (msg) {
            const updated = { ...msg, delivery: body.status };
            await saveMessage(updated);
            const next = cache.map(m => m.id === body.messageId ? updated : m);
            messagesCacheRef.current.set(chatId, next);
            if (peerRef.current?.user_id === peerId) store.setMessagesForChat(chatId, next);
          }
          return;
        }
        if (body.type === "reaction") {
          const chatId = chatIdFor(peerId);
          const cache = messagesCacheRef.current.get(chatId) || (await listMessages(chatId, 200));
          const msg = cache.find(m => m.id === body.messageId);
          if (msg) {
            const key = `reaction_${body.messageId}_${body.userId}`;
            const prev = localStorage.getItem(key);
            let reactions = { ...msg.reactions };
            if (prev && prev !== body.emoji) {
              if (reactions[prev]) { reactions[prev] = Math.max(0, (reactions[prev] || 1) - 1); if (reactions[prev] === 0) delete reactions[prev]; }
            }
            if (body.emoji) {
              if (prev !== body.emoji) {
                reactions[body.emoji] = (reactions[body.emoji] || 0) + 1;
                localStorage.setItem(key, body.emoji);
              } else {
                if (reactions[body.emoji]) { reactions[body.emoji] = Math.max(0, reactions[body.emoji] - 1); if (reactions[body.emoji] === 0) delete reactions[body.emoji]; }
                localStorage.removeItem(key);
              }
            }
            const updated = { ...msg, reactions };
            await saveMessage(updated);
            const next = cache.map(m => m.id === body.messageId ? updated : m);
            messagesCacheRef.current.set(chatId, next);
            store.setMessagesForChat(chatId, next);
          }
          return;
        }
        if (body.type === "file_offer") {
          const offer = body as FileOffer;
          const receiver = new FileReceiver(offer, (transfer) => store.setFileTransfer(transfer));
          fileReceiversRef.current.set(offer.fileId, receiver);
          const msg: LocalMessage = { id: messageId(), chatId: chatIdFor(peerId), from: "peer", text: `File: ${offer.name}`, at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true, attachment: { name: offer.name, mime: offer.mime, size: offer.size } };
          await storeMessageLocal(msg);
          void sendReceipt(peerId, msg.id, "delivered");
          return;
        }
        if (body.type === "file_chunk") {
          const receiver = fileReceiversRef.current.get(body.fileId);
          if (receiver) {
            receiver.receiveChunk(body);
            const ack = { type: "file_ack", fileId: body.fileId, index: body.index };
            const dc = manager.getDataChannel(peerId);
            if (dc?.readyState === "open") {
              const encAck = await encryptForPeer(initialUser.id, peerId, ack);
              dc.send(JSON.stringify({ box: encAck }));
            }
          }
          return;
        }
        if (body.type === "file_done") {
          const receiver = fileReceiversRef.current.get(body.fileId);
          if (receiver) {
            const completed = receiver.complete();
            const msg: LocalMessage = { id: messageId(), chatId: chatIdFor(peerId), from: "peer", text: `File ready: ${completed.name}`, at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true, attachment: { name: completed.name, mime: completed.mime, size: completed.size } };
            await storeMessageLocal(msg);
            void sendReceipt(peerId, msg.id, "delivered");
          }
          return;
        }
        if (body.type === "trusted_forward") {
          const { finalTo, from, originalBox } = body;
          if (finalTo === initialUser.id) {
            try {
              const inner = await decryptForPeer(from, finalTo, originalBox);
              const incoming: LocalMessage = { id: messageId(), chatId: chatIdFor(from), from: "peer", text: inner.text, at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true };
              await storeMessageLocal(incoming);
              void sendReceipt(from, inner.id || incoming.id, "delivered");
            } catch {}
          } else {
            await enqueueOutbox({ id: messageId(), chatId: chatIdFor(finalTo), peerId: finalTo, box: originalBox, plainText: "trusted", at: Date.now(), attempts: 0 });
            void manager.ensureConnection({ user_id: finalTo, name: "Peer", online: true, status: null, relay: null, last_seen: null } as any, true);
          }
          return;
        }
        // Regular message
        const incoming: LocalMessage = { id: messageId(), chatId: chatIdFor(peerId), from: "peer", text: body.text || "Message", at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true, replyTo: body.replyTo || null };
        await storeMessageLocal(incoming);
        void sendReceipt(peerId, body.id || incoming.id, "delivered");
        if (peerRef.current?.user_id !== peerId && Notification.permission === "granted") {
          try { new Notification(store.users.find(u => u.user_id === peerId)?.name || "UBridge", { body: incoming.text.slice(0, 120), icon: "/icons/icon-192.png" }); } catch {}
        }
      },
      onStateChange: (peerId, state) => {
        if (state === "connected") bgConnectedPeers.current.add(peerId);
        else bgConnectedPeers.current.delete(peerId);
        if (peerRef.current?.user_id === peerId) {
          store.setConnection(state === "connected" ? "connected" : state === "connecting" ? "connecting" : "idle");
        }
        // Force re-render for BG badge
        store.setUsers([...store.users]);
      },
      onDataChannelOpen: (peerId) => {
        if (peerRef.current?.user_id === peerId) { store.setConnection("connected"); void drainOutbox(peerId); }
      },
    });

    void manager.initRealtime();
    const poll = setInterval(() => void manager.pollSignals(), 2500);
    return () => { clearInterval(poll); manager.disconnectAll(); };
  }, []);

  async function storeMessageLocal(m: LocalMessage) {
    await saveMessage(m);
    const cache = messagesCacheRef.current.get(m.chatId) || [];
    const idx = cache.findIndex(x => x.id === m.id);
    const nextCache = idx >= 0 ? [...cache.slice(0, idx), m, ...cache.slice(idx + 1)] : [...cache, m].sort((a, b) => a.at - b.at).slice(-400);
    messagesCacheRef.current.set(m.chatId, nextCache);
    const currentPeer = peerRef.current;
    const currentChatId = currentPeer ? chatIdFor(currentPeer.user_id) : "";
    if (m.chatId === currentChatId) store.setMessagesForChat(m.chatId, nextCache);
    const chat = await getChat(m.chatId);
    const peerIdForChat = m.chatId.replace("direct:", "");
    const title = chat?.title || (currentPeer?.user_id === peerIdForChat ? currentPeer.name : store.users.find(u => u.user_id === peerIdForChat)?.name || "Chat");
    const isActive = currentChatId === m.chatId;
    const prevUnread = chat?.unread || 0;
    const newUnread = m.from === "peer" && !isActive ? prevUnread + 1 : isActive ? 0 : prevUnread;
    const chatRow: LocalChat = { id: m.chatId, peerId: peerIdForChat, title, pinned: chat?.pinned || false, unread: newUnread, lastMessage: m.deletedAt ? "Deleted" : m.text, lastAt: m.at, typing: false, draft: chat?.draft, scrollTop: chat?.scrollTop, muted: chat?.muted, blocked: chat?.blocked };
    await upsertChat(chatRow);
    store.upsertChatInState(chatRow);
  }

  async function sendReceipt(to: string, messageId: string, status: string) {
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(to);
    if (dc?.readyState === "open") {
      try { const box = await encryptForPeer(initialUser.id, to, { type: "receipt", messageId, status, from: initialUser.id }); dc.send(JSON.stringify({ box })); } catch {}
    }
  }

  async function drainOutbox(peerId: string) {
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerId);
    if (!dc || dc.readyState !== "open") return;
    const items = await listOutboxForPeer(peerId);
    for (const item of items) { try { dc.send(JSON.stringify({ box: item.box })); await deleteOutbox(item.id); } catch {} }
  }

  // Bootstrap
  useEffect(() => {
    async function bootstrap() {
      store.setInitialUser(initialUser);
      await upsertMe("online");
      await loadUsers();
      await refreshChats();
    }
    void bootstrap();
    const presenceBeat = setInterval(() => void upsertMe("online"), 12000);
    const usersPoll = setInterval(() => void loadUsers(), 6000);
    const cleanupBeat = setInterval(() => void cleanup(), 60000);
    const channel = supabase.channel("ubridge-v4")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();
    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(presenceBeat); clearInterval(usersPoll); clearInterval(cleanupBeat); void supabase.removeChannel(channel); window.removeEventListener("beforeunload", onUnload); };
  }, []);

  async function openPeer(u: UserRow) {
    if (peerRef.current) {
      const prevId = chatIdFor(peerRef.current.user_id);
      if (text) { draftsRef.current.set(prevId, text); store.setDraft(prevId, text); }
      const box = messagesBoxRef.current as any;
      if (box) scrollPosRef.current.set(prevId, box.scrollTop);
      void updateChatMeta(prevId, { draft: text || undefined, scrollTop: box?.scrollTop });
    }
    const id = chatIdFor(u.user_id);
    store.setPeer(u);
    const existing = await getChat(id);
    if (!existing) await ensureChat({ id, peerId: u.user_id, title: u.name, pinned: false, unread: 0, lastMessage: "", lastAt: Date.now(), typing: false, draft: draftsRef.current.get(id) });
    const cached = messagesCacheRef.current.get(id);
    if (cached) store.setMessagesForChat(id, cached);
    else {
      const fromDb = await listMessages(id, 200);
      messagesCacheRef.current.set(id, fromDb);
      store.setMessagesForChat(id, fromDb);
    }
    const draft = draftsRef.current.get(id) ?? (await getChat(id))?.draft ?? "";
    setText(draft);
    void (async () => {
      const fresh = await listMessages(id, 200);
      messagesCacheRef.current.set(id, fresh);
      if (peerRef.current?.user_id === u.user_id) store.setMessagesForChat(id, fresh);
    })();
    await refreshChats();
    const manager = p2pManagerRef.current;
    if (manager?.isConnected(u.user_id)) {
      store.setConnection("connected");
      void drainOutbox(u.user_id);
      const unread = (messagesCacheRef.current.get(id) || []).filter(m => m.from === "peer" && m.delivery !== "read");
      for (const m of unread) void sendReceipt(u.user_id, m.id, "read");
    } else {
      store.setConnection("connecting");
      void manager?.ensureConnection(u, false);
    }
  }

  function handleBack() {
    if (peerRef.current) {
      const prevId = chatIdFor(peerRef.current.user_id);
      draftsRef.current.set(prevId, text);
      store.setDraft(prevId, text);
      const box = messagesBoxRef.current as any;
      if (box) scrollPosRef.current.set(prevId, box.scrollTop);
      void updateChatMeta(prevId, { draft: text || undefined, scrollTop: box?.scrollTop });
    }
    store.setPeer(null);
    setText("");
    setChatSearch("");
  }

  async function send() {
    if (!text.trim() || !peerRef.current) return;
    const peerNow = peerRef.current;
    const value = text.trim();
    setText("");
    draftsRef.current.delete(chatIdFor(peerNow.user_id));
    store.setDraft(chatIdFor(peerNow.user_id), "");
    void updateChatMeta(chatIdFor(peerNow.user_id), { draft: undefined });

    if (editing) {
      const edited = { ...editing, text: value, editedAt: Date.now() };
      await updateMessage(edited);
      const cache = messagesCacheRef.current.get(edited.chatId) || [];
      const next = cache.map(m => m.id === edited.id ? edited : m);
      messagesCacheRef.current.set(edited.chatId, next);
      store.setMessagesForChat(edited.chatId, next);
      setEditing(null);
      return;
    }

    const localId = messageId();
    const payload = { type: "text", text: value, replyTo: replyTo?.id || null, signature: await signPayloadECDSA(initialUser.id, { text: value }), from: initialUser.id, id: localId };
    const box = await encryptForPeer(initialUser.id, peerNow.user_id, payload);
    const chatId = chatIdFor(peerNow.user_id);
    const local: LocalMessage = { id: localId, chatId, from: "me", text: value, at: Date.now(), replyTo: replyTo?.id || null, reactions: {}, delivery: "waiting", encrypted: true, signature: payload.signature };
    await storeMessageLocal(local);
    setReplyTo(null);

    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerNow.user_id);
    if (dc?.readyState === "open") {
      try { dc.send(JSON.stringify({ box })); local.delivery = "sent"; await storeMessageLocal(local); } catch { local.delivery = "failed"; await storeMessageLocal(local); await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts: 0 }); }
    } else {
      local.delivery = "waiting";
      await storeMessageLocal(local);
      await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts: 0 });
      if (!peerNow.online) {
        setTrustedOpen({ peer: peerNow, message: local, box });
      } else {
        void manager?.ensureConnection(peerNow, false);
      }
    }
  }

  async function sendViaTrusted(selectedIds: string[]) {
    if (!trustedOpen) return;
    const { peer, box } = trustedOpen;
    const manager = p2pManagerRef.current;
    if (manager) await manager.sendViaTrusted(peer.user_id, selectedIds, box);
    const updated = { ...trustedOpen.message, delivery: "sent" as const };
    await storeMessageLocal(updated);
    setTrustedOpen(null);
  }

  async function sendFile(file: File) {
    if (!peerRef.current) return;
    const peerNow = peerRef.current;
    const manager = p2pManagerRef.current;
    if (!manager?.isConnected(peerNow.user_id)) void manager?.ensureConnection(peerNow, false);
    const offer = createFileOffer(file);
    const transfer: FileTransfer = { fileId: offer.fileId, name: file.name, size: file.size, mime: file.type, chunkSize: offer.chunkSize, totalChunks: offer.totalChunks, transferred: 0, receivedChunks: 0, state: "sending", progress: 0, direction: "send", file };
    store.setFileTransfer(transfer);
    const msg: LocalMessage = { id: messageId(), chatId: chatIdFor(peerNow.user_id), from: "me", text: `File: ${file.name}`, at: Date.now(), reactions: {}, delivery: "waiting", encrypted: true, attachment: { name: file.name, mime: file.type, size: file.size } };
    await storeMessageLocal(msg);
    const waitForDc = async () => { let tries = 0; while (manager?.getDataChannel(peerNow.user_id)?.readyState !== "open" && tries < 20) { await new Promise(r => setTimeout(r, 300)); tries++; } return manager?.getDataChannel(peerNow.user_id)?.readyState === "open"; };
    if (await waitForDc()) {
      try {
        const dc = manager?.getDataChannel(peerNow.user_id);
        const sender = new FileSender(dc as any, file, offer, (p) => store.setFileTransfer({ ...transfer, progress: p, transferred: Math.round(file.size * p / 100), state: p === 100 ? "completed" : "sending" }));
        await sender.send(async (data) => await encryptForPeer(initialUser.id, peerNow.user_id, data));
        msg.delivery = "sent"; await storeMessageLocal(msg);
        store.setFileTransfer({ ...transfer, progress: 100, state: "completed" });
      } catch (e: any) { msg.delivery = "failed"; await storeMessageLocal(msg); store.setFileTransfer({ ...transfer, state: "error", error: e.message }); }
    } else { msg.delivery = "failed"; await storeMessageLocal(msg); store.setFileTransfer({ ...transfer, state: "error", error: "P2P not connected" }); }
  }

  function setTyping(v: string) {
    if (peerRef.current) {
      const cid = chatIdFor(peerRef.current.user_id);
      draftsRef.current.set(cid, v);
      store.setDraft(cid, v);
      void updateChatMeta(cid, { draft: v || undefined });
    }
    setText(v);
    const manager = p2pManagerRef.current;
    const dc = peerRef.current ? manager?.getDataChannel(peerRef.current.user_id) : null;
    if (dc?.readyState === "open") try { dc.send(JSON.stringify({ typing: Boolean(v) })); } catch {}
  }

  async function handleReaction(message: LocalMessage, emoji: string) {
    const peerId = message.chatId.replace("direct:", "");
    const key = `reaction_${message.id}_${initialUser.id}`;
    const prev = localStorage.getItem(key);
    let reactions = { ...message.reactions };
    if (prev === emoji) {
      if (reactions[emoji]) { reactions[emoji] = Math.max(0, reactions[emoji] - 1); if (reactions[emoji] === 0) delete reactions[emoji]; }
      localStorage.removeItem(key);
    } else {
      if (prev && reactions[prev]) { reactions[prev] = Math.max(0, reactions[prev] - 1); if (reactions[prev] === 0) delete reactions[prev]; }
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      localStorage.setItem(key, emoji);
    }
    const updated = { ...message, reactions };
    await storeMessageLocal(updated);
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerId);
    if (dc?.readyState === "open") {
      try { const box = await encryptForPeer(initialUser.id, peerId, { type: "reaction", messageId: message.id, emoji: prev === emoji ? "" : emoji, userId: initialUser.id, prevEmoji: prev }); dc.send(JSON.stringify({ box })); } catch {}
    }
    setReactionBar(null);
    setContext(null);
  }

  function formatTime(ts: number) { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  const messagesForCurrent = chatKey ? (store.messagesMap.get(chatKey) || []) : [];
  const filteredMessagesForSearch = chatSearch ? messagesForCurrent.filter(m => m.text.toLowerCase().includes(chatSearch.toLowerCase())) : messagesForCurrent;
  const recent = store.chats;
  const online = store.users.filter(u => u.online);
  const offline = store.users.filter(u => !u.online);
  const bgSet = bgConnectedPeers.current;
  const shellClass = `ub-shell ${peer ? "chat-open" : ""} ${store.isInfoOpen ? "info-open" : ""}`;

  return (
    <main className="ub-app">
      <div className={shellClass}>
        <Sidebar
          chats={recent}
          users={store.users}
          activeChatId={chatKey}
          onChatSelect={openPeer}
          onUserSelect={openPeer}
          searchQuery={query}
          onSearchChange={setQuery}
          searchResults={searchResults}
          bgConnectedPeers={bgSet}
        />

        <section className="chat-panel">
          {!peer ? (
            <EmptyState t={t} />
          ) : (
            <>
              <ChatHeader
                peer={peer}
                connection={store.connection}
                typing={!!store.typingPeers[peer.user_id]}
                onBack={handleBack}
                onCall={(video) => {
                  store.setCall({ voice: "calling", videoEnabled: video, isIncoming: false, callerId: peer.user_id, callerName: peer.name });
                  void p2pManagerRef.current?.ensureConnection(peer, false);
                }}
                onInfoToggle={() => store.setInfoOpen(!store.isInfoOpen)}
                onMenuOpen={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setHeaderMenu({ x: Math.max(10, rect.right - 260), y: rect.bottom + 8 });
                }}
                t={t}
                isBgConnected={p2pManagerRef.current?.isConnected(peer.user_id) || false}
              />

              {chatSearch && (
                <div className="chat-search-bar">
                  <UIcon name="search" size={16} />
                  <input placeholder="Xabarlar ichida qidirish..." value={chatSearch} onChange={e => setChatSearch(e.target.value)} autoFocus />
                  <button onClick={() => setChatSearch("")}><UIcon name="close" size={14} /></button>
                  <span>{filteredMessagesForSearch.length} ta</span>
                </div>
              )}

              <div className="messages" ref={messagesBoxRef as any}>
                <MessageList
                  messages={filteredMessagesForSearch}
                  onMessageLongPress={(m, e) => {
                    const x = (e as any).clientX || 100;
                    const y = (e as any).clientY || 100;
                    setReactionBar({ message: m, x: Math.max(10, x - 160), y: Math.max(10, y - 60) });
                    setContext({ message: m, x: Math.max(10, x - 100), y: Math.min(window.innerHeight - 200, y + 10) });
                  }}
                  onCancelLongPress={() => {}}
                  onMessageContextMenu={(m, e) => {
                    e.preventDefault();
                    setReactionBar({ message: m, x: e.clientX - 160, y: e.clientY - 60 });
                    setContext({ message: m, x: e.clientX - 100, y: e.clientY + 10 });
                  }}
                  onReactionClick={(m, emoji) => void handleReaction(m, emoji)}
                  t={t}
                  fileTransfers={store.fileTransfers}
                  searchQuery={chatSearch}
                />
              </div>

              {replyTo && <div className="reply-bar">{t.reply}: {replyTo.text.slice(0, 60)}<button onClick={() => setReplyTo(null)}>×</button></div>}
              {editing && <div className="reply-bar">{t.edit}<button onClick={() => { setEditing(null); setText(""); }}>×</button></div>}

              <Composer
                text={text}
                onTextChange={setTyping}
                onSend={send}
                onFileSelect={sendFile}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                editing={editing}
                onCancelEdit={() => { setEditing(null); setText(""); }}
                t={t}
              />
            </>
          )}
        </section>

        <aside className="info-panel">
          <div className="info-card">
            <div className="avatar xl">{peer?.name[0]?.toUpperCase() || "U"}</div>
            <h3>{peer?.name || "UBridge"}</h3>
            <p>E2E • BG P2P: {bgSet.size} • Trusted • Fast</p>
          </div>
          <div className="info-list">
            <div className="info-row"><UIcon name="shield" size={16} /> {t.ecdhActive} • {p2pManagerRef.current?.isConnected(peer?.user_id || "") ? "⚡ BG Fast" : "Connecting..."}</div>
            <div className="info-row"><UIcon name="link" size={16} /> BG: {bgSet.size} peers</div>
          </div>
        </aside>

        {reactionBar && (
          <div className="reactions-bar" style={{ left: reactionBar.x, top: reactionBar.y }}>
            {["❤️", "👍", "👏", "😂", "😮", "😢", "🔥", "🎉", "💯", "🙏", "😍", "🤔"].map(emoji => {
              const active = localStorage.getItem(`reaction_${reactionBar.message.id}_${initialUser.id}`) === emoji;
              return <button key={emoji} className={active ? "active" : ""} onClick={() => void handleReaction(reactionBar.message, emoji)}>{emoji}</button>;
            })}
          </div>
        )}

        {context && (
          <div className="context-menu" style={{ left: context.x, top: context.y }}>
            <button onClick={() => { setReplyTo(context.message); setContext(null); setReactionBar(null); }}><UIcon name="message" size={16} /> {t.reply}</button>
            <button onClick={() => { setEditing(context.message); setText(context.message.text); setContext(null); setReactionBar(null); }}><UIcon name="edit" size={16} /> {t.edit}</button>
            <button onClick={() => { void navigator.clipboard?.writeText(context.message.text); setContext(null); setReactionBar(null); }}><UIcon name="copy" size={16} /> {t.copy}</button>
            <button className="danger" onClick={async () => { const m = { ...context.message, deletedAt: Date.now(), text: "Deleted" }; await storeMessageLocal(m); setContext(null); setReactionBar(null); }}><UIcon name="trash" size={16} /> {t.del}</button>
          </div>
        )}

        {headerMenu && (
          <div className="header-popup" style={{ left: headerMenu.x, top: headerMenu.y }}>
            <div className="popup-title">Chat options</div>
            <button onClick={() => { store.setInfoOpen(true); setHeaderMenu(null); }}><UIcon name="info" size={16} /> {t.info}</button>
            <button onClick={() => { setChatSearch(""); (document.querySelector(".chat-search-bar input") as any)?.focus(); if (!chatSearch) setChatSearch(" "); setHeaderMenu(null); }}><UIcon name="search" size={16} /> Qidiruv</button>
            <button onClick={async () => { if (peer) { const chat = await getChat(chatIdFor(peer.user_id)); if (chat) { await updateChatMeta(chat.id, { muted: !chat.muted }); void refreshChats(); } } setHeaderMenu(null); }}><UIcon name="volume-mute" size={16} /> {t.mute}</button>
            <div className="popup-divider" />
            <button onClick={async () => { if (peer && confirm("Chatni tozalash?")) { await clearMessagesForChat(chatIdFor(peer.user_id)); store.setMessagesForChat(chatIdFor(peer.user_id), []); messagesCacheRef.current.set(chatIdFor(peer.user_id), []); void refreshChats(); } setHeaderMenu(null); }}><UIcon name="trash" size={16} /> {t.clear}</button>
            <button className="danger" onClick={() => { if (peer) { void (async () => { const chatId = chatIdFor(peer.user_id); await deleteChat(chatId); store.setChats(store.chats.filter(c => c.id !== chatId)); handleBack(); })(); } setHeaderMenu(null); }}><UIcon name="close" size={16} /> {t.block}</button>
          </div>
        )}

        {trustedOpen && (
          <TrustedRelayModal
            isOpen={!!trustedOpen}
            onClose={() => setTrustedOpen(null)}
            onSend={(ids) => void (async () => { if (p2pManagerRef.current) await p2pManagerRef.current.sendViaTrusted(trustedOpen.peer.user_id, ids, trustedOpen.box); const updated = { ...trustedOpen.message, delivery: "sent" as const }; await storeMessageLocal(updated); setTrustedOpen(null); })()}
            onlineUsers={online}
            bgConnected={bgSet}
            t={t}
            peerName={trustedOpen.peer.name}
          />
        )}

        {store.call.voice !== "idle" && (
          <div className="call-modal">
            <div className="call-card">
              <div className="call-pulse"><div className="avatar huge">{(store.call.callerName || peer?.name || "U")[0]?.toUpperCase()}</div></div>
              <h2>{store.call.callerName || peer?.name} {store.call.videoEnabled ? "📹" : "📞"}</h2>
              <p>{store.call.voice === "live" ? `Connected • ${String(Math.floor(store.call.durationSec / 60)).padStart(2, "0")}:${String(store.call.durationSec % 60).padStart(2, "0")}` : "Calling..."}</p>
              <div className="call-controls">
                <button className={`call-btn ${store.call.micMuted ? "muted" : ""}`} onClick={() => store.toggleMic()}><UIcon name={store.call.micMuted ? "mic-off" : "mic"} size={20} /></button>
                <button className="call-btn hangup" onClick={() => { localStreamRef.current?.getTracks().forEach(t => t.stop()); store.resetCall(); if (peerRef.current && p2pManagerRef.current) void p2pManagerRef.current.signal(peerRef.current.user_id, "hangup", {}); }}><UIcon name="close" size={20} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
