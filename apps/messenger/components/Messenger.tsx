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
  bytesToBase64,
  base64ToBytes,
} from "../lib/file-transfer";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type SignalRow = { id: string; from_user: string; to_user: string; kind: "offer" | "answer" | "candidate" | "hangup" | "ecdh_announce"; payload: any };
type Lang = "uz" | "en" | "ru";
type ContextState = { message: LocalMessage; x: number; y: number } | null;

const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const T = {
  uz: {
    search: "Chat, odam yoki fayl qidirish",
    chats: "Chatlar",
    pinned: "Mahkamlangan",
    online: "Online",
    offline: "Offline",
    select: "Chatni tanlang",
    selectSub: "Chapdan chat tanlang yoki online foydalanuvchiga yozing. Barcha xabarlar P2P shifrlangan va faqat sizning qurilmangizda saqlanadi.",
    connected: "P2P ulandi",
    connecting: "P2P ulanmoqda",
    ready: "Tayyor",
    offlinePeer: "Offline — xabar lokal navbatda",
    call: "Qo'ng'iroq",
    videoCall: "Video",
    hangup: "Tugatish",
    message: "Xabar yozing...",
    send: "Yuborish",
    file: "Fayl yuborish",
    files: "Fayllar",
    reaction: "Reaksiya",
    reply: "Javob",
    edit: "Tahrir",
    copy: "Nusxa",
    del: "O'chirish",
    download: "Yuklab olish",
    voiceTitle: "Ovozli qo'ng'iroq",
    videoTitle: "Video qo'ng'iroq",
    voiceSub: "UBridge E2E shifrlangan P2P ovoz",
    videoSub: "E2E shifrlangan video aloqa",
    p2p: "P2P • E2E • Local",
    localFirst: "Faqat sizda",
    mic: "Mikrofon",
    micMuted: "Ovoz o'chiq",
    speaker: "Karnay",
    camera: "Kamera",
    cameraOff: "Kamera o'chiq",
    incomingCall: "Kiruvchi qo'ng'iroq",
    incomingVideo: "Video qo'ng'iroq",
    callEnded: "Qo'ng'iroq tugadi",
    callDuration: "Davomiyligi",
    fileOffer: "Fayl yuborilmoqda",
    fileReceiving: "Fayl qabul qilinmoqda",
    fileCompleted: "Fayl tayyor",
    encrypting: "Shifrlanmoqda...",
    ecdhActive: "ECDH E2E faol",
    installApp: "Ilovani o'rnatish",
  },
  en: {
    search: "Search chats, people or files",
    chats: "Chats",
    pinned: "Pinned",
    online: "Online",
    offline: "Offline",
    select: "Select a chat",
    selectSub: "Choose a chat from left or message someone online. All messages are P2P encrypted and stored only on your device.",
    connected: "P2P Connected",
    connecting: "P2P Connecting",
    ready: "Ready",
    offlinePeer: "Offline — queued locally",
    call: "Call",
    videoCall: "Video",
    hangup: "End",
    message: "Write a message...",
    send: "Send",
    file: "Send file",
    files: "Files",
    reaction: "Reaction",
    reply: "Reply",
    edit: "Edit",
    copy: "Copy",
    del: "Delete",
    download: "Download",
    voiceTitle: "Voice Call",
    videoTitle: "Video Call",
    voiceSub: "UBridge E2E encrypted P2P voice",
    videoSub: "E2E encrypted video",
    p2p: "P2P • E2E • Local",
    localFirst: "Local only",
    mic: "Mic",
    micMuted: "Muted",
    speaker: "Speaker",
    camera: "Camera",
    cameraOff: "Camera off",
    incomingCall: "Incoming call",
    incomingVideo: "Video call",
    callEnded: "Call ended",
    callDuration: "Duration",
    fileOffer: "Sending file",
    fileReceiving: "Receiving file",
    fileCompleted: "File ready",
    encrypting: "Encrypting...",
    ecdhActive: "ECDH E2E active",
    installApp: "Install app",
  },
  ru: {
    search: "Поиск чатов, людей или файлов",
    chats: "Чаты",
    pinned: "Закреплённые",
    online: "Онлайн",
    offline: "Офлайн",
    select: "Выберите чат",
    selectSub: "Выберите чат слева или напишите онлайн пользователю. Все сообщения P2P зашифрованы и хранятся только у вас.",
    connected: "P2P Подключено",
    connecting: "P2P Соединение",
    ready: "Готово",
    offlinePeer: "Офлайн — в очереди",
    call: "Звонок",
    videoCall: "Видео",
    hangup: "Завершить",
    message: "Напишите сообщение...",
    send: "Отправить",
    file: "Отправить файл",
    files: "Файлы",
    reaction: "Реакция",
    reply: "Ответить",
    edit: "Изменить",
    copy: "Копировать",
    del: "Удалить",
    download: "Скачать",
    voiceTitle: "Голосовой звонок",
    videoTitle: "Видеозвонок",
    voiceSub: "UBridge E2E P2P голос",
    videoSub: "E2E шифрованное видео",
    p2p: "P2P • E2E • Локально",
    localFirst: "Только локально",
    mic: "Микрофон",
    micMuted: "Мут",
    speaker: "Динамик",
    camera: "Камера",
    cameraOff: "Камера выкл",
    incomingCall: "Входящий звонок",
    incomingVideo: "Видеозвонок",
    callEnded: "Звонок завершен",
    callDuration: "Длительность",
    fileOffer: "Отправка файла",
    fileReceiving: "Прием файла",
    fileCompleted: "Файл готов",
    encrypting: "Шифрование...",
    ecdhActive: "ECDH E2E активен",
    installApp: "Установить",
  },
} satisfies Record<Lang, Record<string, string>>;

