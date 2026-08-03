"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type ChatMessage = { from: "me" | "peer"; text: string; at: number; via: "p2p" | "queue" | "system" | "file" | "voice" };
type SignalRow = { id: string; from_user: string; to_user: string; kind: "offer" | "answer" | "candidate" | "hangup"; payload: any };

const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array) { let s=""; bytes.forEach(b=>s+=String.fromCharCode(b)); return btoa(s); }
function ub64(v: string) { const s=atob(v); const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i); return out; }
async function sha256(text: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
async function sharedKey(a: string, b: string) { const seed=[a,b].sort().join(":"); return crypto.subtle.importKey("raw", await sha256(seed), "AES-GCM", false, ["encrypt","decrypt"]); }
async function encryptFor(a:string,b:string,value:any) { const key=await sharedKey(a,b); const iv=crypto.getRandomValues(new Uint8Array(12)); const data=enc.encode(JSON.stringify(value)); const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data); return { alg:"AES-GCM", iv:b64(iv), ciphertext:b64(new Uint8Array(ct)) }; }
async function decryptFor(a:string,b:string,box:any) { const key=await sharedKey(a,b); const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(box.iv)},key,ub64(box.ciphertext)); return JSON.parse(dec.decode(plain)); }
async function deviceKeys(userId:string) { const k=`ubridge_keys_${userId}`; const saved=localStorage.getItem(k); if(saved){ const jwk=JSON.parse(saved); return crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},true,["sign"]); } const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]); localStorage.setItem(k,JSON.stringify(await crypto.subtle.exportKey("jwk",pair.privateKey))); return pair.privateKey; }
async function signPayload(userId:string,value:any){ const key=await deviceKeys(userId); const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(JSON.stringify(value))); return b64(new Uint8Array(sig)); }

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(initialUser.name);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [peer, setPeer] = useState<UserRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: "peer", text: "Welcome to UBridge P2P + E2EE messenger.", at: Date.now(), via: "system" }]);
  const [text, setText] = useState("Salom from UBridge");
  const [p2p, setP2p] = useState<"idle" | "connecting" | "open">("idle");
  const [voice, setVoice] = useState<"idle"|"calling"|"live">("idle");
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    void upsertMe("online"); void loadUsers(); void drainQueue(); void pollSignals();
    const beat = setInterval(() => { void upsertMe(p2p === "open" ? "p2p-online" : "online"); void drainQueue(); void pollSignals(); void cleanup(); }, 2500);
    const channel = supabase.channel("ubridge-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();
    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(beat); void supabase.removeChannel(channel); window.removeEventListener("beforeunload", onUnload); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p, peer]);

  async function cleanup(){ try { await supabase.rpc("ubridge_cleanup"); } catch {} }
  async function upsertMe(status: string) { await supabase.rpc("ubridge_upsert_me", { p_name: name, p_relay: "supabase+webrtc", p_status: status }); }
  async function loadUsers() { const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false }); setUsers((data || []) as UserRow[]); }
  function add(m: ChatMessage) { setMessages((prev) => [...prev, m]); }

  async function pollSignals(){ const { data } = await supabase.rpc("ubridge_poll_signals"); if(Array.isArray(data)) for(const row of data) await handleSignal(row as SignalRow); }
  async function drainQueue(){ const { data } = await supabase.rpc("ubridge_queue_drain"); if(Array.isArray(data)) for(const row of data){ try{ const body=row.body?.box ? await decryptFor(row.from_user, initialUser.id, row.body.box) : row.body; add({from:"peer",text:body.text || JSON.stringify(body),at:Date.now(),via:"queue"}); }catch{ add({from:"peer",text:"Encrypted queued message could not be opened",at:Date.now(),via:"queue"}); } } }

  function makePc(target: UserRow) {
    pc.current?.close();
    const next = new RTCPeerConnection({ iceServers: ICE }); pc.current = next;
    next.onicecandidate = (e) => { if (e.candidate) void signal(target.user_id, "candidate", e.candidate.toJSON()); };
    next.onconnectionstatechange = () => { if (next.connectionState === "connected") { setP2p("open"); if(localStream.current) setVoice("live"); } };
    next.ondatachannel = (event) => attachDc(event.channel, target);
    next.ontrack = () => { setVoice("live"); add({from:"peer",text:"Voice stream connected",at:Date.now(),via:"voice"}); };
    return next;
  }
  function attachDc(channel: RTCDataChannel, target=peer) { dc.current = channel; channel.onopen=()=>{setP2p("open"); add({from:"peer",text:"E2EE P2P data channel opened",at:Date.now(),via:"system"});}; channel.onclose=()=>setP2p("idle"); channel.onmessage=async(e)=>{ try{ const msg=JSON.parse(String(e.data)); const body=msg.box && target ? await decryptFor(target.user_id, initialUser.id, msg.box) : msg; add({from:"peer",text:body.text || (body.fileName?`File: ${body.fileName}`:JSON.stringify(body)),at:Date.now(),via:body.fileName?"file":"p2p"}); }catch{ add({from:"peer",text:String(e.data),at:Date.now(),via:"p2p"}); } }; }
  async function call(target: UserRow, withVoice=false) { setPeer(target); setP2p("connecting"); const conn=makePc(target); if(withVoice) await addVoice(conn); attachDc(conn.createDataChannel("ubridge-message"), target); const offer=await conn.createOffer(); await conn.setLocalDescription(offer); await signal(target.user_id,"offer",offer); }
  async function addVoice(conn: RTCPeerConnection){ setVoice("calling"); localStream.current=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); localStream.current.getTracks().forEach(t=>conn.addTrack(t, localStream.current!)); }
  async function voiceCall(){ if(peer) await call(peer,true); }
  function endVoice(){ localStream.current?.getTracks().forEach(t=>t.stop()); localStream.current=null; setVoice("idle"); if(peer) void signal(peer.user_id,"hangup",{}); }

  async function handleSignal(row: SignalRow) { if(row.from_user===initialUser.id) return; const target=users.find(u=>u.user_id===row.from_user)||peer||{user_id:row.from_user,name:"Peer",online:true,status:null,relay:null,last_seen:null}; setPeer(target); if(row.kind==="offer"){ setP2p("connecting"); const conn=makePc(target); await conn.setRemoteDescription(new RTCSessionDescription(row.payload)); const answer=await conn.createAnswer(); await conn.setLocalDescription(answer); await signal(row.from_user,"answer",answer); } else if(row.kind==="answer"&&pc.current) await pc.current.setRemoteDescription(new RTCSessionDescription(row.payload)); else if(row.kind==="candidate"&&pc.current) await pc.current.addIceCandidate(new RTCIceCandidate(row.payload)).catch(()=>{}); else if(row.kind==="hangup") { endVoice(); add({from:"peer",text:"Call ended",at:Date.now(),via:"voice"}); } }
  async function signal(to:string,kind:SignalRow["kind"],payload:any){ await supabase.rpc("ubridge_signal",{p_to:to,p_kind:kind,p_payload:payload}); }

  async function send() { if(!text.trim()) return; const value=text.trim(); setText(""); if(peer){ const payload={type:"text",text:value,signature:await signPayload(initialUser.id,{text:value})}; const box=await encryptFor(initialUser.id,peer.user_id,payload); if(dc.current?.readyState==="open"){ dc.current.send(JSON.stringify({box})); add({from:"me",text:value,at:Date.now(),via:"p2p"}); } else { await supabase.rpc("ubridge_queue_send",{p_to:peer.user_id,p_body:{box}}); add({from:"me",text:value+" (queued E2EE)",at:Date.now(),via:"queue"}); } } }
  async function sendFile(file: File){ if(!peer) return; const buf=await file.arrayBuffer(); const payload={type:"file",fileName:file.name,mime:file.type,size:file.size,bytes:btoa(String.fromCharCode(...new Uint8Array(buf).slice(0,128000)))}; const box=await encryptFor(initialUser.id,peer.user_id,payload); if(dc.current?.readyState==="open") dc.current.send(JSON.stringify({box})); else await supabase.rpc("ubridge_queue_send",{p_to:peer.user_id,p_body:{box}}); add({from:"me",text:`File sent: ${file.name}`,at:Date.now(),via:"file"}); }

  return <main className="app"><div className="top"><div className="brand"><div className="logo">U</div>UBridge Messenger</div><div><button className="btn secondary" onClick={()=>upsertMe("online")}>Refresh</button></div></div><div className="shell"><aside className="panel side"><div className="me"><b>{name}</b><div className="small">{initialUser.id}</div><input className="input" value={name} onChange={e=>setName(e.target.value)} onBlur={()=>upsertMe("online")}/></div><div className="users">{users.map(u=><button key={u.user_id} className={`user ${peer?.user_id===u.user_id?"active":""}`} onClick={()=>call(u)}><div className="avatar">{u.name[0]?.toUpperCase()}</div><div style={{flex:1}}><b>{u.name}</b><div className="small">{u.status||"offline"}</div></div><span className={`dot ${u.online?"on":""}`}/></button>)}</div></aside><section className="panel chat"><div className="chatHead"><div><b>{peer?peer.name:"Select a peer"}</b><div className="status">transport: {p2p} · voice: {voice} · E2EE AES-GCM · WebRTC P2P + queue fallback</div></div>{peer&&<div style={{display:"flex",gap:8}}><button className="btn secondary" onClick={()=>call(peer)}>P2P</button><button className="btn secondary" onClick={()=>void voiceCall()}>Voice</button><button className="btn secondary" onClick={endVoice}>Hangup</button><label className="btn secondary">File<input type="file" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) void sendFile(f)}}/></label></div>}</div><div className="messages">{messages.map((m,i)=><div key={i} className={`bubble ${m.from==="me"?"me":""}`}>{m.text}<div className="small">{m.via}</div></div>)}</div><div className="compose"><input className="input" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void send()}}/><button className="btn" onClick={()=>void send()}>Send</button></div></section></div></main>;
}
