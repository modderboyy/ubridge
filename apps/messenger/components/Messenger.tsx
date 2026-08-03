"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type ChatMessage = { from: "me" | "peer"; text: string; at: number; via: "p2p" | "queue" | "system" };
type SignalRow = { id: string; from_user: string; to_user: string; kind: "offer" | "answer" | "candidate" | "hangup"; payload: any };

const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(initialUser.name);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [peer, setPeer] = useState<UserRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: "peer", text: "Welcome to UBridge P2P messenger.", at: Date.now(), via: "system" }]);
  const [text, setText] = useState("Salom from UBridge");
  const [p2p, setP2p] = useState<"idle" | "connecting" | "open">("idle");
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    void upsertMe("online");
    void loadUsers();
    const beat = setInterval(() => void upsertMe(p2p === "open" ? "p2p-online" : "online"), 20_000);
    const channel = supabase.channel("ubridge-signals")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ubridge_signals_w", filter: `to_user=eq.${initialUser.id}` }, (p) => void handleSignal(p.new as SignalRow))
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();
    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(beat); void supabase.removeChannel(channel); window.removeEventListener("beforeunload", onUnload); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p]);

  async function upsertMe(status: string) {
    await supabase.rpc("ubridge_upsert_me", { p_name: name, p_relay: "supabase-signals", p_status: status });
  }

  async function loadUsers() {
    const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false });
    setUsers((data || []) as UserRow[]);
  }

  function add(m: ChatMessage) { setMessages((prev) => [...prev, m]); }

  function makePc(target: UserRow) {
    pc.current?.close();
    const next = new RTCPeerConnection({ iceServers: ICE });
    pc.current = next;
    next.onicecandidate = (e) => { if (e.candidate) void signal(target.user_id, "candidate", e.candidate.toJSON()); };
    next.onconnectionstatechange = () => { if (next.connectionState === "connected") setP2p("open"); };
    next.ondatachannel = (event) => attachDc(event.channel);
    return next;
  }

  function attachDc(channel: RTCDataChannel) {
    dc.current = channel;
    channel.onopen = () => { setP2p("open"); add({ from: "peer", text: "P2P data channel opened", at: Date.now(), via: "system" }); };
    channel.onclose = () => setP2p("idle");
    channel.onmessage = (event) => add({ from: "peer", text: String(event.data), at: Date.now(), via: "p2p" });
  }

  async function call(target: UserRow) {
    setPeer(target); setP2p("connecting");
    const conn = makePc(target);
    attachDc(conn.createDataChannel("ubridge-message"));
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    await signal(target.user_id, "offer", offer);
  }

  async function handleSignal(row: SignalRow) {
    if (row.from_user === initialUser.id) return;
    const target = users.find((u) => u.user_id === row.from_user) || peer || { user_id: row.from_user, name: "Peer", online: true, status: null, relay: null, last_seen: null };
    setPeer(target);
    if (row.kind === "offer") {
      setP2p("connecting");
      const conn = makePc(target);
      await conn.setRemoteDescription(new RTCSessionDescription(row.payload));
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      await signal(row.from_user, "answer", answer);
    } else if (row.kind === "answer" && pc.current) {
      await pc.current.setRemoteDescription(new RTCSessionDescription(row.payload));
    } else if (row.kind === "candidate" && pc.current) {
      await pc.current.addIceCandidate(new RTCIceCandidate(row.payload)).catch(() => {});
    }
  }

  async function signal(to: string, kind: SignalRow["kind"], payload: any) {
    await supabase.from("ubridge_signals_w").insert({ from_user: initialUser.id, to_user: to, kind, payload });
  }

  async function send() {
    if (!text.trim()) return;
    const value = text.trim();
    setText("");
    if (dc.current?.readyState === "open") {
      dc.current.send(value);
      add({ from: "me", text: value, at: Date.now(), via: "p2p" });
      return;
    }
    if (peer) {
      await supabase.from("ubridge_queue_w").insert({ from_user: initialUser.id, to_user: peer.user_id, body: { type: "text", text: value } });
      add({ from: "me", text: value + " (queued fallback)", at: Date.now(), via: "queue" });
    }
  }

  return <main className="app">
    <div className="top"><div className="brand"><div className="logo">U</div>UBridge Messenger</div><button className="btn secondary" onClick={() => upsertMe("online")}>Refresh presence</button></div>
    <div className="shell">
      <aside className="panel side"><div className="me"><b>{name}</b><div className="small">{initialUser.id}</div><input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => upsertMe("online")} /></div><div className="users">{users.map((u) => <button key={u.user_id} className={`user ${peer?.user_id === u.user_id ? "active" : ""}`} onClick={() => call(u)}><div className="avatar">{u.name[0]?.toUpperCase()}</div><div style={{flex:1}}><b>{u.name}</b><div className="small">{u.status || "offline"}</div></div><span className={`dot ${u.online ? "on" : ""}`} /></button>)}</div></aside>
      <section className="panel chat"><div className="chatHead"><div><b>{peer ? peer.name : "Select a peer"}</b><div className="status">transport: {p2p} · relay: Supabase signaling · data: WebRTC P2P when connected</div></div>{peer && <button className="btn secondary" onClick={() => call(peer)}>Reconnect P2P</button>}</div><div className="messages">{messages.map((m,i)=><div key={i} className={`bubble ${m.from === "me" ? "me" : ""}`}>{m.text}<div className="small">{m.via}</div></div>)}</div><div className="compose"><input className="input" value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') void send(); }} /><button className="btn" onClick={() => void send()}>Send</button></div></section>
    </div>
  </main>;
}