// Chat helpers
function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string } }) {
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
  const [pushState, setPushState] = useState<"checking" | "granted" | "default" | "denied" | "unsupported">("checking");
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const messagesBox = useRef<HTMLDivElement | null>(null);
  const longPress = useRef<number | null>(null);

  const messagesCacheRef = useRef<Map<string, LocalMessage[]>>(new Map());
  const draftsRef = useRef<Map<string, string>>(new Map());
  const scrollPosRef = useRef<Map<string, number>>(new Map());
  const prevChatIdRef = useRef<string>("");

  const fileSendersRef = useRef<Map<string, FileSender>>(new Map());
  const fileReceiversRef = useRef<Map<string, FileReceiver>>(new Map());
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  const peer = store.peer;
  const peerRef = useRef<UserRow | null>(null);
  const chatKey = peer ? chatIdFor(peer.user_id) : "";

  // Keep refs in sync
  useEffect(() => { peerRef.current = peer; }, [peer]);

  // Theme & Lang init - DEFAULT LIGHT
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem("ubridge_theme") as "light" | "dark" | null;
    if (savedTheme) store.setTheme(savedTheme);
    else store.setTheme("light"); // DEFAULT LIGHT per request

    // Lang
    const savedLang = (localStorage.getItem("ubridge_lang") || navigator.language.slice(0, 2)) as Lang;
    if (["uz", "en", "ru"].includes(savedLang)) { setLangState(savedLang); store.setLang(savedLang); }

    // Identity keys - ECDH
    void getOrCreateIdentity(initialUser.id);

    // Push state
    if (!("Notification" in window)) setPushState("unsupported");
    else setPushState(Notification.permission as any);

    // PWA install prompt
    const onBeforeInstall = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // PWA install
  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  // Close context on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!context) return;
      const target = e.target as HTMLElement;
      if (!target.closest(".context-menu") && !target.closest(".message-bubble")) setContext(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContext(null); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown as any);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown as any);
      window.removeEventListener("keydown", onKey);
    };
  }, [context]);

  useEffect(() => { void searchLocal(query).then(setSearchResults); }, [query]);

  // Scroll preservation + auto-scroll
  useEffect(() => {
    const box = messagesBox.current;
    if (!box) return;
    if (prevChatIdRef.current !== chatKey) {
      const saved = scrollPosRef.current.get(chatKey);
      requestAnimationFrame(() => {
        if (!box) return;
        box.scrollTop = saved ?? box.scrollHeight;
      });
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

  // Call duration timer
  useEffect(() => {
    if (store.call.voice === "live") {
      callTimerRef.current = setInterval(() => {
        store.setCall({ durationSec: store.call.durationSec + 1 });
      }, 1000) as any;
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (store.call.voice === "idle") store.setCall({ durationSec: 0 });
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [store.call.voice]);

  // Bootstrap once
  useEffect(() => {
    let cancelled = false;
    async function bootstrapOnce() {
      store.setInitialUser(initialUser);
      await upsertMe("online");
      await loadUsers();
      await refreshChats();
    }
    void bootstrapOnce();

    const presenceBeat = setInterval(() => { void upsertMe(store.connection === "connected" ? "online" : "online"); }, 15000);
    const usersPoll = setInterval(() => { void loadUsers(); }, 8000);
    const cleanupBeat = setInterval(() => { void cleanup(); }, 60000);

    const channel = supabase.channel("ubridge-presence-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();

    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);

    // Service worker messages
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "UBRIDGE_NOTIFICATION_CLICK") {
        const peerId = e.data.data?.peerId;
        if (peerId) {
          const u = store.users.find(x => x.user_id === peerId);
          if (u) void openPeer(u);
        }
      }
      if (e.data?.type === "UBRIDGE_SYNC_OUTBOX" && peerRef.current) {
        void drainLocalOutbox(peerRef.current.user_id);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      cancelled = true;
      clearInterval(presenceBeat);
      clearInterval(usersPoll);
      clearInterval(cleanupBeat);
      void supabase.removeChannel(channel);
      window.removeEventListener("beforeunload", onUnload);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  // Signals polling
  useEffect(() => {
    let stopped = false;
    async function loop() {
      while (!stopped) {
        try { await pollSignals(); } catch {}
        await new Promise(r => setTimeout(r, 1700));
      }
    }
    void loop();
    return () => { stopped = true; };
  }, []);

  // Push permission once
  useEffect(() => { void ensurePushPermission(); }, []);

  // Media stream to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
  }, [store.call.videoEnabled, localStream.current]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream.current) {
      remoteVideoRef.current.srcObject = remoteStream.current;
    }
    if (remoteAudioRef.current && remoteStream.current) {
      remoteAudioRef.current.srcObject = remoteStream.current;
      void remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream.current]);

  // Mic mute handling
  useEffect(() => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(t => { t.enabled = !store.call.micMuted; });
    }
  }, [store.call.micMuted]);

  // Video toggle handling
  useEffect(() => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach(t => { t.enabled = store.call.videoEnabled; });
    }
  }, [store.call.videoEnabled]);

  // Speaker mute
  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.muted = store.call.speakerMuted;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = store.call.speakerMuted;
  }, [store.call.speakerMuted]);

  function vapidKey() { return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""; }
  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function ensurePushPermission() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("unsupported"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (Notification.permission === "default") {
        const p = await Notification.requestPermission();
        setPushState(p as any);
      } else setPushState(Notification.permission as any);
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

  function openContext(message: LocalMessage, x: number, y: number) {
    setContext({ message, x: Math.min(x, window.innerWidth - 210), y: Math.min(y, window.innerHeight - 280) });
  }
  function startLongPress(message: LocalMessage, e: React.PointerEvent) {
    if (longPress.current) window.clearTimeout(longPress.current);
    const x = e.clientX, y = e.clientY;
    longPress.current = window.setTimeout(() => openContext(message, x, y), 520) as any;
  }
  function cancelLongPress() { if (longPress.current) window.clearTimeout(longPress.current); longPress.current = null; }

  async function cleanup() { try { await supabase.rpc("ubridge_cleanup"); } catch {} }
  async function upsertMe(status: string) { try { await supabase.rpc("ubridge_upsert_me", { p_name: initialUser.name, p_relay: "webrtc-p2p-v3-ecdh", p_status: status }); } catch {} }
  async function loadUsers() {
    try {
      const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false });
      if (data) store.setUsers(data as UserRow[]);
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
      await ensureChat({
        id, peerId: u.user_id, title: u.name, pinned: false, unread: 0,
        lastMessage: "", lastAt: Date.now(), typing: false,
        draft: draftsRef.current.get(id),
      });
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
    void connectP2P(u);
    // reset typing
    const isTyping = store.typingPeers[u.user_id];
    // handled via zustand
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
    store.setConnection("idle");
  }

  async function storeMessage(m: LocalMessage) {
    await saveMessage(m);
    const cache = messagesCacheRef.current.get(m.chatId) || [];
    const idx = cache.findIndex(x => x.id === m.id);
    let nextCache: LocalMessage[];
    if (idx >= 0) { nextCache = [...cache]; nextCache[idx] = m; } else { nextCache = [...cache, m].sort((a,b)=>a.at-b.at).slice(-400); }
    messagesCacheRef.current.set(m.chatId, nextCache);

    const currentPeer = peerRef.current;
    const currentChatId = currentPeer ? chatIdFor(currentPeer.user_id) : "";
    if (m.chatId === currentChatId) store.setMessagesForChat(m.chatId, nextCache);

    const chat = await getChat(m.chatId);
    const peerIdForChat = m.chatId.replace("direct:", "");
    const title = chat?.title || (currentPeer?.user_id === peerIdForChat ? currentPeer.name : store.users.find(u=>u.user_id===peerIdForChat)?.name || "Chat");
    const isActive = currentChatId === m.chatId;
    const prevUnread = chat?.unread || 0;
    const newUnread = m.from === "peer" && !isActive ? prevUnread+1 : isActive ? 0 : prevUnread;
    const chatRow: LocalChat = {
      id: m.chatId, peerId: peerIdForChat, title, pinned: chat?.pinned || false,
      unread: newUnread, lastMessage: m.deletedAt ? "Deleted" : m.text, lastAt: m.at, typing: chat?.typing || false, draft: chat?.draft, scrollTop: chat?.scrollTop,
    };
    await upsertChat(chatRow);
    store.upsertChatInState(chatRow);
  }

  async function pollSignals() {
    try {
      const { data } = await supabase.rpc("ubridge_poll_signals");
      if (!Array.isArray(data)) return;
      for (const row of data as SignalRow[]) {
        if (row.from_user === initialUser.id) continue;
        await handleSignal(row);
      }
    } catch {}
  }

  function makePc(target: UserRow) {
    if (pc.current) try { pc.current.close(); } catch {}
    const next = new RTCPeerConnection({ iceServers: ICE });
    pc.current = next;

    next.onicecandidate = (e) => { if (e.candidate) void signal(target.user_id, "candidate", e.candidate.toJSON()); };

    next.onconnectionstatechange = () => {
      const state = next.connectionState;
      if (state === "connected") {
        store.setConnection("connected");
        if (localStream.current) store.setCall({ voice: "live" });
        void drainLocalOutbox(target.user_id);
      } else if (state === "connecting") store.setConnection("connecting");
      else if (state === "failed" || state === "disconnected" || state === "closed") {
        store.setConnection("idle");
        // keep stream but call idle if not live?
      }
    };

    next.ondatachannel = (ev) => attachDc(ev.channel, target);
    next.ontrack = (ev) => {
      // Remote stream handling for audio/video
      if (!remoteStream.current) remoteStream.current = new MediaStream();
      ev.streams[0].getTracks().forEach(tr => remoteStream.current!.addTrack(tr));
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = remoteStream.current; void remoteAudioRef.current.play().catch(()=>{}); }
      if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = remoteStream.current; }
      store.setCall({ voice: "live" });
    };
    return next;
  }

  function attachDc(channel: RTCDataChannel, targetOverride?: UserRow) {
    const target = targetOverride || peerRef.current;
    dc.current = channel;

    channel.onopen = () => {
      store.setConnection("connected");
      if (target) {
        void storeMessage(systemMsg(chatIdFor(target.user_id), t.connected + " • " + t.ecdhActive));
        void drainLocalOutbox(target.user_id);
      }
      // Announce ECDH public key for E2E
      void (async () => {
        const pub = await exportPublicJwk(initialUser.id);
        if (channel.readyState === "open" && target) {
          const box = await encryptForPeer(initialUser.id, target.user_id, { type: "ecdh_announce", publicJwk: pub });
          channel.send(JSON.stringify({ box }));
        }
      })();
    };

    channel.onclose = () => store.setConnection("idle");

    channel.onmessage = async (ev) => {
      try {
        const raw = JSON.parse(String(ev.data));
        // Typing
        if (raw.typing !== undefined && target) {
          store.setTyping(target.user_id, Boolean(raw.typing));
          return;
        }
        // Decrypt
        if (!target) return;
        const body = raw.box ? await decryptForPeer(initialUser.id, target.user_id, raw.box) : raw;
        if (!body) return;

        // ECDH announce
        if (body.type === "ecdh_announce" && body.publicJwk) {
          await importPeerPublic(target.user_id, body.publicJwk);
          return;
        }

        // File protocol
        if (body.type === "file_offer") {
          const offer = body as FileOffer;
          const receiver = new FileReceiver(offer, (transfer) => {
            store.setFileTransfer(transfer);
          });
          fileReceiversRef.current.set(offer.fileId, receiver);
          // Also create message for file offer
          const msg: LocalMessage = {
            id: messageId(),
            chatId: chatIdFor(target.user_id),
            from: "peer",
            text: `${t.fileOffer}: ${offer.name} (${(offer.size/1024).toFixed(1)} KB)`,
            at: Date.now(),
            reactions: {},
            delivery: "delivered",
            encrypted: true,
            attachment: { name: offer.name, mime: offer.mime, size: offer.size },
          };
          await storeMessage(msg);
          return;
        }

        if (body.type === "file_chunk") {
          const chunk = body as FileChunk;
          const receiver = fileReceiversRef.current.get(chunk.fileId);
          if (receiver) {
            receiver.receiveChunk(chunk);
            // Ack
            const ack = { type: "file_ack", fileId: chunk.fileId, index: chunk.index };
            const encAck = await encryptForPeer(initialUser.id, target.user_id, ack);
            if (dc.current?.readyState === "open") dc.current.send(JSON.stringify({ box: encAck }));
          }
          return;
        }

        if (body.type === "file_done") {
          const receiver = fileReceiversRef.current.get(body.fileId);
          if (receiver) {
            const completed = receiver.complete();
            // Message with download
            const msg: LocalMessage = {
              id: messageId(),
              chatId: chatIdFor(target.user_id),
              from: "peer",
              text: `${t.fileCompleted}: ${completed.name}`,
              at: Date.now(),
              reactions: {},
              delivery: "delivered",
              encrypted: true,
              attachment: { name: completed.name, mime: completed.mime, size: completed.size },
            };
            // Store blobUrl in fileTransfers map, but also we can embed? We'll keep transfer map
            await storeMessage(msg);
          }
          return;
        }

        if (body.type === "file_ack") {
          // sender ack, could be used for flow control - ignore for now
          return;
        }

        // Regular text/file message
        const incoming: LocalMessage = {
          id: messageId(),
          chatId: chatIdFor(target.user_id),
          from: "peer",
          text: body.text || (body.fileName ? `File: ${body.fileName}` : JSON.stringify(body).slice(0,200)),
          at: Date.now(),
          reactions: {},
          delivery: "delivered",
          encrypted: true,
          signature: body.signature,
          attachment: body.fileName ? { name: body.fileName, mime: body.mime, size: body.size } : undefined,
          replyTo: body.replyTo || null,
        };
        await storeMessage(incoming);
        if (peerRef.current?.user_id !== target.user_id && Notification.permission === "granted") {
          try { new Notification(target.name, { body: incoming.text.slice(0,120), icon: "/icons/icon-192.png" }); } catch {}
        }
      } catch (e) {
        console.warn("DataChannel message error", e);
      }
    };
  }

  async function connectP2P(target: UserRow, withMedia: { audio?: boolean; video?: boolean } = {}) {
    store.setConnection("connecting");
    const conn = makePc(target);

    if (withMedia.audio || withMedia.video) {
      await addMedia(conn, withMedia);
    }

    const channel = conn.createDataChannel("ubridge-v3", { ordered: true });
    attachDc(channel, target);

    const myPub = await exportPublicJwk(initialUser.id);
    const offer = await conn.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
    await conn.setLocalDescription(offer);
    // Include ECDH public in signal payload
    await signal(target.user_id, "offer", { sdp: offer.sdp, type: offer.type, ecdhPublic: myPub, callerName: initialUser.name, media: withMedia });
  }

  async function addMedia(conn: RTCPeerConnection, opts: { audio?: boolean; video?: boolean }) {
    try {
      if (localStream.current) {
        // Stop if adding different media?
        // For now reuse, but if video requested and not present, need getUserMedia again
        const hasVideo = localStream.current.getVideoTracks().length > 0;
        const hasAudio = localStream.current.getAudioTracks().length > 0;
        if ((opts.video && !hasVideo) || (opts.audio && !hasAudio) || !localStream.current) {
          localStream.current.getTracks().forEach(t=>t.stop());
          localStream.current = null;
        }
      }

      if (!localStream.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: opts.audio ?? true,
          video: opts.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
        });
        localStream.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }

      localStream.current.getTracks().forEach(track => {
        const sender = conn.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) sender.replaceTrack(track);
        else conn.addTrack(track, localStream.current!);
      });

      store.setCall({
        voice: "calling",
        videoEnabled: !!opts.video && localStream.current.getVideoTracks().some(t=>t.enabled),
        micMuted: false,
      });
    } catch (e) {
      console.error("getUserMedia failed", e);
      store.setCall({ voice: "idle" });
    }
  }

  async function handleSignal(row: SignalRow) {
    const target = store.users.find(u => u.user_id === row.from_user) || peerRef.current || { user_id: row.from_user, name: row.payload?.callerName || "Chat", online: true, status: null, relay: null, last_seen: null } as UserRow;

    // Import peer ECDH if present
    if (row.payload?.ecdhPublic) {
      await importPeerPublic(row.from_user, row.payload.ecdhPublic);
    }

    if (row.kind === "offer") {
      const media = row.payload?.media || {};
      const isVideo = !!media.video;
      const isCall = !!media.audio || isVideo;

      if (isCall) {
        // Incoming call
        store.setCall({
          voice: "calling",
          isIncoming: true,
          callerId: row.from_user,
          callerName: row.payload?.callerName || target.name,
          videoEnabled: isVideo,
        });
        // Store pending offer for answering
        (window as any).__pendingOffer = row;
        // Notification
        if (Notification.permission === "granted") {
          try { new Notification(isVideo ? t.incomingVideo : t.incomingCall, { body: `${target.name} is calling...`, icon: "/icons/icon-192.png", requireInteraction: true } as any); } catch {}
        } else {
          // Save pending signal for UI
          store.setCall({ callerId: row.from_user, callerName: target.name });
        }
        return;
      }

      // Data channel offer (no media) - auto-accept for P2P messaging
      const conn = makePc(target);
      try {
        await conn.setRemoteDescription(new RTCSessionDescription({ type: row.payload.type || "offer", sdp: row.payload.sdp }));
        const ans = await conn.createAnswer();
        await conn.setLocalDescription(ans);
        const myPub = await exportPublicJwk(initialUser.id);
        await signal(row.from_user, "answer", { sdp: ans.sdp, type: ans.type, ecdhPublic: myPub });
      } catch (e) { console.warn("Offer handling failed", e); }
    } else if (row.kind === "answer" && pc.current) {
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription({ type: row.payload.type, sdp: row.payload.sdp }));
      } catch {}
    } else if (row.kind === "candidate" && pc.current) {
      try { await pc.current.addIceCandidate(new RTCIceCandidate(row.payload)); } catch {}
    } else if (row.kind === "hangup") {
      endCall(false);
    }
  }

  async function answerCall() {
    const row = (window as any).__pendingOffer as SignalRow | undefined;
    if (!row) {
      // Try from store
      const callerId = store.call.callerId;
      if (!callerId) return;
      // Create dummy row?
      return;
    }
    const target = store.users.find(u => u.user_id === row.from_user) || { user_id: row.from_user, name: row.payload?.callerName || "Caller", online: true, status: null, relay: null, last_seen: null } as UserRow;
    store.setPeer(target);
    peerRef.current = target;

    store.setCall({ isIncoming: false, voice: "calling" });

    const conn = makePc(target);
    await addMedia(conn, row.payload?.media || { audio: true, video: !!row.payload?.media?.video });

    try {
      await conn.setRemoteDescription(new RTCSessionDescription({ type: row.payload.type, sdp: row.payload.sdp }));
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      const myPub = await exportPublicJwk(initialUser.id);
      await signal(row.from_user, "answer", { sdp: answer.sdp, type: answer.type, ecdhPublic: myPub });
    } catch (e) { console.warn("answerCall failed", e); }

    (window as any).__pendingOffer = null;
  }

  async function answerCallFromNotification() {
    // Called from ?answerCall=1 url param
    const params = new URLSearchParams(window.location.search);
    if (params.get("answerCall") === "1") {
      const row = (window as any).__pendingOffer;
      if (row) void answerCall();
    }
  }

  useEffect(() => { void answerCallFromNotification(); }, []);

  function rejectCall() {
    const pending = (window as any).__pendingOffer as SignalRow | undefined;
    if (pending) void signal(pending.from_user, "hangup", {});
    else if (store.call.callerId) void signal(store.call.callerId, "hangup", {});
    endCall();
  }

  async function signal(to: string, kind: SignalRow["kind"], payload: any) {
    try { await supabase.rpc("ubridge_signal", { p_to: to, p_kind: kind, p_payload: payload }); } catch {}
  }

  function systemMsg(chatId: string, text: string): LocalMessage {
    return { id: messageId(), chatId, from: "system", text, at: Date.now(), reactions: {}, delivery: "read", encrypted: false };
  }

  async function drainLocalOutbox(peerId: string) {
    const items = await listOutboxForPeer(peerId);
    if (!items.length || dc.current?.readyState !== "open") return;
    for (const item of items) {
      try {
        dc.current.send(JSON.stringify({ box: item.box }));
        await deleteOutbox(item.id);
        const cache = messagesCacheRef.current.get(item.chatId) || [];
        const found = cache.find(m=>m.id===item.id);
        if (found) { found.delivery = "sent"; await saveMessage(found); if (peerRef.current && chatIdFor(peerRef.current.user_id)===item.chatId) store.setMessagesForChat(item.chatId, [...cache]); }
      } catch {}
    }
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
      const next = cache.map(m=>m.id===edited.id?edited:m);
      messagesCacheRef.current.set(edited.chatId, next);
      store.setMessagesForChat(edited.chatId, next);
      setEditing(null);
      return;
    }

    const payload = { type: "text", text: value, replyTo: replyTo?.id || null, signature: await signPayloadECDSA(initialUser.id, { text: value }), from: initialUser.id };
    const box = await encryptForPeer(initialUser.id, peerNow.user_id, payload);
    const chatId = chatIdFor(peerNow.user_id);
    const local: LocalMessage = { id: messageId(), chatId, from: "me", text: value, at: Date.now(), replyTo: replyTo?.id||null, reactions: {}, delivery: "sending", encrypted: true, signature: payload.signature };
    await storeMessage(local);
    setReplyTo(null);

    if (dc.current?.readyState === "open") {
      try { dc.current.send(JSON.stringify({ box })); local.delivery="sent"; await storeMessage(local); }
      catch { local.delivery="queued"; await storeMessage(local); await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts:0 }); }
    } else {
      local.delivery="queued"; await storeMessage(local);
      await enqueueOutbox({ id: local.id, chatId, peerId: peerNow.user_id, box, plainText: value, at: Date.now(), attempts:0 });
      if (store.connection==="idle") void connectP2P(peerNow);
      void notifyPeer(peerNow.user_id, initialUser.name, "New P2P message", "message");
    }
  }

  async function sendFile(file: File) {
    if (!peerRef.current) return;
    const peerNow = peerRef.current;
    const chatId = chatIdFor(peerNow.user_id);

    // If not connected, queue? For file we require connection - try connect
    if (dc.current?.readyState !== "open") {
      void connectP2P(peerNow);
      // Show toast that connecting
    }

    const offer = createFileOffer(file);
    const transfer: FileTransfer = {
      fileId: offer.fileId, name: file.name, size: file.size, mime: file.type,
      chunkSize: offer.chunkSize, totalChunks: offer.totalChunks, transferred:0, receivedChunks:0,
      state: "sending", progress:0, direction:"send", file,
    };
    store.setFileTransfer(transfer);

    // Create message for file sending
    const msg: LocalMessage = {
      id: messageId(), chatId, from:"me", text:`${t.fileOffer}: ${file.name}`, at:Date.now(), reactions:{}, delivery:"sending", encrypted:true,
      attachment:{ name:file.name, mime:file.type, size:file.size }
    };
    await storeMessage(msg);

    // Create sender - will encrypt each chunk with ECDH key
    const sender = new FileSender(dc.current!, file, offer, (progress)=>{
      store.setFileTransfer({ ...transfer, progress, transferred: Math.round(file.size*progress/100), state: progress===100?"completed":"sending" });
    });
    fileSendersRef.current.set(offer.fileId, sender);

    const waitForDc = async () => {
      let tries = 0;
      while (dc.current?.readyState !== "open" && tries < 30) { await new Promise(r=>setTimeout(r, 500)); tries++; }
      return dc.current?.readyState === "open";
    };

    if (await waitForDc()) {
      try {
        await sender.send(async (data)=> await encryptForPeer(initialUser.id, peerNow.user_id, data));
        msg.delivery="sent"; await storeMessage(msg);
        store.setFileTransfer({ ...transfer, progress:100, state:"completed" });
      } catch (e: any) {
        msg.delivery="failed"; await storeMessage(msg);
        store.setFileTransfer({ ...transfer, state:"error", error:e.message });
      }
    } else {
      msg.delivery="failed"; await storeMessage(msg);
      store.setFileTransfer({ ...transfer, state:"error", error:"P2P not connected" });
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
    if (dc.current?.readyState==="open") try { dc.current.send(JSON.stringify({ typing: Boolean(v) })); } catch {}
  }

  function react(m: LocalMessage, emoji:string) { const next={...m, reactions:{...m.reactions, [emoji]:(m.reactions[emoji]||0)+1}}; void storeMessage(next); }
  function del(m: LocalMessage) { const next={...m, deletedAt:Date.now(), text:"Message deleted"}; void storeMessage(next); }
  function copy(m: LocalMessage) { void navigator.clipboard?.writeText(m.text); }
  function edit(m: LocalMessage) { setEditing(m); setText(m.text); }
  function forward(m: LocalMessage) { setText(`Forwarded: ${m.text}`); }

  async function startVoiceCall(video=false) {
    if (!peerRef.current) return;
    const p = peerRef.current;
    store.setCall({ voice:"calling", videoEnabled: video, isIncoming:false, callerId: p.user_id, callerName: p.name });
    await notifyPeer(p.user_id, `${initialUser.name} ${video? "video calling" : "is calling"}`, video?"Incoming video call":"Incoming voice call", video?"video":"call");
    await connectP2P(p, { audio:true, video });
  }

  function endCall(sendSignal=true) {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    localStream.current?.getTracks().forEach(t=>t.stop());
    localStream.current=null;
    remoteStream.current=null;
    if (localVideoRef.current) localVideoRef.current.srcObject=null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject=null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject=null;
    store.resetCall();
    if (sendSignal && peerRef.current) void signal(peerRef.current.user_id, "hangup", {});
    if (pc.current) try { pc.current.close(); } catch {}
    pc.current=null; dc.current=null;
    store.setConnection("idle");
  }

  // Derived state from Zustand + cache for current chat
  const messagesForCurrent = chatKey ? (store.messagesMap.get(chatKey) || []) : [];
  const recent = store.chats.slice(0,120);
  const pinned = store.chats.filter(c=>c.pinned);
  const online = store.users.filter(u=>u.online);
  const offline = store.users.filter(u=>!u.online);
  const shellClass = `ub-shell ${peer ? "chat-open" : ""} ${store.isInfoOpen ? "info-open" : ""}`;
  const callDurationFormatted = `${Math.floor(store.call.durationSec/60).toString().padStart(2,"0")}:${(store.call.durationSec%60).toString().padStart(2,"0")}`;

  return (
    <main className="ub-app">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {pushState!=="granted" && pushState!=="unsupported" && (
        <div className="push-permission"><div><b>🔔 Notifications</b><span>P2P calls & messages even in background</span></div><button onClick={()=>void ensurePushPermission()}>Enable</button></div>
      )}
      {installPrompt && (
        <div className="push-permission" style={{ top: "auto", bottom: "72px" }}><div><b>📲 {t.installApp}</b><span>Add UBridge to home screen for best P2P experience</span></div><button onClick={handleInstall}>Install</button></div>
      )}

      <div className={shellClass}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-mark">
                <img src="/ubridge-logo.svg" alt="UBridge" />
                <div className="brand-copy"><strong>UBridge</strong><span>P2P Messenger</span></div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="theme-toggle" onClick={()=>store.toggleTheme()} aria-label="Toggle theme"><UIcon name={store.theme==="dark"?"sun":"moon"} /></button>
                <button className="icon-button" onClick={()=>store.setInfoOpen(!store.isInfoOpen)}><UIcon name="info" /></button>
              </div>
            </div>
            <div className="search-box"><span className="search-icon"><UIcon name="search" /></span><input className="search-input" placeholder={t.search} value={query} onChange={(e)=>setQuery(e.target.value)} /></div>
            <div className="p2p-badge"><UIcon name="shield" size={12} /> {t.p2p} • {t.ecdhActive}</div>
          </div>

          <div className="sidebar-scroll">
            {query && <Section title="Search">{searchResults.map(r=><button className="chat-item" key={r.messageId}><div className="avatar"><UIcon name="search" /></div><div className="chat-main"><div className="chat-name">{r.text}</div><div className="chat-preview">{formatTime(r.at)}</div></div></button>)}</Section>}
            {pinned.length>0 && <Section title={t.pinned}>{pinned.map(c=><ChatButton key={c.id} chat={c} active={chatKey===c.id} onClick={()=>{ const u=store.users.find(x=>x.user_id===c.peerId) || { user_id:c.peerId, name:c.title, online:false, status:null, relay:null, last_seen:null }; void openPeer(u as UserRow); }} />)}</Section>}
            <Section title={t.chats}>{recent.map(c=><ChatButton key={c.id} chat={c} active={chatKey===c.id} onClick={()=>{ const u=store.users.find(x=>x.user_id===c.peerId) || { user_id:c.peerId, name:c.title, online:false, status:null, relay:null, last_seen:null }; void openPeer(u as UserRow); }} />)}</Section>
          </div>

          <div className="sidebar-bottom">
            <Section title={`${t.online} • ${online.length}`}>{online.map(u=><UserButton key={u.user_id} u={u} active={peer?.user_id===u.user_id} onClick={()=>void openPeer(u)} />)}</Section>
            <Section title={`${t.offline} • ${offline.length}`}>{offline.map(u=><UserButton key={u.user_id} u={u} active={peer?.user_id===u.user_id} onClick={()=>void openPeer(u)} />)}</Section>
          </div>
        </aside>

        <section className="chat-panel">
          {!peer ? (
            <div className="empty-state"><div className="empty-card"><img src="/ubridge-logo.svg" alt="" /><h1>{t.select}</h1><p>{t.selectSub}</p><div className="empty-hint"><UIcon name="shield" /> E2E • ECDH P-256 • AES-GCM • P2P WebRTC • Local-only</div></div></div>
          ) : (
            <>
              <header className="chat-header">
                <button className="icon-button mobile-back" onClick={handleBackToHome} aria-label="Back"><UIcon name="arrow-left" /></button>
                <div className="peer-info">
                  <div className="avatar large">{peer.name[0]?.toUpperCase()}<span className="online-dot" /></div>
                  <div className="peer-copy"><strong>{peer.name}</strong><div className={`peer-status ${store.connection}`}>{store.typingPeers[peer.user_id] ? "typing…" : store.connection==="connected"? t.connected : store.connection==="connecting"? t.connecting : peer.online? t.ready : t.offlinePeer}</div></div>
                </div>
                <div className="header-actions">
                  <button className="action-button" onClick={()=>void startVoiceCall(false)} title={t.call}><UIcon name="phone" /> <span className="hide-mobile">{t.call}</span></button>
                  <button className="action-button primary" onClick={()=>void startVoiceCall(true)} title={t.videoCall}><UIcon name="video" /> <span className="hide-mobile">{t.videoCall}</span></button>
                  <button className="icon-button" onClick={()=>store.setInfoOpen(!store.isInfoOpen)}><UIcon name="more" /></button>
                </div>
              </header>

              <div className="messages" ref={messagesBox}>
                {messagesForCurrent.slice(-220).map((m)=>(
                  <div key={m.id} className={`message-row ${m.from}`}>
                    <div className={`message-bubble ${m.from==="me"?"me":"peer"} ${m.deletedAt?"deleted":""}`} onPointerDown={(e)=>startLongPress(m,e)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onContextMenu={(e)=>{ e.preventDefault(); openContext(m,e.clientX,e.clientY); }}>
                      {m.replyTo && <div className="reply-mark">{t.reply}</div>}
                      <span>{m.deletedAt?"Message deleted":m.text}</span>
                      {m.attachment && (
                        <div className="attachment">
                          <div className="file-icon">📄</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, overflow:"hidden", textOverflow:"ellipsis" }}>{m.attachment.name}</div>
                            <div style={{ fontSize:11, color:"var(--muted)" }}>{m.attachment.mime || "file"} • {m.attachment.size ? (m.attachment.size/1024).toFixed(1)+" KB" : ""}</div>
                          </div>
                          {(() => {
                            // Check if this is a file transfer completed with blobUrl
                            const ft = Array.from(store.fileTransfers.values()).find(f=>f.name===m.attachment!.name);
                            if (ft?.blobUrl) return <a href={ft.blobUrl} download={ft.name} className="action-button" style={{ height:32 }}><UIcon name="download" /> {t.download}</a>;
                            return null;
                          })()}
                        </div>
                      )}
                      {/* File transfer progress if sending this file */}
                      {(() => {
                        const ft = Array.from(store.fileTransfers.values()).find(f=>m.text.includes(f.name));
                        if (ft && ft.state!=="completed") return (
                          <div className="file-progress">
                            <div className="file-progress-bar"><div className="file-progress-fill" style={{ width:`${ft.progress}%` }} /></div>
                            <div className="file-progress-text">{ft.state==="sending"?`${t.fileOffer} ${ft.progress}%`:`${t.fileReceiving} ${ft.progress}%`}</div>
                          </div>
                        );
                        return null;
                      })()}
                      <div className="message-meta"><span>{formatTime(m.at)}</span><span>{m.delivery}</span></div>
                      {Object.keys(m.reactions).length>0 && <div className="reactions">{Object.entries(m.reactions).map(([e,n])=><span key={e}>{e} {n}</span>)}</div>}
                    </div>
                  </div>
                ))}
                <div ref={messagesEnd} />
              </div>

              {replyTo && <div className="reply-bar">{t.reply}: {replyTo.text}<button onClick={()=>setReplyTo(null)}>×</button></div>}
              {editing && <div className="reply-bar">{t.edit}<button onClick={()=>{ setEditing(null); setText(""); }}>×</button></div>}

              {/* File transfers active bar */}
              {Array.from(store.fileTransfers.values()).filter(f=>f.state!=="completed" && f.direction==="send").slice(0,1).map(ft=>(
                <div key={ft.fileId} className="reply-bar"><UIcon name="file" /> {ft.name} — {ft.progress}%<div className="file-progress-bar" style={{ width:100, marginLeft:12 }}><div className="file-progress-fill" style={{ width:`${ft.progress}%` }} /></div><button onClick={()=>{ fileSendersRef.current.get(ft.fileId)?.abort(); store.removeFileTransfer(ft.fileId); }}>×</button></div>
              ))}

              <footer className="composer">
                <button className="round-button" title={t.reaction}>😊</button>
                <label className="round-button" title={t.file}>+<input type="file" hidden onChange={(e)=>{ const f=e.target.files?.[0]; if(f) void sendFile(f); }} /></label>
                <textarea className="composer-textarea" value={text} onChange={(e)=>setTypingSignal(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); void send(); }}} placeholder={t.message} />
                <button className="send-button" onClick={()=>void send()} aria-label="Send"><UIcon name="send" /></button>
              </footer>
            </>
          )}
        </section>

        <aside className="info-panel">
          <div className="info-card">
            <div className="avatar xl">{peer?.name[0]?.toUpperCase() || "U"}</div>
            <h3>{peer?.name || "UBridge"}</h3>
            <p>{peer ? "E2E • ECDH P-256 • Local-first P2P" : "Secure P2P ecosystem"}</p>
          </div>
          <div className="info-list">
            <div className="info-row"><UIcon name="shield" /> {t.ecdhActive} (P-256)</div>
            <div className="info-row"><UIcon name="lock" /> AES-GCM 256-bit per peer</div>
            <div className="info-row"><UIcon name="database" /> Local-first • No server</div>
            <div className="info-row"><UIcon name="link" /> WebRTC P2P DataChannel</div>
            <div className="info-row"><UIcon name="file" /> Chunked file transfer 16KB</div>
            <div className="info-row"><UIcon name="video" /> Voice & Video calls</div>
            {installPrompt && <button className="action-button primary" style={{ width:"100%", justifyContent:"center" }} onClick={handleInstall}><UIcon name="download" /> {t.installApp}</button>}
          </div>
          {peer && (
            <div className="info-list">
              <div className="info-row"><span>Connection:</span> <b>{store.connection}</b></div>
              <div className="info-row"><span>ECDH:</span> <b>{hasPeerPublicSync(peer.user_id) ? "✓ Shared" : "⏳ Exchanging"}</b></div>
              <div className="info-row"><span>Peer ID:</span> <span style={{ fontSize:10 }}>{peer.user_id.slice(0,12)}...</span></div>
              <div className="info-row"><span>Chat ID:</span> <span style={{ fontSize:10 }}>{chatKey.slice(0,20)}...</span></div>
            </div>
          )}
          <div className="info-list">
            <div className="info-row"><span>Theme: {store.theme}</span><button className="icon-button" style={{ marginLeft:"auto" }} onClick={()=>store.toggleTheme()}><UIcon name={store.theme==="dark"?"sun":"moon"} /></button></div>
          </div>
        </aside>

        {/* Voice / Video Call Modal - Full featured like phone call */}
        {(store.call.voice !== "idle") && (
          <div className="call-modal">
            <div className="video-grid" style={{ display: store.call.videoEnabled ? "grid" : "none" }}>
              <div className="video-tile">
                <video ref={remoteVideoRef} autoPlay playsInline />
                <div className="label">{peer?.name || store.call.callerName || "Peer"} {store.call.speakerMuted && "🔇"}</div>
              </div>
              <div className="video-tile local">
                <video ref={localVideoRef} autoPlay playsInline muted />
                <div className="label">You {store.call.micMuted && "🔇"}</div>
              </div>
            </div>

            <div className="call-card" style={{ marginTop: store.call.videoEnabled ? 12 : 0 }}>
              {!store.call.videoEnabled && (
                <div className="call-pulse"><div className="avatar huge">{(store.call.callerName || peer?.name || "U")[0]?.toUpperCase()}</div></div>
              )}
              <h2>{store.call.isIncoming ? (store.call.videoEnabled ? t.incomingVideo : t.incomingCall) : store.call.videoEnabled ? t.videoTitle : t.voiceTitle}</h2>
              <p>{store.call.isIncoming ? `${store.call.callerName || "Someone"} is calling...` : store.call.voice==="live" ? t.connected : t.voiceSub}</p>
              {store.call.voice==="live" && <div className="call-duration">{callDurationFormatted}</div>}

              <div className="call-controls">
                {store.call.isIncoming ? (
                  <>
                    <button className="call-btn hangup" onClick={rejectCall}><UIcon name="close" /></button>
                    <button className="call-btn active" style={{ width:72, height:72 }} onClick={()=>void answerCall()}><UIcon name="phone" /></button>
                  </>
                ) : (
                  <>
                    <button className={`call-btn ${store.call.micMuted ? "muted" : ""}`} onClick={()=>store.toggleMic()} title={store.call.micMuted? t.micMuted : t.mic}><UIcon name={store.call.micMuted ? "mic-off" : "mic"} /></button>
                    <button className={`call-btn ${!store.call.videoEnabled ? "muted" : ""}`} onClick={()=>store.toggleVideo()} title={store.call.videoEnabled? t.camera : t.cameraOff}><UIcon name={store.call.videoEnabled ? "video" : "video-off"} /></button>
                    <button className={`call-btn ${store.call.speakerMuted ? "muted" : ""}`} onClick={()=>store.toggleSpeaker()} title={t.speaker}><UIcon name={store.call.speakerMuted ? "volume-mute" : "volume"} /></button>
                    <button className="call-btn hangup" onClick={()=>endCall(true)}><UIcon name="close" /></button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {context && <div className="context-menu" style={{ left: context.x, top: context.y }}><button onClick={()=>{ setReplyTo(context.message); setContext(null); }}><UIcon name="message" />{t.reply}</button><button onClick={()=>{ forward(context.message); setContext(null); }}><UIcon name="share" />Forward</button><button onClick={()=>{ edit(context.message); setContext(null); }}><UIcon name="edit" />{t.edit}</button><button onClick={()=>{ copy(context.message); setContext(null); }}><UIcon name="copy" />{t.copy}</button><button onClick={()=>{ react(context.message,"👍"); setContext(null); }}>👍 {t.reaction}</button><button className="danger" onClick={()=>{ del(context.message); setContext(null); }}><UIcon name="trash" />{t.del}</button></div>}
      </div>

      <style>{`
        .hide-mobile { display: inline; }
        @media (max-width: 860px) { .hide-mobile { display: none; } }
      `}</style>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><div className="section-title">{title}</div><div className="section-list">{children}</div></section>;
}
function UserButton({ u, active, onClick }: { u: UserRow; active: boolean; onClick: () => void }) {
  return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{u.name[0]?.toUpperCase()}{u.online && <span className="online-dot" />}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{u.name}</span></div><div className="chat-preview">{u.status || "offline"}</div></div><div className="chat-meta"><span className="chat-time">{u.online ? "now" : ""}</span></div></button>;
}
function ChatButton({ chat, active, onClick }: { chat: LocalChat; active: boolean; onClick: () => void }) {
  return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{chat.title[0]?.toUpperCase()}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{chat.title}</span>{chat.draft && <span className="draft-mark">• draft</span>}</div><div className="chat-preview">{chat.draft ? `Draft: ${chat.draft.slice(0,28)}` : chat.lastMessage || "No messages"}</div></div><div className="chat-meta"><span className="chat-time">{chat.lastAt ? new Date(chat.lastAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit"}) : ""}</span>{chat.unread>0 && <span className="unread">{chat.unread}</span>}</div></button>;
}
