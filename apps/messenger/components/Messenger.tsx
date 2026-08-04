"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "../lib/supabase/client";
import UIcon from "./UIcon";
import { useUBridgeStore } from "../lib/store";
import {
  chatIdFor,
  getChat,
  ensureChat,
  listChats,
  listMessages,
  messageId,
  saveMessage,
  searchLocal,
  updateMessage,
  upsertChat,
  updateChatMeta,
  enqueueOutbox,
  listOutboxForPeer,
  deleteOutbox,
  type LocalChat,
  type LocalMessage,
} from "../lib/local-db";
import {
  getOrCreateIdentity,
  exportPublicJwk,
  importPeerPublic,
  hasPeerPublicSync,
  encryptForPeer,
  decryptForPeer,
  signPayloadECDSA,
} from "../lib/crypto-ecdh";
import {
  createFileOffer,
  FileSender,
  FileReceiver,
  type FileOffer,
  type FileChunk,
  type FileTransfer,
} from "../lib/file-transfer";
import { P2PManager } from "../lib/p2p-manager";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null; email?: string | null };
type SignalRow = { id: string; from_user: string; to_user: string; kind: string; payload: any };
type Lang = "uz" | "en" | "ru";
type ContextState = { message: LocalMessage; x: number; y: number } | null;
type HeaderMenuState = { x: number; y: number } | null;
type ReactionBarState = { message: LocalMessage; x: number; y: number } | null;

const FULL_REACTIONS = ["❤️", "👍", "👏", "😂", "😮", "😢", "🔥", "🎉", "💯", "🙏", "😍", "🤔"];

