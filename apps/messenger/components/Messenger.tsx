"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import UIcon from "./UIcon";
import { chatIdFor, listChats, listMessages, messageId, saveMessage, searchLocal, updateMessage, upsertChat, type LocalChat, type LocalMessage } from "../lib/local-db";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };
type SignalRow = { id: string; from_user: string; to_user: string; kind: "offer" | "answer" | "candidate" | "hangup"; payload: any };

type ContextState = { message: LocalMessage; x: number; y: number } | null;

const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }];
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array) { let s=""; bytes.forEach(b=>s+=String.fromCharCode(b)); return btoa(s); }
function ub64(v: string) { const s=atob(v); const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i); return out; }
async function sha256(text: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
async function sharedKey(a: string, b: string) { const seed=[a,b].sort().join(":"); return crypto.subtle.importKey("raw", await sha256(seed), "AES-GCM", false, ["encrypt","decrypt"]); }
async function encryptFor(a:string,b:string,value:any) { const key=await sharedKey(a,b); const iv=crypto.getRandomValues(new Uint8Array(12)); const data=enc.encode(JSON.stringify(value)); const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data); return { alg:"AES-GCM", iv:b64(iv), ciphertext:b64(new Uint8Array(ct)) }; }
async function decryptFor(a:string,b:string,box:any) { const key=await sharedKey(a,b); const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(box.iv)},key,ub64(box.ciphertext)); return JSON.parse(dec.decode(plain)); }
async function deviceKeys(userId:string) { const k=`ubridge_keys_${userId}`; const saved=localStorage.getItem(k); if(saved){ return crypto.subtle.importKey("jwk",JSON.parse(saved),{name:"ECDSA",namedCurve:"P-256"},true,["sign"]); } const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]); localStorage.setItem(k,JSON.stringify(await crypto.subtle.exportKey("jwk",pair.privateKey))); return pair.privateKey; }
async function signPayload(userId:string,value:any){ const key=await deviceKeys(userId); const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(JSON.stringify(value))); return b64(new Uint8Array(sig)); }

