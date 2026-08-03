"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import UIcon from "./UIcon";
import { chatIdFor, listChats, listMessages, messageId, saveMessage, searchLocal, updateMessage, upsertChat, type LocalChat, type LocalMessage } from "../lib/local-db";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type SignalRow = { id: string; from_user: string; to_user: string; kind: "offer" | "answer" | "candidate" | "hangup"; payload: any };
type Lang = "uz" | "en" | "ru";
type ContextState = { message: LocalMessage; x: number; y: number } | null;

const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];
const enc = new TextEncoder();
const dec = new TextDecoder();
const T = {
  uz: { search: "Chat, odam yoki xabar qidirish", chats: "Chatlar", online: "Online odamlar", offline: "Offline", select: "Chatni tanlang", selectSub: "Chap tomondan suhbatni tanlang yoki online odamga yozishni boshlang.", connected: "Ulangan", connecting: "Ulanmoqda", ready: "Tayyor", call: "Qo'ng'iroq", hangup: "Tugatish", message: "Xabar yozing", send: "Yuborish", file: "Fayl", reaction: "Reaksiya", reply: "Javob", edit: "Tahrir", copy: "Nusxa", del: "O'chirish", voiceTitle: "Ovozli qo'ng'iroq", voiceSub: "UBridge WebRTC orqali shifrlangan audio kanal ochmoqda." },
  en: { search: "Search chats, people or messages", chats: "Chats", online: "Online people", offline: "Offline", select: "Select a chat", selectSub: "Choose a conversation from the left or start writing to someone online.", connected: "Connected", connecting: "Connecting", ready: "Ready", call: "Call", hangup: "Hang up", message: "Write a message", send: "Send", file: "File", reaction: "Reaction", reply: "Reply", edit: "Edit", copy: "Copy", del: "Delete", voiceTitle: "Voice call", voiceSub: "UBridge is opening an encrypted WebRTC audio channel." },
  ru: { search: "Поиск чатов, людей или сообщений", chats: "Чаты", online: "Онлайн", offline: "Офлайн", select: "Выберите чат", selectSub: "Выберите беседу слева или начните писать пользователю онлайн.", connected: "Подключено", connecting: "Подключение", ready: "Готово", call: "Звонок", hangup: "Завершить", message: "Напишите сообщение", send: "Отправить", file: "Файл", reaction: "Реакция", reply: "Ответить", edit: "Изменить", copy: "Копировать", del: "Удалить", voiceTitle: "Голосовой звонок", voiceSub: "UBridge открывает зашифрованный аудиоканал WebRTC." },
} satisfies Record<Lang, Record<string, string>>;