const T = {
  uz: {
    search: "Chat, odam yoki fayl qidirish",
    chats: "Chatlar",
    pinned: "Mahkamlangan",
    online: "Online",
    offline: "Offline",
    uflow: "UFlow",
    trusted: "Ishonchli",
    select: "Chatni tanlang",
    selectSub: "Chapdan chat tanlang. Barcha xabarlar P2P shifrlangan va faqat qurilmangizda saqlanadi.",
    connected: "P2P ulandi",
    connecting: "Ulanmoqda...",
    ready: "Tayyor",
    offlinePeer: "Offline — navbatda",
    call: "Qo'ng'iroq",
    videoCall: "Video",
    hangup: "Tugatish",
    message: "Xabar yozing...",
    send: "Yuborish",
    file: "Fayl",
    files: "Fayllar",
    reaction: "Reaksiya",
    reply: "Javob",
    edit: "Tahrir",
    copy: "Nusxa",
    del: "O'chirish",
    download: "Yuklash",
    voiceTitle: "Ovozli qo'ng'iroq",
    videoTitle: "Video qo'ng'iroq",
    voiceSub: "E2E shifrlangan P2P",
    videoSub: "E2E video",
    p2p: "P2P • E2E • Local",
    ecdhActive: "ECDH faol",
    installApp: "O'rnatish",
    info: "Ma'lumot",
    mute: "Ovozsiz",
    clear: "Tozalash",
    block: "Bloklash",
    trustedTitle: "Ishonchli relay tanlang",
    trustedSub: "Offline foydalanuvchiga xabar yetkazish uchun ishonchli odamlar tanlang. UFlow eng tepasida, har doim ishlaydi va xabarni tez yetkazadi. Yuboruvchi har doim siz bo'lasiz.",
    selectTrusted: "Tanlash",
    sendViaTrusted: "Ishonchli orqali yuborish",
    waiting: "Kutilmoqda",
    sent: "Yuborildi",
    delivered: "Yetkazildi",
    read: "O'qildi",
    failed: "Xatolik",
  },
  en: {
    search: "Search chats, people or files",
    chats: "Chats",
    pinned: "Pinned",
    online: "Online",
    offline: "Offline",
    uflow: "UFlow",
    trusted: "Trusted",
    select: "Select a chat",
    selectSub: "Choose a chat. All messages P2P encrypted, local only.",
    connected: "P2P Connected",
    connecting: "Connecting...",
    ready: "Ready",
    offlinePeer: "Offline — queued",
    call: "Call",
    videoCall: "Video",
    hangup: "End",
    message: "Write a message...",
    send: "Send",
    file: "File",
    files: "Files",
    reaction: "Reaction",
    reply: "Reply",
    edit: "Edit",
    copy: "Copy",
    del: "Delete",
    download: "Download",
    voiceTitle: "Voice Call",
    videoTitle: "Video Call",
    voiceSub: "E2E P2P",
    videoSub: "E2E video",
    p2p: "P2P • E2E • Local",
    ecdhActive: "ECDH active",
    installApp: "Install",
    info: "Info",
    mute: "Mute",
    clear: "Clear",
    block: "Block",
    trustedTitle: "Select trusted relays",
    trustedSub: "Select trusted people to deliver to offline user. UFlow is at top, always online and fast. Sender is always you.",
    selectTrusted: "Select",
    sendViaTrusted: "Send via trusted",
    waiting: "Waiting",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed",
  },
  ru: {
    search: "Поиск чатов",
    chats: "Чаты",
    pinned: "Закреп",
    online: "Онлайн",
    offline: "Офлайн",
    uflow: "UFlow",
    trusted: "Доверенные",
    select: "Выберите чат",
    selectSub: "Чаты P2P зашифрованы, только локально.",
    connected: "P2P Подкл",
    connecting: "Подключение...",
    ready: "Готово",
    offlinePeer: "Офлайн",
    call: "Звонок",
    videoCall: "Видео",
    hangup: "Конец",
    message: "Сообщение...",
    send: "Отправить",
    file: "Файл",
    files: "Файлы",
    reaction: "Реакция",
    reply: "Ответ",
    edit: "Изменить",
    copy: "Копировать",
    del: "Удалить",
    download: "Скачать",
    voiceTitle: "Звонок",
    videoTitle: "Видео",
    voiceSub: "E2E P2P",
    videoSub: "E2E видео",
    p2p: "P2P • E2E • Local",
    ecdhActive: "ECDH акт",
    installApp: "Установить",
    info: "Инфо",
    mute: "Мут",
    clear: "Очистить",
    block: "Блок",
    trustedTitle: "Доверенные релеи",
    trustedSub: "Выберите доверенных для доставки офлайн юзеру. UFlow вверху, всегда онлайн.",
    selectTrusted: "Выбрать",
    sendViaTrusted: "Отпр через довер",
    waiting: "Ожид",
    sent: "Отпр",
    delivered: "Дост",
    read: "Проч",
    failed: "Ошиб",
  },
} satisfies Record<Lang, Record<string, string>>;

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string; email?: string | null } }) {
  const supabase = useMemo(() => createClient(), []);
  const store = useUBridgeStore();
  const [lang, setLangState] = useState<Lang>("en");
  const t = T[lang];

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ chatId: string; messageId: string; text: string; at: number }[]>([]);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [context, setContext] = useState<ContextState>(null);
  const [reactionBar, setReactionBar] = useState<ReactionBarState>(null);
  const [headerMenu, setHeaderMenu] = useState<HeaderMenuState>(null);
  const [pushState, setPushState] = useState<"checking" | "granted" | "default" | "denied" | "unsupported">("checking");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [trustedOpen, setTrustedOpen] = useState<{ peer: UserRow; message: LocalMessage; box: any } | null>(null);
  const [trustedSelected, setTrustedSelected] = useState<Set<string>>(new Set());

  // WebRTC refs for active call (media)
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesBox = useRef<HTMLDivElement | null>(null);
  const longPress = useRef<number | null>(null);

  const messagesCacheRef = useRef<Map<string, LocalMessage[]>>(new Map());
  const draftsRef = useRef<Map<string, string>>(new Map());
  const scrollPosRef = useRef<Map<string, number>>(new Map());
  const prevChatIdRef = useRef<string>("");
  const fileSendersRef = useRef<Map<string, FileSender>>(new Map());
  const fileReceiversRef = useRef<Map<string, FileReceiver>>(new Map());
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // P2P Manager for background and fast connecting
  const p2pManagerRef = useRef<P2PManager | null>(null);
  const bgConnectionsEnsured = useRef(false);

  const peer = store.peer;
  const peerRef = useRef<UserRow | null>(null);
  const chatKey = peer ? chatIdFor(peer.user_id) : "";

  useEffect(() => { peerRef.current = peer; }, [peer]);

  // Init theme, lang, ECDH, PWA, P2P Manager
  useEffect(() => {
    const savedTheme = localStorage.getItem("ubridge_theme") as "light" | "dark" | null;
    store.setTheme(savedTheme || "light");
    const savedLang = (localStorage.getItem("ubridge_lang") || navigator.language.slice(0, 2)) as Lang;
    if (["uz", "en", "ru"].includes(savedLang)) { setLangState(savedLang); store.setLang(savedLang); }
    void getOrCreateIdentity(initialUser.id);
    if (!("Notification" in window)) setPushState("unsupported");
    else setPushState(Notification.permission as any);
    const onBeforeInstall = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  // Close popups on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (context && !target.closest(".context-menu") && !target.closest(".message-bubble")) setContext(null);
      if (reactionBar && !target.closest(".reactions-bar") && !target.closest(".message-bubble")) setReactionBar(null);
      if (headerMenu && !target.closest(".header-popup") && !target.closest(".header-actions")) setHeaderMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setContext(null); setReactionBar(null); setHeaderMenu(null); } };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown as any);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown as any);
      window.removeEventListener("keydown", onKey);
    };
  }, [context, reactionBar, headerMenu]);

  useEffect(() => { void searchLocal(query).then(setSearchResults); }, [query]);

  useEffect(() => {
    const box = messagesBox.current;
    if (!box) return;
    if (prevChatIdRef.current !== chatKey) {
      const saved = scrollPosRef.current.get(chatKey);
      requestAnimationFrame(() => { if (box) box.scrollTop = saved ?? box.scrollHeight; });
      prevChatIdRef.current = chatKey;
      return;
    }
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 180;
    if (isNearBottom) box.scrollTop = box.scrollHeight;
  }, [store.messagesMap, chatKey, peer?.user_id]);

  useEffect(() => {
    const box = messagesBox.current;
    if (!box) return;
    const onScroll = () => { if (chatKey) scrollPosRef.current.set(chatKey, box.scrollTop); };
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [chatKey]);

  useEffect(() => {
    if (store.call.voice === "live") {
      callTimerRef.current = setInterval(() => store.setCall({ durationSec: store.call.durationSec + 1 }), 1000) as any;
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (store.call.voice === "idle") store.setCall({ durationSec: 0 });
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [store.call.voice]);

  useEffect(() => {
    if (localVideoRef.current && localStream.current) localVideoRef.current.srcObject = localStream.current;
  }, [store.call.videoEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream.current) remoteVideoRef.current.srcObject = remoteStream.current;
    if (remoteAudioRef.current && remoteStream.current) { remoteAudioRef.current.srcObject = remoteStream.current; void remoteAudioRef.current.play().catch(() => {}); }
  }, [remoteStream.current]);

  useEffect(() => { if (localStream.current) localStream.current.getAudioTracks().forEach(t => { t.enabled = !store.call.micMuted; }); }, [store.call.micMuted]);
  useEffect(() => { if (localStream.current) localStream.current.getVideoTracks().forEach(t => { t.enabled = store.call.videoEnabled; }); }, [store.call.videoEnabled]);
  useEffect(() => { if (remoteAudioRef.current) remoteAudioRef.current.muted = store.call.speakerMuted; if (remoteVideoRef.current) remoteVideoRef.current.muted = store.call.speakerMuted; }, [store.call.speakerMuted]);

  // VAPID
  function vapidKey() { return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""; }
  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const out = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
    return out;
  }
  async function ensurePushPermission() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("unsupported"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "default") { const p = await Notification.requestPermission(); setPushState(p as any); } else setPushState(Notification.permission as any);
      if (Notification.permission !== "granted" || !vapidKey()) return;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey()) });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setPushState("granted");
    } catch { if ("Notification" in window) setPushState(Notification.permission as any); }
  }
  async function notifyPeer(to: string, title: string, body: string, kind: "message" | "call" | "video" | "file" = "message") {
    try { await fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, title, body, kind, peerId: initialUser.id }) }); } catch {}
  }

  // Message system
  function systemMsg(chatId: string, text: string): LocalMessage {
    return { id: messageId(), chatId, from: "system", text, at: Date.now(), reactions: {}, delivery: "read", encrypted: false };
  }

  // Store message with cache
  async function storeMessage(m: LocalMessage) {
    await saveMessage(m);
    const cache = messagesCacheRef.current.get(m.chatId) || [];
    const idx = cache.findIndex(x => x.id === m.id);
    let nextCache = idx >= 0 ? [...cache.slice(0, idx), m, ...cache.slice(idx + 1)] : [...cache, m].sort((a, b) => a.at - b.at).slice(-400);
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
    const chatRow: LocalChat = {
      id: m.chatId, peerId: peerIdForChat, title, pinned: chat?.pinned || false,
      unread: newUnread, lastMessage: m.deletedAt ? "Deleted" : m.text, lastAt: m.at, typing: false, draft: chat?.draft, scrollTop: chat?.scrollTop,
    };
    await upsertChat(chatRow);
    store.upsertChatInState(chatRow);
  }

  // P2P Manager init - FAST connecting, background P2P, chat restore
  useEffect(() => {
    const manager = new P2PManager(supabase, initialUser.id, initialUser.name);
    p2pManagerRef.current = manager;

    manager.setHandlers({
      onMessage: async (peerId, body) => {
        // Typing
        if (body.typing !== undefined) { store.setTyping(peerId, Boolean(body.typing)); return; }

        // Chat restored notification
        if (body.type === "chat_restored") {
          void refreshChats();
          return;
        }

        // Delivery/read receipts
        if (body.type === "receipt") {
          const { messageId: mid, status } = body;
          const chatId = chatIdFor(peerId);
          const cache = messagesCacheRef.current.get(chatId) || [];
          const msg = cache.find(m => m.id === mid);
          if (msg) {
            const updated = { ...msg, delivery: status as any };
            await saveMessage(updated);
            const next = cache.map(m => m.id === mid ? updated : m);
            messagesCacheRef.current.set(chatId, next);
            if (peerRef.current?.user_id === peerId) store.setMessagesForChat(chatId, next);
          }
          return;
        }

        // Reaction
        if (body.type === "reaction") {
          const { messageId: mid, emoji, userId } = body;
          const chatId = chatIdFor(peerId);
          const cache = messagesCacheRef.current.get(chatId) || (await listMessages(chatId, 200));
          const msg = cache.find(m => m.id === mid);
          if (msg) {
            // Only one reaction per user - replace
            const reactions = { ...msg.reactions };
            // Simple logic: toggle, but for demo we store per emoji count and also track user reaction separately
            // For single per user: we need to track userReaction field, but for now just count
            // To enforce single, we remove previous reaction of this user from other emojis (store in separate map)
            // Simplified: just increment, but ensure we don't double count same emoji from same user twice in row
            // Better: store userReactions: {userId: emoji}
            // For now implement single per user via local storage key
            const key = `reaction_${mid}_${userId}`;
            const prev = localStorage.getItem(key);
            if (prev && prev !== emoji) {
              // Remove previous
              if (reactions[prev]) { reactions[prev] = Math.max(0, (reactions[prev] || 1) - 1); if (reactions[prev] === 0) delete reactions[prev]; }
            }
            if (prev !== emoji) {
              reactions[emoji] = (reactions[emoji] || 0) + 1;
              localStorage.setItem(key, emoji);
            } else {
              // Toggle off
              if (reactions[emoji]) { reactions[emoji] = Math.max(0, reactions[emoji] - 1); if (reactions[emoji] === 0) delete reactions[emoji]; }
              localStorage.removeItem(key);
            }
            const updated = { ...msg, reactions };
            await saveMessage(updated);
            const next = cache.map(m => m.id === mid ? updated : m);
            messagesCacheRef.current.set(chatId, next);
            if (peerRef.current?.user_id === peerId || store.messagesMap.has(chatId)) store.setMessagesForChat(chatId, next);
          }
          return;
        }

        // File handling
        if (body.type === "file_offer") {
          const offer = body as FileOffer;
          const receiver = new FileReceiver(offer, (transfer) => store.setFileTransfer(transfer));
          fileReceiversRef.current.set(offer.fileId, receiver);
          const msg: LocalMessage = {
            id: messageId(), chatId: chatIdFor(peerId), from: "peer",
            text: `File: ${offer.name} (${(offer.size / 1024).toFixed(1)} KB)`, at: Date.now(),
            reactions: {}, delivery: "delivered", encrypted: true,
            attachment: { name: offer.name, mime: offer.mime, size: offer.size },
          };
          await storeMessage(msg);
          // Send delivered receipt
          void sendReceipt(peerId, msg.id, "delivered");
          return;
        }
        if (body.type === "file_chunk") {
          const chunk = body as FileChunk;
          const receiver = fileReceiversRef.current.get(chunk.fileId);
          if (receiver) {
            receiver.receiveChunk(chunk);
            // Ack
            const ack = { type: "file_ack", fileId: chunk.fileId, index: chunk.index };
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
            const msg: LocalMessage = {
              id: messageId(), chatId: chatIdFor(peerId), from: "peer",
              text: `File ready: ${completed.name}`, at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true,
              attachment: { name: completed.name, mime: completed.mime, size: completed.size },
            };
            await storeMessage(msg);
            void sendReceipt(peerId, msg.id, "delivered");
          }
          return;
        }

        // Trusted forward handling (I am trusted relay)
        if (body.type === "trusted_forward") {
          const { finalTo, from, originalBox } = body;
          // Store for final recipient
          const chatId = chatIdFor(finalTo);
          // If final recipient is me, handle as normal message
          if (finalTo === initialUser.id) {
            try {
              const inner = await decryptForPeer(from, finalTo, originalBox);
              const incoming: LocalMessage = {
                id: messageId(), chatId: chatIdFor(from), from: "peer",
                text: inner.text || "Forwarded via trusted", at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true,
              };
              await storeMessage(incoming);
              void sendReceipt(from, inner.id || incoming.id, "delivered");
            } catch {}
          } else {
            // I am relay, store in outbox for finalTo and try to deliver
            await enqueueOutbox({ id: messageId(), chatId, peerId: finalTo, box: originalBox, plainText: "trusted", at: Date.now(), attempts: 0 });
            void manager.ensureConnection({ user_id: finalTo, name: "Peer", online: true, status: null, relay: null, last_seen: null } as any, true);
          }
          return;
        }

        // Regular message
        const incoming: LocalMessage = {
          id: messageId(), chatId: chatIdFor(peerId), from: "peer",
          text: body.text || JSON.stringify(body).slice(0, 200), at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true,
          signature: body.signature, replyTo: body.replyTo || null,
          attachment: body.fileName ? { name: body.fileName, mime: body.mime, size: body.size } : undefined,
        };
        await storeMessage(incoming);
        void sendReceipt(peerId, body.id || incoming.id, "delivered");
        if (peerRef.current?.user_id !== peerId && Notification.permission === "granted") {
          try { new Notification(store.users.find(u => u.user_id === peerId)?.name || "UBridge", { body: incoming.text.slice(0, 120), icon: "/icons/icon-192.png" }); } catch {}
        }
      },
      onStateChange: (peerId, state) => {
        if (peerRef.current?.user_id === peerId) {
          if (state === "connected") store.setConnection("connected");
          else if (state === "connecting") store.setConnection("connecting");
          else if (state === "failed" || state === "idle") {
            // Don't immediately set idle if we have other connections, check if still have any connected
            const stillConnected = manager.isConnected(peerId);
            if (!stillConnected) store.setConnection("idle");
          }
        }
      },
      onDataChannelOpen: (peerId) => {
        if (peerRef.current?.user_id === peerId) {
          store.setConnection("connected");
          void drainLocalOutbox(peerId);
        }
      },
    });

    void manager.initRealtime();

    // Poll fallback
    const pollInterval = setInterval(() => void manager.pollSignals(), 2500);

    return () => {
      clearInterval(pollInterval);
      manager.disconnectAll();
    };
  }, []);

  function cleanup() { try { void supabase.rpc("ubridge_cleanup"); } catch {} }
  async function upsertMe(status: string) { try { await supabase.rpc("ubridge_upsert_me", { p_name: initialUser.name, p_relay: "webrtc-p2p-v4-fast", p_status: status }); } catch {} }
  async function loadUsers() {
    try {
      const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false });
      if (data) {
        store.setUsers(data as UserRow[]);
        // Background P2P for all online - FAST
        if (!bgConnectionsEnsured.current && p2pManagerRef.current) {
          bgConnectionsEnsured.current = true;
          void p2pManagerRef.current.ensureBackgroundConnections(data as UserRow[]);
        } else if (p2pManagerRef.current) {
          // Ensure for new online users
          void p2pManagerRef.current.ensureBackgroundConnections(data as UserRow[]);
        }
      }
    } catch {}
  }
  async function refreshChats() { store.setChats(await listChats()); }

  async function openPeer(u: UserRow) {
    if (peerRef.current) {
      const prevId = chatIdFor(peerRef.current.user_id);
      if (text) { draftsRef.current.set(prevId, text); store.setDraft(prevId, text); }
      const box = messagesBox.current;
      if (box) scrollPosRef.current.set(prevId, box.scrollTop);
      void updateChatMeta(prevId, { draft: text || undefined, scrollTop: box?.scrollTop });
    }
    const id = chatIdFor(u.user_id);
    store.setPeer(u);
    const existing = await getChat(id);
    if (!existing) {
      await ensureChat({ id, peerId: u.user_id, title: u.name, pinned: false, unread: 0, lastMessage: "", lastAt: Date.now(), typing: false, draft: draftsRef.current.get(id) });
    }
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

    // FAST connecting: check if already connected via manager
    const manager = p2pManagerRef.current;
    if (manager?.isConnected(u.user_id)) {
      store.setConnection("connected");
      void drainLocalOutbox(u.user_id);
      // Send read receipts for unread
      const unread = (messagesCacheRef.current.get(id) || []).filter(m => m.from === "peer" && m.delivery !== "read");
      for (const m of unread) void sendReceipt(u.user_id, m.id, "read");
    } else {
      store.setConnection("connecting");
      void manager?.ensureConnection(u, false);
    }
  }

  function handleBackToHome() {
    if (peerRef.current) {
      const prevId = chatIdFor(peerRef.current.user_id);
      draftsRef.current.set(prevId, text);
      store.setDraft(prevId, text);
      const box = messagesBox.current;
      if (box) scrollPosRef.current.set(prevId, box.scrollTop);
      void updateChatMeta(prevId, { draft: text || undefined, scrollTop: box?.scrollTop });
    }
    store.setPeer(null);
    setText("");
    // Don't set idle if bg connections exist
  }

  async function sendReceipt(to: string, messageId: string, status: "sent" | "delivered" | "read") {
    const manager = p2pManagerRef.current;
    if (!manager) return;
    const dc = manager.getDataChannel(to);
    if (dc?.readyState === "open") {
      try {
        const payload = { type: "receipt", messageId, status, from: initialUser.id };
        const box = await encryptForPeer(initialUser.id, to, payload);
        dc.send(JSON.stringify({ box }));
      } catch {}
    } else {
      // Try via manager signal? Receipts are not critical, skip if not connected
    }
  }

  async function drainLocalOutbox(peerId: string) {
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerId);
    if (!dc || dc.readyState !== "open") return;
    const items = await listOutboxForPeer(peerId);
    for (const item of items) {
      try { dc.send(JSON.stringify({ box: item.box })); await deleteOutbox(item.id); } catch {}
    }
  }

  // Bootstrap
  useEffect(() => {
    async function bootstrapOnce() {
      store.setInitialUser(initialUser);
      await upsertMe("online");
      await loadUsers();
      await refreshChats();
    }
    void bootstrapOnce();
    const presenceBeat = setInterval(() => void upsertMe(store.connection === "connected" ? "online" : "online"), 12000);
    const usersPoll = setInterval(() => void loadUsers(), 6000);
    const cleanupBeat = setInterval(() => void cleanup(), 60000);
    const channel = supabase.channel("ubridge-presence-v4")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();
    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "UBRIDGE_NOTIFICATION_CLICK") {
        const peerId = e.data.data?.peerId;
        if (peerId) { const u = store.users.find(x => x.user_id === peerId); if (u) void openPeer(u); }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(presenceBeat);
      clearInterval(usersPoll);
      clearInterval(cleanupBeat);
      void supabase.removeChannel(channel);
      window.removeEventListener("beforeunload", onUnload);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  // Context etc
  function openContext(message: LocalMessage, x: number, y: number) {
    setContext({ message, x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 280) });
  }
  function openReactionBar(message: LocalMessage, x: number, y: number) {
    setReactionBar({ message, x: Math.min(x, window.innerWidth - 320), y: Math.max(8, y - 48) });
  }
  function startLongPress(message: LocalMessage, e: React.PointerEvent) {
    if (longPress.current) window.clearTimeout(longPress.current);
    const x = e.clientX, y = e.clientY;
    longPress.current = window.setTimeout(() => { openReactionBar(message, x, y); openContext(message, x, y + 40); }, 420) as any;
  }
  function cancelLongPress() { if (longPress.current) window.clearTimeout(longPress.current); longPress.current = null; }

  // Send message - with trusted relay and status
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
    const local: LocalMessage = {
      id: localId, chatId, from: "me", text: value, at: Date.now(),
      replyTo: replyTo?.id || null, reactions: {}, delivery: "waiting", encrypted: true, signature: payload.signature,
    };
    await storeMessage(local);
    setReplyTo(null);

    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerNow.user_id);

    if (dc?.readyState === "open") {
      try { dc.send(JSON.stringify({ box })); local.delivery = "sent"; await storeMessage(local); void notifyPeer(peerNow.user_id, initialUser.name, value.slice(0, 80), "message"); }
      catch { local.delivery = "failed"; await storeMessage(local); await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts: 0 }); }
    } else {
      // Offline - ask for trusted relay
      local.delivery = "waiting";
      await storeMessage(local);
      await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts: 0 });

      // Show trusted selector if peer offline
      if (!peerNow.online) {
        setTrustedOpen({ peer: peerNow, message: local, box });
        setTrustedSelected(new Set());
      } else {
        // Try fast connect
        void manager?.ensureConnection(peerNow, false);
        void notifyPeer(peerNow.user_id, initialUser.name, "New message (open to receive)", "message");
      }
    }
  }

  async function sendViaTrusted() {
    if (!trustedOpen) return;
    const { peer, box } = trustedOpen;
    const selected = Array.from(trustedSelected);
    const manager = p2pManagerRef.current;
    if (manager) await manager.sendViaTrusted(peer.user_id, selected, box);
    // Also mark as sent via trusted
    const local = trustedOpen.message;
    const updated = { ...local, delivery: "sent" as const };
    await storeMessage(updated);
    setTrustedOpen(null);
    setTrustedSelected(new Set());
  }

  async function sendFile(file: File) {
    if (!peerRef.current) return;
    const peerNow = peerRef.current;
    const chatId = chatIdFor(peerNow.user_id);
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerNow.user_id);

    if (!dc || dc.readyState !== "open") void manager?.ensureConnection(peerNow, false);

    const offer = createFileOffer(file);
    const transfer: FileTransfer = {
      fileId: offer.fileId, name: file.name, size: file.size, mime: file.type,
      chunkSize: offer.chunkSize, totalChunks: offer.totalChunks, transferred: 0, receivedChunks: 0,
      state: "sending", progress: 0, direction: "send", file,
    };
    store.setFileTransfer(transfer);
    const msg: LocalMessage = {
      id: messageId(), chatId, from: "me", text: `${t.send}: ${file.name}`, at: Date.now(), reactions: {}, delivery: "waiting", encrypted: true,
      attachment: { name: file.name, mime: file.type, size: file.size }
    };
    await storeMessage(msg);

    const sender = new FileSender(dc as any, file, offer, (progress) => {
      store.setFileTransfer({ ...transfer, progress, transferred: Math.round(file.size * progress / 100), state: progress === 100 ? "completed" : "sending" });
    });
    fileSendersRef.current.set(offer.fileId, sender);

    const waitForDc = async () => {
      let tries = 0;
      while ((manager?.getDataChannel(peerNow.user_id)?.readyState !== "open") && tries < 20) { await new Promise(r => setTimeout(r, 300)); tries++; }
      return manager?.getDataChannel(peerNow.user_id)?.readyState === "open";
    };

    if (await waitForDc()) {
      try {
        const realDc = manager?.getDataChannel(peerNow.user_id);
        const realSender = new FileSender(realDc as any, file, offer, (progress) => {
          store.setFileTransfer({ ...transfer, progress, transferred: Math.round(file.size * progress / 100), state: progress === 100 ? "completed" : "sending" });
        });
        await realSender.send(async (data) => await encryptForPeer(initialUser.id, peerNow.user_id, data));
        msg.delivery = "sent"; await storeMessage(msg);
        store.setFileTransfer({ ...transfer, progress: 100, state: "completed" });
        void notifyPeer(peerNow.user_id, initialUser.name, `File: ${file.name}`, "file");
      } catch (e: any) {
        msg.delivery = "failed"; await storeMessage(msg);
        store.setFileTransfer({ ...transfer, state: "error", error: e.message });
      }
    } else {
      msg.delivery = "failed"; await storeMessage(msg);
      store.setFileTransfer({ ...transfer, state: "error", error: "P2P not connected" });
    }
  }

  function setTypingSignal(v: string) {
    if (peerRef.current) {
      const cid = chatIdFor(peerRef.current.user_id);
      draftsRef.current.set(cid, v);
      store.setDraft(cid, v);
      void updateChatMeta(cid, { draft: v || undefined });
    }
    setText(v);
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerRef.current!.user_id);
    if (dc?.readyState === "open") try { dc.send(JSON.stringify({ typing: Boolean(v) })); } catch {}
  }

  async function handleReaction(message: LocalMessage, emoji: string) {
    const peerId = message.chatId.replace("direct:", "");
    const userId = initialUser.id;
    const key = `reaction_${message.id}_${userId}`;
    const prev = localStorage.getItem(key);
    let newEmoji = emoji;
    let reactions = { ...message.reactions };

    if (prev === emoji) {
      // Remove
      if (reactions[emoji]) { reactions[emoji] = Math.max(0, reactions[emoji] - 1); if (reactions[emoji] === 0) delete reactions[emoji]; }
      localStorage.removeItem(key);
      newEmoji = "";
    } else {
      if (prev && reactions[prev]) { reactions[prev] = Math.max(0, reactions[prev] - 1); if (reactions[prev] === 0) delete reactions[prev]; }
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      localStorage.setItem(key, emoji);
    }

    const updated = { ...message, reactions };
    await storeMessage(updated);

    // Send via P2P
    const manager = p2pManagerRef.current;
    const dc = manager?.getDataChannel(peerId);
    if (dc?.readyState === "open") {
      try {
        const payload = { type: "reaction", messageId: message.id, emoji: newEmoji || emoji, userId, prevEmoji: prev };
        const box = await encryptForPeer(initialUser.id, peerId, payload);
        dc.send(JSON.stringify({ box }));
      } catch {}
    }

    setReactionBar(null);
    setContext(null);
  }

  function del(m: LocalMessage) { const next = { ...m, deletedAt: Date.now(), text: "Message deleted" }; void storeMessage(next); setContext(null); setReactionBar(null); }
  function copy(m: LocalMessage) { void navigator.clipboard?.writeText(m.text); setContext(null); setReactionBar(null); }
  function edit(m: LocalMessage) { setEditing(m); setText(m.text); setContext(null); setReactionBar(null); }
  function forward(m: LocalMessage) { setText(`Forwarded: ${m.text}`); setContext(null); setReactionBar(null); }

  async function startVoiceCall(video = false) {
    if (!peerRef.current) return;
    const p = peerRef.current;
    store.setCall({ voice: "calling", videoEnabled: video, isIncoming: false, callerId: p.user_id, callerName: p.name });
    await notifyPeer(p.user_id, `${initialUser.name} ${video ? "video calling" : "is calling"}`, video ? "Incoming video call" : "Incoming voice call", video ? "video" : "call");
    const manager = p2pManagerRef.current;
    if (manager) {
      const conn = await manager.ensureConnection(p, false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
        localStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        await manager.addMediaTracks(p.user_id, stream);
        // Create offer for call
        const pc = manager.getPC(p.user_id);
        if (pc) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: video } as any);
          await pc.setLocalDescription(offer);
          const pub = await exportPublicJwk(initialUser.id);
          await manager.signal(p.user_id, "offer", { sdp: offer.sdp, type: offer.type, ecdhPublic: pub, callerName: initialUser.name, media: { audio: true, video } });
        }
      } catch (e) { console.error("Call failed", e); store.setCall({ voice: "idle" }); }
    }
  }

  function endCall(sendSignal = true) {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    remoteStream.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    const peerId = store.call.callerId || peerRef.current?.user_id;
    if (peerId && p2pManagerRef.current) void p2pManagerRef.current.removeMediaTracks(peerId);
    store.resetCall();
    if (sendSignal && peerId && p2pManagerRef.current) void p2pManagerRef.current.signal(peerId, "hangup", {});
  }

  async function answerCall() {
    const pending = (window as any).__pendingOffer;
    if (!pending) return;
    const target = store.users.find(u => u.user_id === pending.from_user) || { user_id: pending.from_user, name: pending.payload?.callerName || "Caller", online: true, status: null, relay: null, last_seen: null } as UserRow;
    store.setPeer(target);
    peerRef.current = target;
    store.setCall({ isIncoming: false, voice: "calling" });
    const manager = p2pManagerRef.current;
    if (!manager) return;
    const conn = await manager.ensureConnection(target, false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!pending.payload?.media?.video });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      await manager.addMediaTracks(target.user_id, stream);
      await conn.pc.setRemoteDescription(new RTCSessionDescription({ type: pending.payload.type, sdp: pending.payload.sdp }));
      const answer = await conn.pc.createAnswer();
      await conn.pc.setLocalDescription(answer);
      const myPub = await exportPublicJwk(initialUser.id);
      await manager.signal(target.user_id, "answer", { sdp: answer.sdp, type: answer.type, ecdhPublic: myPub });
    } catch (e) { console.warn("answerCall failed", e); }
    (window as any).__pendingOffer = null;
  }

  function rejectCall() {
    const pending = (window as any).__pendingOffer as SignalRow | undefined;
    const manager = p2pManagerRef.current;
    if (pending && manager) void manager.signal(pending.from_user, "hangup", {});
    else if (store.call.callerId && manager) void manager.signal(store.call.callerId, "hangup", {});
    endCall();
  }

  // Derived
  const messagesForCurrent = chatKey ? (store.messagesMap.get(chatKey) || []) : [];
  const recent = store.chats.slice(0, 120);
  const pinned = store.chats.filter(c => c.pinned);
  const online = store.users.filter(u => u.online);
  const offline = store.users.filter(u => !u.online);
  // Trusted list: UFlow at top, then online users
  const trustedList = useMemo(() => {
    const uflow = online.find(u => u.name.toLowerCase().includes("uflow") || u.user_id.includes("uflow")) || online[0];
    const rest = online.filter(u => u.user_id !== uflow?.user_id && u.user_id !== peer?.user_id).slice(0, 10);
    return uflow ? [uflow, ...rest] : rest;
  }, [online, peer]);

  const shellClass = `ub-shell ${peer ? "chat-open" : ""} ${store.isInfoOpen ? "info-open" : ""}`;
  const callDurationFormatted = `${Math.floor(store.call.durationSec / 60).toString().padStart(2, "0")}:${(store.call.durationSec % 60).toString().padStart(2, "0")}`;

  return (
    <main className="ub-app">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {pushState !== "granted" && pushState !== "unsupported" && (
        <div className="push-permission"><div><b>🔔 Notifications</b><span>P2P calls & messages even in background</span></div><button onClick={() => void ensurePushPermission()}>Enable</button></div>
      )}
      {installPrompt && (
        <div className="push-permission" style={{ top: "auto", bottom: "72px" }}><div><b>📲 {t.installApp}</b><span>Add to home screen</span></div><button onClick={handleInstall}>Install</button></div>
      )}

      <div className={shellClass}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-mark">
                <img src="/ubridge-logo.svg" alt="UBridge" />
                <div className="brand-copy"><strong>UBridge</strong><span>P2P Messenger</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="theme-toggle" onClick={() => store.toggleTheme()} aria-label="Toggle theme"><UIcon name={store.theme === "dark" ? "sun" : "moon"} /></button>
                <button className="icon-button" onClick={() => store.setInfoOpen(!store.isInfoOpen)}><UIcon name="info" /></button>
              </div>
            </div>
            <div className="search-box"><span className="search-icon"><UIcon name="search" /></span><input className="search-input" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="p2p-badge"><UIcon name="shield" size={12} /> {t.p2p} • {t.ecdhActive} • {p2pManagerRef.current?.getConnectedPeers().length || 0} BG</div>
          </div>

          <div className="sidebar-scroll">
            {query && <Section title="Search">{searchResults.map(r => <button className="chat-item" key={r.messageId}><div className="avatar"><UIcon name="search" /></div><div className="chat-main"><div className="chat-name">{r.text}</div><div className="chat-preview">{formatTime(r.at)}</div></div></button>)}</Section>}
            {pinned.length > 0 && <Section title={t.pinned}>{pinned.map(c => <ChatButton key={c.id} chat={c} active={chatKey === c.id} onClick={() => { const u = store.users.find(x => x.user_id === c.peerId) || { user_id: c.peerId, name: c.title, online: false, status: null, relay: null, last_seen: null }; void openPeer(u as UserRow); }} />)}</Section>}
            <Section title={t.chats}>{recent.map(c => <ChatButton key={c.id} chat={c} active={chatKey === c.id} onClick={() => { const u = store.users.find(x => x.user_id === c.peerId) || { user_id: c.peerId, name: c.title, online: false, status: null, relay: null, last_seen: null }; void openPeer(u as UserRow); }} />)}</Section>
          </div>

          <div className="sidebar-bottom">
            <Section title={`${t.online} • ${online.length}`}>{online.map(u => <UserButton key={u.user_id} u={u} active={peer?.user_id === u.user_id} onClick={() => void openPeer(u)} bgConnected={p2pManagerRef.current?.isConnected(u.user_id) || false} />)}</Section>
            <Section title={`${t.offline} • ${offline.length}`}>{offline.map(u => <UserButton key={u.user_id} u={u} active={peer?.user_id === u.user_id} onClick={() => void openPeer(u)} bgConnected={false} />)}</Section>
          </div>
        </aside>

        <section className="chat-panel">
          {!peer ? (
            <div className="empty-state"><div className="empty-card"><img src="/ubridge-logo.svg" alt="" /><h1>{t.select}</h1><p>{t.selectSub}</p><div className="empty-hint"><UIcon name="shield" /> E2E • ECDH • BG P2P • Trusted Relay • Cloudflare Fast</div></div></div>
          ) : (
            <>
              <header className="chat-header">
                <button className="icon-button mobile-back" onClick={handleBackToHome} aria-label="Back"><UIcon name="arrow-left" /></button>
                <div className="peer-info">
                  <div className="avatar large">{peer.name[0]?.toUpperCase()}<span className="online-dot" /></div>
                  <div className="peer-copy"><strong>{peer.name}</strong><div className={`peer-status ${store.connection}`}>{store.typingPeers[peer.user_id] ? "typing…" : store.connection === "connected" ? t.connected : store.connection === "connecting" ? t.connecting : peer.online ? t.ready : t.offlinePeer}</div></div>
                </div>
                <div className="header-actions">
                  <button className="action-button" onClick={() => void startVoiceCall(false)} title={t.call}><UIcon name="phone" /> <span className="hide-mobile">{t.call}</span></button>
                  <button className="action-button primary" onClick={() => void startVoiceCall(true)} title={t.videoCall}><UIcon name="video" /> <span className="hide-mobile">{t.videoCall}</span></button>
                  <button className="icon-button" onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setHeaderMenu({ x: rect.right - 260, y: rect.bottom + 8 }); }}><UIcon name="more" /></button>
                </div>
              </header>

              <div className="messages" ref={messagesBox}>
                {messagesForCurrent.slice(-220).map((m) => (
                  <div key={m.id} className={`message-row ${m.from}`}>
                    <div className={`message-bubble ${m.from === "me" ? "me" : "peer"} ${m.deletedAt ? "deleted" : ""}`} onPointerDown={(e) => startLongPress(m, e)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onContextMenu={(e) => { e.preventDefault(); openReactionBar(m, e.clientX, e.clientY); openContext(m, e.clientX, e.clientY + 44); }}>
                      {m.replyTo && <div className="reply-mark">{t.reply}</div>}
                      <span>{m.deletedAt ? "Message deleted" : m.text}</span>
                      {m.attachment && (
                        <div className="attachment">
                          <div className="file-icon">📄</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{m.attachment.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.attachment.mime || "file"} • {m.attachment.size ? (m.attachment.size / 1024).toFixed(1) + " KB" : ""}</div>
                          </div>
                          {(() => { const ft = Array.from(store.fileTransfers.values()).find(f => f.name === m.attachment!.name); if (ft?.blobUrl) return <a href={ft.blobUrl} download={ft.name} className="action-button" style={{ height: 32 }}><UIcon name="download" /> {t.download}</a>; return null; })()}
                        </div>
                      )}
                      {(() => { const ft = Array.from(store.fileTransfers.values()).find(f => m.text.includes(f.name)); if (ft && ft.state !== "completed") return <div className="file-progress"><div className="file-progress-bar"><div className="file-progress-fill" style={{ width: `${ft.progress}%` }} /></div><div className="file-progress-text">{ft.state} {ft.progress}%</div></div>; return null; })()}
                      <div className="message-meta">
                        <span>{formatTime(m.at)}</span>
                        {m.from === "me" && (
                          <span className={`msg-status ${m.delivery}`}>
                            {m.delivery === "waiting" ? `⏳ ${t.waiting}` : m.delivery === "sent" ? `✓ ${t.sent}` : m.delivery === "delivered" ? `✓✓ ${t.delivered}` : m.delivery === "read" ? `✓✓ ${t.read}` : m.delivery}
                          </span>
                        )}
                        {m.from !== "me" && <span>{m.delivery}</span>}
                      </div>
                      {Object.keys(m.reactions).length > 0 && <div className="reactions">{Object.entries(m.reactions).map(([e, n]) => <span key={e} title={e}>{e} {n}</span>)}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {replyTo && <div className="reply-bar">{t.reply}: {replyTo.text}<button onClick={() => setReplyTo(null)}>×</button></div>}
              {editing && <div className="reply-bar">{t.edit}<button onClick={() => { setEditing(null); setText(""); }}>×</button></div>}

              {Array.from(store.fileTransfers.values()).filter(f => f.state !== "completed" && f.direction === "send").slice(0, 1).map(ft => (
                <div key={ft.fileId} className="reply-bar"><UIcon name="file" /> {ft.name} — {ft.progress}%<div className="file-progress-bar" style={{ width: 100, marginLeft: 12 }}><div className="file-progress-fill" style={{ width: `${ft.progress}%` }} /></div><button onClick={() => { fileSendersRef.current.get(ft.fileId)?.abort(); store.removeFileTransfer(ft.fileId); }}>×</button></div>
              ))}

              <footer className="composer">
                <button className="round-button" title={t.reaction} onClick={() => { if (messagesForCurrent.length) { const last = messagesForCurrent[messagesForCurrent.length - 1]; if (last) openReactionBar(last, window.innerWidth - 200, window.innerHeight - 200); } }}>😊</button>
                <label className="round-button" title={t.file}>+<input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendFile(f); }} /></label>
                <textarea className="composer-textarea" value={text} onChange={(e) => setTypingSignal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={t.message} />
                <button className="send-button" onClick={() => void send()} aria-label="Send"><UIcon name="send" /></button>
              </footer>
            </>
          )}
        </section>

        <aside className="info-panel">
          <div className="info-card">
            <div className="avatar xl">{peer?.name[0]?.toUpperCase() || "U"}</div>
            <h3>{peer?.name || "UBridge"}</h3>
            <p>{peer ? "E2E • ECDH • BG P2P • Trusted" : "Secure P2P"}</p>
          </div>
          <div className="info-list">
            <div className="info-row"><UIcon name="shield" /> {t.ecdhActive} P-256</div>
            <div className="info-row"><UIcon name="link" /> BG P2P: {p2pManagerRef.current?.getConnectedPeers().length || 0} connected</div>
            <div className="info-row"><UIcon name="database" /> Local-first, Cloudflare fast</div>
            <div className="info-row"><UIcon name="file" /> Chunked 16KB + Trusted</div>
            <div className="info-row"><UIcon name="video" /> Voice/Video + Mute</div>
            {installPrompt && <button className="action-button primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleInstall}><UIcon name="download" /> {t.installApp}</button>}
          </div>
          {peer && (
            <div className="info-list">
              <div className="info-row"><span>Connection:</span> <b>{store.connection}</b> {p2pManagerRef.current?.isConnected(peer.user_id) ? "⚡" : ""}</div>
              <div className="info-row"><span>ECDH:</span> <b>{hasPeerPublicSync(peer.user_id) ? "✓ Shared" : "⏳"}</b></div>
              <div className="info-row"><span>BG:</span> <b>{p2pManagerRef.current?.isConnected(peer.user_id) ? "Connected BG" : "Not BG"}</b></div>
            </div>
          )}
        </aside>

        {/* Call Modal */}
        {(store.call.voice !== "idle") && (
          <div className="call-modal">
            <div className="video-grid" style={{ display: store.call.videoEnabled ? "grid" : "none" }}>
              <div className="video-tile"><video ref={remoteVideoRef} autoPlay playsInline /><div className="label">{peer?.name || store.call.callerName || "Peer"} {store.call.speakerMuted && "🔇"}</div></div>
              <div className="video-tile local"><video ref={localVideoRef} autoPlay playsInline muted /><div className="label">You {store.call.micMuted && "🔇"}</div></div>
            </div>
            <div className="call-card" style={{ marginTop: store.call.videoEnabled ? 12 : 0 }}>
              {!store.call.videoEnabled && <div className="call-pulse"><div className="avatar huge">{(store.call.callerName || peer?.name || "U")[0]?.toUpperCase()}</div></div>}
              <h2>{store.call.isIncoming ? (store.call.videoEnabled ? t.voiceTitle : t.voiceTitle) : store.call.videoEnabled ? t.voiceTitle : t.voiceTitle}</h2>
              <p>{store.call.isIncoming ? `${store.call.callerName || "Someone"} calling...` : store.call.voice === "live" ? t.connected : t.voiceSub}</p>
              {store.call.voice === "live" && <div className="call-duration">{callDurationFormatted}</div>}
              <div className="call-controls">
                {store.call.isIncoming ? (
                  <>
                    <button className="call-btn hangup" onClick={rejectCall}><UIcon name="close" /></button>
                    <button className="call-btn active" style={{ width: 72, height: 72 }} onClick={() => void answerCall()}><UIcon name="phone" /></button>
                  </>
                ) : (
                  <>
                    <button className={`call-btn ${store.call.micMuted ? "muted" : ""}`} onClick={() => store.toggleMic()}><UIcon name={store.call.micMuted ? "mic-off" : "mic"} /></button>
                    <button className={`call-btn ${!store.call.videoEnabled ? "muted" : ""}`} onClick={() => store.toggleVideo()}><UIcon name={store.call.videoEnabled ? "video" : "video-off"} /></button>
                    <button className={`call-btn ${store.call.speakerMuted ? "muted" : ""}`} onClick={() => store.toggleSpeaker()}><UIcon name={store.call.speakerMuted ? "volume-mute" : "volume"} /></button>
                    <button className="call-btn hangup" onClick={() => endCall(true)}><UIcon name="close" /></button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Full Reactions Bar - on top of context menu, uflow icons fallback */}
        {reactionBar && (
          <div className="reactions-bar" style={{ left: reactionBar.x, top: reactionBar.y }}>
            {FULL_REACTIONS.map(emoji => {
              const isActive = reactionBar.message.reactions[emoji] && localStorage.getItem(`reaction_${reactionBar.message.id}_${initialUser.id}`) === emoji;
              return <button key={emoji} className={isActive ? "active" : ""} onClick={() => void handleReaction(reactionBar.message, emoji)}>{emoji}</button>;
            })}
          </div>
        )}

        {context && (
          <div className="context-menu" style={{ left: context.x, top: context.y }}>
            <button onClick={() => { setReplyTo(context.message); setContext(null); setReactionBar(null); }}><UIcon name="message" />{t.reply}</button>
            <button onClick={() => { forward(context.message); setContext(null); setReactionBar(null); }}><UIcon name="share" />Forward</button>
            <button onClick={() => { edit(context.message); setContext(null); setReactionBar(null); }}><UIcon name="edit" />{t.edit}</button>
            <button onClick={() => { copy(context.message); setContext(null); setReactionBar(null); }}><UIcon name="copy" />{t.copy}</button>
            <button className="danger" onClick={() => { del(context.message); }}><UIcon name="trash" />{t.del}</button>
          </div>
        )}

        {/* Header Popup - mobile video top right button as popup */}
        {headerMenu && (
          <div className="header-popup" style={{ left: headerMenu.x, top: headerMenu.y }}>
            <div className="popup-title">Chat options</div>
            <button onClick={() => { store.setInfoOpen(true); setHeaderMenu(null); }}><UIcon name="info" /> {t.info}</button>
            <button onClick={() => { setHeaderMenu(null); }}><UIcon name="search" /> Search</button>
            <button onClick={() => { setHeaderMenu(null); }}><UIcon name="volume-mute" /> {t.mute}</button>
            <div className="popup-divider" />
            <button onClick={() => { if (peer) { void (async () => { const msgs = await listMessages(chatIdFor(peer.user_id), 200); for (const m of msgs) await saveMessage({ ...m, deletedAt: Date.now(), text: "Cleared" }); store.setMessagesForChat(chatIdFor(peer.user_id), []); messagesCacheRef.current.set(chatIdFor(peer.user_id), []); })(); } setHeaderMenu(null); }}><UIcon name="trash" /> {t.clear}</button>
            <button className="danger" onClick={() => { setHeaderMenu(null); }}><UIcon name="close" /> {t.block}</button>
          </div>
        )}

        {/* Trusted Relay Selector */}
        {trustedOpen && (
          <div className="trusted-modal">
            <div className="trusted-card">
              <div className="trusted-header">
                <h3>{t.trustedTitle}</h3>
                <p>{t.trustedSub}</p>
              </div>
              <div className="trusted-list">
                {trustedList.map(u => {
                  const isSelected = trustedSelected.has(u.user_id);
                  const isUflow = u.name.toLowerCase().includes("uflow");
                  return (
                    <div key={u.user_id} className={`trusted-item ${isSelected ? "selected" : ""}`} onClick={() => {
                      const next = new Set(trustedSelected);
                      if (next.has(u.user_id)) next.delete(u.user_id); else next.add(u.user_id);
                      setTrustedSelected(next);
                    }}>
                      <div className="avatar">{u.name[0]?.toUpperCase()}<span className="online-dot" /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>{u.name} {isUflow && <span className="trusted-badge">⚡ {t.uflow}</span>} {p2pManagerRef.current?.isConnected(u.user_id) && <span style={{ fontSize: 10 }}>• BG</span>}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{u.online ? "Online • Fast relay" : "Offline"}</div>
                      </div>
                      <div className="check">{isSelected ? <UIcon name="check" size={14} /> : null}</div>
                    </div>
                  );
                })}
                {trustedList.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>No online trusted peers</div>}
              </div>
              <div className="trusted-footer">
                <button className="action-button" onClick={() => setTrustedOpen(null)}>Cancel</button>
                <button className="action-button primary" disabled={trustedSelected.size === 0} onClick={() => void sendViaTrusted()}>{t.sendViaTrusted} ({trustedSelected.size})</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><div className="section-title">{title}</div><div className="section-list">{children}</div></section>; }
function UserButton({ u, active, onClick, bgConnected }: { u: UserRow; active: boolean; onClick: () => void; bgConnected: boolean }) {
  return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{u.name[0]?.toUpperCase()}{u.online && <span className="online-dot" />}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{u.name}</span>{bgConnected && <span className="trusted-badge" style={{ fontSize: 9, padding: "2px 6px" }}>BG</span>}</div><div className="chat-preview">{u.status || (bgConnected ? "BG connected • Fast" : "offline")}</div></div><div className="chat-meta"><span className="chat-time">{u.online ? "now" : ""}</span></div></button>;
}
function ChatButton({ chat, active, onClick }: { chat: LocalChat; active: boolean; onClick: () => void }) {
  return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{chat.title[0]?.toUpperCase()}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{chat.title}</span>{chat.draft && <span className="draft-mark">• draft</span>}</div><div className="chat-preview">{chat.draft ? `Draft: ${chat.draft.slice(0, 28)}` : chat.lastMessage || "No messages"}</div></div><div className="chat-meta"><span className="chat-time">{chat.lastAt ? new Date(chat.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>{chat.unread > 0 && <span className="unread">{chat.unread}</span>}</div></button>;
}