export default function Messenger({ initialUser }: { initialUser: { id: string; name: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState(initialUser.name);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [peer, setPeer] = useState<UserRow | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState("Salom from UBridge");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ chatId: string; messageId: string; text: string; at: number }[]>([]);
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [context, setContext] = useState<ContextState>(null);
  const [p2p, setP2p] = useState<"idle" | "connecting" | "open">("idle");
  const [voice, setVoice] = useState<"idle"|"calling"|"live">("idle");
  const [typing, setTyping] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const chatKey = peer ? chatIdFor(peer.user_id) : "";
  const visibleMessages = messages.slice(-150);

  useEffect(() => {
    void bootstrap();
    const beat = setInterval(() => { void upsertMe(p2p === "open" ? "p2p-online" : "online"); void drainQueue(); void pollSignals(); void cleanup(); }, 2500);
    const channel = supabase.channel("ubridge-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ubridge_users_v" }, () => void loadUsers())
      .subscribe();
    const onUnload = () => { void supabase.rpc("ubridge_offline"); };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("click", () => setContext(null));
    return () => { clearInterval(beat); void supabase.removeChannel(channel); window.removeEventListener("beforeunload", onUnload); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p, peer]);

  useEffect(() => { void searchLocal(query).then(setSearchResults); }, [query]);

  async function bootstrap() { await upsertMe("online"); await loadUsers(); await refreshChats(); await drainQueue(); await pollSignals(); }
  async function cleanup(){ try { await supabase.rpc("ubridge_cleanup"); } catch {} }
  async function upsertMe(status: string) { await supabase.rpc("ubridge_upsert_me", { p_name: name, p_relay: "supabase+webrtc", p_status: status }); }
  async function loadUsers() { const { data } = await supabase.from("ubridge_users_v").select("*").neq("user_id", initialUser.id).order("online", { ascending: false }); setUsers((data || []) as UserRow[]); }
  async function refreshChats() { setChats(await listChats()); }
  async function openPeer(u: UserRow) { setPeer(u); const id = chatIdFor(u.user_id); await upsertChat({ id, peerId: u.user_id, title: u.name, pinned: false, unread: 0, lastMessage: "", lastAt: Date.now(), typing: false }); setMessages(await listMessages(id)); await refreshChats(); void call(u); }

  async function storeMessage(m: LocalMessage) { await saveMessage(m); setMessages((prev)=> prev.some(x=>x.id===m.id) ? prev.map(x=>x.id===m.id?m:x) : [...prev,m]); const c: LocalChat={id:m.chatId,peerId:peer?.user_id||m.chatId.replace("direct:",""),title:peer?.name||"Peer",pinned:false,unread:m.from==="peer"?1:0,lastMessage:m.deletedAt?"Deleted":m.text,lastAt:m.at,typing:false}; await upsertChat(c); await refreshChats(); }

  async function pollSignals(){ const { data } = await supabase.rpc("ubridge_poll_signals"); if(Array.isArray(data)) for(const row of data) await handleSignal(row as SignalRow); }
  async function drainQueue(){ const { data } = await supabase.rpc("ubridge_queue_drain"); if(Array.isArray(data)) for(const row of data){ try{ const body=row.body?.box ? await decryptFor(row.from_user, initialUser.id, row.body.box) : row.body; const id=chatIdFor(row.from_user); await saveMessage({id:messageId(),chatId:id,from:"peer",text:body.text||JSON.stringify(body),at:Date.now(),reactions:{},delivery:"delivered",encrypted:true,signature:body.signature}); await upsertChat({id,peerId:row.from_user,title:users.find(u=>u.user_id===row.from_user)?.name||"Peer",pinned:false,unread:1,lastMessage:body.text||"Encrypted packet",lastAt:Date.now(),typing:false}); if(peer?.user_id===row.from_user) setMessages(await listMessages(id)); }catch{} } await refreshChats(); }

  function makePc(target: UserRow) { pc.current?.close(); const next=new RTCPeerConnection({iceServers:ICE}); pc.current=next; next.onicecandidate=e=>{if(e.candidate)void signal(target.user_id,"candidate",e.candidate.toJSON())}; next.onconnectionstatechange=()=>{if(next.connectionState==="connected") { setP2p("open"); if(localStream.current)setVoice("live"); }}; next.ondatachannel=e=>attachDc(e.channel,target); next.ontrack=()=>{setVoice("live"); void storeMessage(systemMsg(chatIdFor(target.user_id),"Voice stream connected","voice"));}; return next; }
  function attachDc(channel: RTCDataChannel, target=peer) { dc.current=channel; channel.onopen=()=>{setP2p("open"); if(target) void storeMessage(systemMsg(chatIdFor(target.user_id),"E2EE P2P channel opened","system"));}; channel.onclose=()=>setP2p("idle"); channel.onmessage=async e=>{ try{ const msg=JSON.parse(String(e.data)); if(msg.typing){setTyping(Boolean(msg.typing)); return;} const body=msg.box&&target?await decryptFor(target.user_id,initialUser.id,msg.box):msg; if(target) await storeMessage({id:messageId(),chatId:chatIdFor(target.user_id),from:"peer",text:body.text||(body.fileName?`File: ${body.fileName}`:JSON.stringify(body)),at:Date.now(),reactions:{},delivery:"delivered",encrypted:true,signature:body.signature,attachment:body.fileName?{name:body.fileName,mime:body.mime,size:body.size}:undefined}); }catch{} }; }
  async function call(target: UserRow, withVoice=false) { setPeer(target); setP2p("connecting"); const conn=makePc(target); if(withVoice)await addVoice(conn); attachDc(conn.createDataChannel("ubridge-message"),target); const offer=await conn.createOffer(); await conn.setLocalDescription(offer); await signal(target.user_id,"offer",offer); }
  async function addVoice(conn:RTCPeerConnection){ setVoice("calling"); localStream.current=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); localStream.current.getTracks().forEach(t=>conn.addTrack(t,localStream.current!)); }
  async function handleSignal(row:SignalRow){ if(row.from_user===initialUser.id)return; const target=users.find(u=>u.user_id===row.from_user)||peer||{user_id:row.from_user,name:"Peer",online:true,status:null,relay:null,last_seen:null}; if(!peer) await openPeer(target); if(row.kind==="offer"){setP2p("connecting");const conn=makePc(target);await conn.setRemoteDescription(new RTCSessionDescription(row.payload));const ans=await conn.createAnswer();await conn.setLocalDescription(ans);await signal(row.from_user,"answer",ans);} else if(row.kind==="answer"&&pc.current) await pc.current.setRemoteDescription(new RTCSessionDescription(row.payload)); else if(row.kind==="candidate"&&pc.current) await pc.current.addIceCandidate(new RTCIceCandidate(row.payload)).catch(()=>{}); else if(row.kind==="hangup") endVoice(false); }
  async function signal(to:string,kind:SignalRow["kind"],payload:any){ await supabase.rpc("ubridge_signal",{p_to:to,p_kind:kind,p_payload:payload}); }
  function systemMsg(chatId:string,text:string,via:LocalMessage["from"]|"voice"|"system"="system"):LocalMessage{ return {id:messageId(),chatId,from:"system",text,at:Date.now(),reactions:{},delivery:"read",encrypted:false}; }

  async function send() { if(!text.trim()||!peer)return; const value=text.trim(); setText(""); if(editing){ editing.text=value; editing.editedAt=Date.now(); await updateMessage(editing); setMessages(await listMessages(editing.chatId)); setEditing(null); return; } const payload={type:"text",text:value,replyTo:replyTo?.id||null,signature:await signPayload(initialUser.id,{text:value})}; const box=await encryptFor(initialUser.id,peer.user_id,payload); const local:LocalMessage={id:messageId(),chatId:chatKey,from:"me",text:value,at:Date.now(),replyTo:replyTo?.id||null,reactions:{},delivery:"sending",encrypted:true,signature:payload.signature}; await storeMessage(local); setReplyTo(null); if(dc.current?.readyState==="open"){ dc.current.send(JSON.stringify({box})); local.delivery="sent"; await storeMessage(local); } else { await supabase.rpc("ubridge_queue_send",{p_to:peer.user_id,p_body:{box}}); local.delivery="delivered"; await storeMessage(local); } }
  async function sendFile(file:File){ if(!peer)return; const buf=await file.arrayBuffer(); const payload={type:"file",fileName:file.name,mime:file.type,size:file.size,bytes:btoa(String.fromCharCode(...new Uint8Array(buf).slice(0,128000)))}; const box=await encryptFor(initialUser.id,peer.user_id,payload); if(dc.current?.readyState==="open") dc.current.send(JSON.stringify({box})); else await supabase.rpc("ubridge_queue_send",{p_to:peer.user_id,p_body:{box}}); await storeMessage({id:messageId(),chatId:chatKey,from:"me",text:`File: ${file.name}`,at:Date.now(),reactions:{},delivery:"sent",encrypted:true,attachment:{name:file.name,mime:file.type,size:file.size}}); }
  function setTypingSignal(v:string){ setText(v); if(dc.current?.readyState==="open") dc.current.send(JSON.stringify({typing:true})); }
  function react(m:LocalMessage,emoji:string){m.reactions[emoji]=(m.reactions[emoji]||0)+1; void storeMessage(m);}
  function del(m:LocalMessage){m.deletedAt=Date.now();m.text="Message deleted";void storeMessage(m);}
  function copy(m:LocalMessage){void navigator.clipboard?.writeText(m.text);}
  function edit(m:LocalMessage){setEditing(m);setText(m.text);}
  function forward(m:LocalMessage){setText(`Forwarded: ${m.text}`);}
  async function voiceCall(){if(peer)await call(peer,true)} function endVoice(send=true){localStream.current?.getTracks().forEach(t=>t.stop());localStream.current=null;setVoice("idle");if(send&&peer)void signal(peer.user_id,"hangup",{});}

  const online=users.filter(u=>u.online), offline=users.filter(u=>!u.online), recent=chats.slice(0,50), pinned=chats.filter(c=>c.pinned);
  return <main className="app"><div className="top"><div className="brand"><img src="/ubridge-logo.svg" className="brandLogo"/>UBridge Messenger</div><div className="topActions"><span className="small">local-first · E2EE · P2P</span><button className="btn secondary" onClick={()=>upsertMe("online")}> <UIcon name="refresh"/> Refresh</button></div></div><div className="shell"><aside className="panel side"><div className="me"><b>{name}</b><div className="small">{initialUser.id}</div><input className="input" value={name} onChange={e=>setName(e.target.value)} onBlur={()=>upsertMe("online")}/><input className="input search" placeholder="Search users, chats, messages" value={query} onChange={e=>setQuery(e.target.value)}/></div>{query&&<Section title="Search results">{searchResults.map(r=><button className="user" key={r.messageId} onClick={()=>setQuery("")}><UIcon name="search"/><div><b>{r.text}</b><div className="small">{new Date(r.at).toLocaleTimeString()}</div></div></button>)}</Section>}<Section title="Pinned chats">{pinned.map(c=><ChatButton key={c.id} chat={c} active={chatKey===c.id} onClick={()=>openPeer({user_id:c.peerId,name:c.title,online:true,status:null,relay:null,last_seen:null})}/>)}</Section><Section title="Recent chats">{recent.map(c=><ChatButton key={c.id} chat={c} active={chatKey===c.id} onClick={()=>openPeer({user_id:c.peerId,name:c.title,online:true,status:null,relay:null,last_seen:null})}/>)}</Section><Section title="Online users">{online.map(u=><UserButton key={u.user_id} u={u} active={peer?.user_id===u.user_id} onClick={()=>openPeer(u)}/>)}</Section><Section title="Offline users">{offline.map(u=><UserButton key={u.user_id} u={u} active={peer?.user_id===u.user_id} onClick={()=>openPeer(u)}/>)}</Section></aside><section className="panel chat"><div className="chatHead"><div><b>{peer?peer.name:"Select a peer"}</b><div className="status">transport: {p2p} · voice: {voice} · {typing?"typing…":"ready"}</div></div>{peer&&<div className="headBtns"><button className="btn secondary" onClick={()=>call(peer)}><UIcon name="link"/>P2P</button><button className="btn secondary" onClick={()=>void voiceCall()}><UIcon name="phone"/>Voice</button><button className="btn secondary" onClick={()=>endVoice()}><UIcon name="close"/>Hangup</button><label className="btn secondary"><UIcon name="upload"/>File<input type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void sendFile(f)}}/></label></div>}</div><div className="messages">{visibleMessages.map((m,i)=><div key={m.id} className={`msgRow ${m.from}`}> <div className={`bubble ${m.from==="me"?"me":""}`} onContextMenu={e=>{e.preventDefault();setContext({message:m,x:e.clientX,y:e.clientY})}}>{m.replyTo&&<div className="replyMark">reply</div>}<span>{m.deletedAt?"Message deleted":m.text}</span>{m.attachment&&<div className="attachment">{m.attachment.name}</div>}<div className="meta">{new Date(m.at).toLocaleTimeString()} · {m.delivery}{m.editedAt?" · edited":""}</div>{Object.keys(m.reactions).length>0&&<div className="reactions">{Object.entries(m.reactions).map(([e,n])=><span key={e}>{e} {n}</span>)}</div>}</div></div>)}</div>{replyTo&&<div className="replyBar">Replying to: {replyTo.text}<button onClick={()=>setReplyTo(null)}>×</button></div>}{editing&&<div className="replyBar">Editing message<button onClick={()=>{setEditing(null);setText("")}}>×</button></div>}<div className="compose"><input className="input" value={text} onChange={e=>setTypingSignal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void send()}} placeholder="Write a message"/><button className="btn" onClick={()=>void send()}><UIcon name="send"/>Send</button></div></section>{context&&<div className="menu" style={{left:context.x,top:context.y}}><button onClick={()=>setReplyTo(context.message)}>Reply</button><button onClick={()=>forward(context.message)}>Forward</button><button onClick={()=>edit(context.message)}>Edit</button><button onClick={()=>copy(context.message)}>Copy</button><button onClick={()=>react(context.message,"👍")}>👍 React</button><button onClick={()=>del(context.message)}>Delete</button></div>}</div></main>;
}
function Section({title,children}:{title:string;children:React.ReactNode}){return <div className="section"><div className="sectionTitle">{title}</div><div className="users">{children}</div></div>}
function UserButton({u,active,onClick}:{u:UserRow;active:boolean;onClick:()=>void}){return <button className={`user ${active?"active":""}`} onClick={onClick}><div className="avatar">{u.name[0]?.toUpperCase()}</div><div style={{flex:1}}><b>{u.name}</b><div className="small">{u.status||"offline"}</div></div><span className={`dot ${u.online?"on":""}`}/></button>}
function ChatButton({chat,active,onClick}:{chat:LocalChat;active:boolean;onClick:()=>void}){return <button className={`user ${active?"active":""}`} onClick={onClick}><div className="avatar">{chat.title[0]?.toUpperCase()}</div><div style={{flex:1}}><b>{chat.title}</b><div className="small">{chat.typing?"typing…":chat.lastMessage||"No messages"}</div></div>{chat.unread>0&&<span className="unread">{chat.unread}</span>}</button>}