function b64(bytes: Uint8Array) { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); }
function ub64(v: string) { const s = atob(v); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
async function sha256(text: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
async function sharedKey(a: string, b: string) { const seed = [a, b].sort().join(":"); return crypto.subtle.importKey("raw", await sha256(seed), "AES-GCM", false, ["encrypt", "decrypt"]); }
async function encryptFor(a: string, b: string, value: any) { const key = await sharedKey(a, b); const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))); return { alg: "AES-GCM", iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) }; }
async function decryptFor(a: string, b: string, box: any) { const key = await sharedKey(a, b); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(box.iv) }, key, ub64(box.ciphertext)); return JSON.parse(dec.decode(plain)); }
async function deviceKeys(userId: string) { const k = `ubridge_keys_${userId}`; const saved = localStorage.getItem(k); if (saved) return crypto.subtle.importKey("jwk", JSON.parse(saved), { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]); const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); localStorage.setItem(k, JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey))); return pair.privateKey; }
async function signPayload(userId: string, value: any) { const key = await deviceKeys(userId); const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(JSON.stringify(value))); return b64(new Uint8Array(sig)); }

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [lang, setLang] = useState<Lang>("en");
  const tx = T[lang];
  const [name, setName] = useState(initialUser.name);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [peer, setPeer] = useState<UserRow | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ chatId: string; messageId: string; text: string; at: number }[]>([]);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [context, setContext] = useState<ContextState>(null);
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected">("idle");
  const [voice, setVoice] = useState<"idle" | "calling" | "live">("idle");
  const [typing, setTyping] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const chatKey = peer ? chatIdFor(peer.user_id) : "";

  useEffect(() => { const saved = (localStorage.getItem("uflow_lang") || localStorage.getItem("ubridge_lang") || navigator.language.slice(0,2)) as Lang; if (["uz","en","ru"].includes(saved)) setLang(saved); }, []);
  useEffect(() => { void bootstrap(); const beat = setInterval(() => { void upsertMe(connection === "connected" ? "online" : "online"); void drainQueue(); void pollSignals(); void cleanup(); }, 2500); const channel = supabase.channel("ubridge-live").on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers()).subscribe(); const onUnload = () => { void supabase.rpc("ubridge_offline"); }; window.addEventListener("beforeunload", onUnload); return () => { clearInterval(beat); void supabase.removeChannel(channel); window.removeEventListener("beforeunload", onUnload); }; }, [connection, peer]);
  useEffect(() => { void searchLocal(query).then(setSearchResults); }, [query]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, peer?.user_id]);

  async function bootstrap() { await upsertMe("online"); await loadUsers(); await refreshChats(); await drainQueue(); await pollSignals(); }
  async function cleanup() { try { await supabase.rpc("ubridge_cleanup"); } catch {} }
  async function upsertMe(status: string) { await supabase.rpc("ubridge_upsert_me", { p_name: name, p_relay: "supabase+webrtc", p_status: status }); }
  async function loadUsers() { const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false }); setUsers((data || []) as UserRow[]); }
  async function refreshChats() { setChats(await listChats()); }
  async function openPeer(u: UserRow) { setPeer(u); const id = chatIdFor(u.user_id); await upsertChat({ id, peerId: u.user_id, title: u.name, pinned: false, unread: 0, lastMessage: "", lastAt: Date.now(), typing: false }); setMessages(await listMessages(id, 160)); await refreshChats(); void connectP2P(u); }
  async function storeMessage(m: LocalMessage) { await saveMessage(m); setMessages((prev) => prev.some((x) => x.id === m.id) ? prev.map((x) => x.id === m.id ? m : x) : [...prev, m]); const c: LocalChat = { id: m.chatId, peerId: peer?.user_id || m.chatId.replace("direct:", ""), title: peer?.name || "Chat", pinned: false, unread: m.from === "peer" ? 1 : 0, lastMessage: m.deletedAt ? "Deleted" : m.text, lastAt: m.at, typing: false }; await upsertChat(c); await refreshChats(); }
  async function pollSignals() { const { data } = await supabase.rpc("ubridge_poll_signals"); if (Array.isArray(data)) for (const row of data) await handleSignal(row as SignalRow); }
  async function drainQueue() { const { data } = await supabase.rpc("ubridge_queue_drain"); if (Array.isArray(data)) for (const row of data) { try { const body = row.body?.box ? await decryptFor(row.from_user, initialUser.id, row.body.box) : row.body; const id = chatIdFor(row.from_user); await saveMessage({ id: messageId(), chatId: id, from: "peer", text: body.text || JSON.stringify(body), at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true, signature: body.signature }); await upsertChat({ id, peerId: row.from_user, title: users.find((u) => u.user_id === row.from_user)?.name || "Chat", pinned: false, unread: 1, lastMessage: body.text || "Encrypted packet", lastAt: Date.now(), typing: false }); if (peer?.user_id === row.from_user) setMessages(await listMessages(id, 160)); } catch {} } await refreshChats(); }

  function makePc(target: UserRow) { pc.current?.close(); const next = new RTCPeerConnection({ iceServers: ICE }); pc.current = next; next.onicecandidate = (e) => { if (e.candidate) void signal(target.user_id, "candidate", e.candidate.toJSON()); }; next.onconnectionstatechange = () => { if (next.connectionState === "connected") { setConnection("connected"); if (localStream.current) setVoice("live"); } }; next.ondatachannel = (event) => attachDc(event.channel, target); next.ontrack = (event) => { if (remoteAudio.current) { remoteAudio.current.srcObject = event.streams[0]; void remoteAudio.current.play().catch(() => {}); } setVoice("live"); }; return next; }
  function attachDc(channel: RTCDataChannel, target = peer) { dc.current = channel; channel.onopen = () => { setConnection("connected"); if (target) void storeMessage(systemMsg(chatIdFor(target.user_id), tx.connected)); }; channel.onclose = () => setConnection("idle"); channel.onmessage = async (e) => { try { const msg = JSON.parse(String(e.data)); if (msg.typing) { setTyping(Boolean(msg.typing)); return; } const body = msg.box && target ? await decryptFor(target.user_id, initialUser.id, msg.box) : msg; if (target) await storeMessage({ id: messageId(), chatId: chatIdFor(target.user_id), from: "peer", text: body.text || (body.fileName ? `File: ${body.fileName}` : JSON.stringify(body)), at: Date.now(), reactions: {}, delivery: "delivered", encrypted: true, signature: body.signature, attachment: body.fileName ? { name: body.fileName, mime: body.mime, size: body.size } : undefined }); } catch {} }; }
  async function connectP2P(target: UserRow, withVoice = false) { setPeer(target); setConnection("connecting"); const conn = makePc(target); if (withVoice) await addVoice(conn); attachDc(conn.createDataChannel("ubridge-message"), target); const offer = await conn.createOffer(); await conn.setLocalDescription(offer); await signal(target.user_id, "offer", offer); }
  async function addVoice(conn: RTCPeerConnection) { setVoice("calling"); localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current.getTracks().forEach((t) => conn.addTrack(t, localStream.current!)); }
  async function handleSignal(row: SignalRow) { if (row.from_user === initialUser.id) return; const target = users.find((u) => u.user_id === row.from_user) || peer || { user_id: row.from_user, name: "Chat", online: true, status: null, relay: null, last_seen: null }; if (!peer) await openPeer(target); if (row.kind === "offer") { setConnection("connecting"); const conn = makePc(target); await conn.setRemoteDescription(new RTCSessionDescription(row.payload)); const ans = await conn.createAnswer(); await conn.setLocalDescription(ans); await signal(row.from_user, "answer", ans); } else if (row.kind === "answer" && pc.current) await pc.current.setRemoteDescription(new RTCSessionDescription(row.payload)); else if (row.kind === "candidate" && pc.current) await pc.current.addIceCandidate(new RTCIceCandidate(row.payload)).catch(() => {}); else if (row.kind === "hangup") endVoice(false); }
  async function signal(to: string, kind: SignalRow["kind"], payload: any) { await supabase.rpc("ubridge_signal", { p_to: to, p_kind: kind, p_payload: payload }); }
  function systemMsg(chatId: string, text: string): LocalMessage { return { id: messageId(), chatId, from: "system", text, at: Date.now(), reactions: {}, delivery: "read", encrypted: false }; }

  async function send() { if (!text.trim() || !peer) return; const value = text.trim(); setText(""); if (editing) { editing.text = value; editing.editedAt = Date.now(); await updateMessage(editing); setMessages(await listMessages(editing.chatId, 160)); setEditing(null); return; } const payload = { type: "text", text: value, replyTo: replyTo?.id || null, signature: await signPayload(initialUser.id, { text: value }) }; const box = await encryptFor(initialUser.id, peer.user_id, payload); const local: LocalMessage = { id: messageId(), chatId: chatKey, from: "me", text: value, at: Date.now(), replyTo: replyTo?.id || null, reactions: {}, delivery: "sending", encrypted: true, signature: payload.signature }; await storeMessage(local); setReplyTo(null); if (dc.current?.readyState === "open") { dc.current.send(JSON.stringify({ box })); local.delivery = "sent"; await storeMessage(local); } else { await supabase.rpc("ubridge_queue_send", { p_to: peer.user_id, p_body: { box } }); local.delivery = "delivered"; await storeMessage(local); } }
  async function sendFile(file: File) { if (!peer) return; const buf = await file.arrayBuffer(); const payload = { type: "file", fileName: file.name, mime: file.type, size: file.size, bytes: btoa(String.fromCharCode(...new Uint8Array(buf).slice(0, 128000))) }; const box = await encryptFor(initialUser.id, peer.user_id, payload); if (dc.current?.readyState === "open") dc.current.send(JSON.stringify({ box })); else await supabase.rpc("ubridge_queue_send", { p_to: peer.user_id, p_body: { box } }); await storeMessage({ id: messageId(), chatId: chatKey, from: "me", text: `File: ${file.name}`, at: Date.now(), reactions: {}, delivery: "sent", encrypted: true, attachment: { name: file.name, mime: file.type, size: file.size } }); }
  function setTypingSignal(v: string) { setText(v); if (dc.current?.readyState === "open") dc.current.send(JSON.stringify({ typing: true })); }
  function react(m: LocalMessage, emoji: string) { m.reactions[emoji] = (m.reactions[emoji] || 0) + 1; void storeMessage(m); }
  function del(m: LocalMessage) { m.deletedAt = Date.now(); m.text = "Message deleted"; void storeMessage(m); }
  function copy(m: LocalMessage) { void navigator.clipboard?.writeText(m.text); }
  function edit(m: LocalMessage) { setEditing(m); setText(m.text); }
  function forward(m: LocalMessage) { setText(`Forwarded: ${m.text}`); }
  async function voiceCall() { if (peer) await connectP2P(peer, true); }
  function endVoice(sendSignal = true) { localStream.current?.getTracks().forEach((t) => t.stop()); localStream.current = null; setVoice("idle"); if (sendSignal && peer) void signal(peer.user_id, "hangup", {}); }

  const recent = chats.slice(0, 120);
  const pinned = chats.filter((c) => c.pinned);
  const online = users.filter((u) => u.online);
  const offline = users.filter((u) => !u.online);
  const shellClass = `ub-shell ${peer ? "chat-open" : ""}`;

  return (
    <main className="ub-app">
      <audio ref={remoteAudio} autoPlay playsInline />
      <div className={shellClass}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-row">
              <div className="brand-mark">
                <img src="/ubridge-logo.svg" alt="UBridge" />
                <div className="brand-copy"><strong>UBridge</strong><span>Secure Messenger</span></div>
              </div>
              <button className="theme-toggle" onClick={() => document.documentElement.classList.toggle("dark")} aria-label="Toggle theme"><UIcon name="moon" /></button>
            </div>
            <div className="search-box"><span className="search-icon"><UIcon name="search" /></span><input className="search-input" placeholder={tx.search} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          </div>

          <div className="sidebar-scroll">
            {query && <Section title="Search">{searchResults.map((r) => <button className="chat-item" key={r.messageId}><div className="avatar"><UIcon name="search" /></div><div className="chat-main"><div className="chat-name">{r.text}</div><div className="chat-preview">{new Date(r.at).toLocaleTimeString()}</div></div></button>)}</Section>}
            <Section title="Pinned">{pinned.map((c) => <ChatButton key={c.id} chat={c} active={chatKey === c.id} onClick={() => openPeer({ user_id: c.peerId, name: c.title, online: true, status: null, relay: null, last_seen: null })} />)}</Section>
            <Section title={tx.chats}>{recent.map((c) => <ChatButton key={c.id} chat={c} active={chatKey === c.id} onClick={() => openPeer({ user_id: c.peerId, name: c.title, online: true, status: null, relay: null, last_seen: null })} />)}</Section>
          </div>

          <div className="sidebar-bottom">
            <Section title={tx.online}>{online.map((u) => <UserButton key={u.user_id} u={u} active={peer?.user_id === u.user_id} onClick={() => openPeer(u)} />)}</Section>
            <Section title={tx.offline}>{offline.map((u) => <UserButton key={u.user_id} u={u} active={peer?.user_id === u.user_id} onClick={() => openPeer(u)} />)}</Section>
          </div>
        </aside>

        <section className="chat-panel">
          {!peer ? (
            <div className="empty-state"><div className="empty-card"><img src="/ubridge-logo.svg" alt="" /><h1>{tx.select}</h1><p>{tx.selectSub}</p></div></div>
          ) : (
            <>
              <header className="chat-header">
                <button className="icon-button mobile-back" onClick={() => setPeer(null)} aria-label="Back"><UIcon name="arrow-left" /></button>
                <div className="peer-info"><div className="avatar large">{peer.name[0]?.toUpperCase()}<span className="online-dot" /></div><div className="peer-copy"><strong>{peer.name}</strong><div className="peer-status">{typing ? "typing…" : connection === "connected" ? tx.connected : connection === "connecting" ? tx.connecting : tx.ready}</div></div></div>
                <div className="header-actions"><button className="action-button primary" onClick={() => void voiceCall()}><UIcon name="phone" />{tx.call}</button><button className="action-button"><UIcon name="search" /></button><button className="action-button"><UIcon name="settings" /></button></div>
              </header>

              <div className="messages">{messages.slice(-220).map((m) => <div key={m.id} className={`message-row ${m.from}`}><div className={`message-bubble ${m.from === "me" ? "me" : ""} ${m.deletedAt ? "deleted" : ""}`} onContextMenu={(e) => { e.preventDefault(); setContext({ message: m, x: e.clientX, y: e.clientY }); }}>{m.replyTo && <div className="reply-mark">{tx.reply}</div>}<span>{m.deletedAt ? "Message deleted" : m.text}</span>{m.attachment && <div className="attachment">{m.attachment.name}</div>}<div className="message-meta"><span>{new Date(m.at).toLocaleTimeString()}</span><span>{m.delivery}</span></div>{Object.keys(m.reactions).length > 0 && <div className="reactions">{Object.entries(m.reactions).map(([e, n]) => <span key={e}>{e} {n}</span>)}</div>}</div></div>)}<div ref={messagesEnd} /></div>

              {replyTo && <div className="reply-bar">{tx.reply}: {replyTo.text}<button onClick={() => setReplyTo(null)}>×</button></div>}
              {editing && <div className="reply-bar">{tx.edit}<button onClick={() => { setEditing(null); setText(""); }}>×</button></div>}
              <footer className="composer"><button className="round-button" title={tx.reaction}>😊</button><label className="round-button" title={tx.file}>+<input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void sendFile(f); }} /></label><textarea className="composer-textarea" value={text} onChange={(e) => setTypingSignal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={tx.message} /><button className="send-button" onClick={() => void send()}><UIcon name="send" />{tx.send}</button></footer>
            </>
          )}
        </section>

        <aside className="info-panel"><div className="info-card"><div className="avatar xl">{peer?.name[0]?.toUpperCase() || "U"}</div><h3>{peer?.name || "UBridge"}</h3><p>{peer ? "Encrypted local-first conversation" : "Secure realtime ecosystem"}</p></div><div className="info-list"><div className="info-row"><UIcon name="shield" />End-to-end encrypted</div><div className="info-row"><UIcon name="database" />Local-first history</div><div className="info-row"><UIcon name="link" />P2P when possible</div></div></aside>

        {voice !== "idle" && <div className="call-modal"><div className="call-card"><div className="call-pulse"><div className="avatar huge">{peer?.name[0]?.toUpperCase()}</div></div><h2>{tx.voiceTitle}</h2><p>{voice === "live" ? tx.connected : tx.voiceSub}</p><div className="call-controls"><button className="icon-button"><UIcon name="volume" /></button><button className="icon-button"><UIcon name="mic" /></button><button className="hangup" onClick={() => endVoice()}><UIcon name="close" /></button></div></div></div>}
        {context && <div className="context-menu" style={{ left: context.x, top: context.y }}><button onClick={() => setReplyTo(context.message)}><UIcon name="message" />{tx.reply}</button><button onClick={() => forward(context.message)}><UIcon name="share" />Forward</button><button onClick={() => edit(context.message)}><UIcon name="edit" />{tx.edit}</button><button onClick={() => copy(context.message)}><UIcon name="copy" />{tx.copy}</button><button onClick={() => react(context.message, "👍")}>👍 {tx.reaction}</button><button onClick={() => del(context.message)}><UIcon name="trash" />{tx.del}</button></div>}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><div className="section-title">{title}</div><div className="section-list">{children}</div></section>; }
function UserButton({ u, active, onClick }: { u: UserRow; active: boolean; onClick: () => void }) { return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{u.name[0]?.toUpperCase()}{u.online && <span className="online-dot" />}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{u.name}</span></div><div className="chat-preview">{u.status || "offline"}</div></div><div className="chat-meta"><span className="chat-time">{u.online ? "now" : ""}</span></div></button>; }
function ChatButton({ chat, active, onClick }: { chat: LocalChat; active: boolean; onClick: () => void }) { return <button className={`chat-item ${active ? "active" : ""}`} onClick={onClick}><div className="avatar">{chat.title[0]?.toUpperCase()}</div><div className="chat-main"><div className="chat-name-row"><span className="chat-name">{chat.title}</span></div><div className="chat-preview">{chat.typing ? "typing…" : chat.lastMessage || "No messages"}</div></div><div className="chat-meta"><span className="chat-time">{chat.lastAt ? new Date(chat.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>{chat.unread > 0 && <span className="unread">{chat.unread}</span>}</div></button>; }
