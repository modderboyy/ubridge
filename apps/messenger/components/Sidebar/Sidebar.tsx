"use client";
import { useState, useMemo } from "react";
import UIcon from "../UIcon";
import { Section } from "./Section";
import { ChatButton } from "./ChatButton";
import { UserButton } from "./UserButton";
import { useUBridgeStore } from "../../lib/store";
import type { LocalChat } from "../../lib/local-db";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };

interface SidebarProps {
  chats: LocalChat[];
  users: UserRow[];
  activeChatId: string;
  onChatSelect: (peer: UserRow) => void;
  onUserSelect: (user: UserRow) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: { chatId: string; messageId: string; text: string; at: number }[];
  bgConnectedPeers?: Set<string>;
}

export function Sidebar({ 
  chats, 
  users, 
  activeChatId, 
  onChatSelect, 
  onUserSelect, 
  searchQuery, 
  onSearchChange,
  searchResults,
  bgConnectedPeers
}: SidebarProps) {
  const store = useUBridgeStore();
  const [filter, setFilter] = useState<"all" | "online">("all");

  const recent = useMemo(() => chats.slice(0, 120), [chats]);
  const pinned = useMemo(() => chats.filter(c => c.pinned), [chats]);
  const online = useMemo(() => users.filter(u => u.online), [users]);
  const offline = useMemo(() => users.filter(u => !u.online), [users]);

  const filteredChats = useMemo(() => {
    if (!searchQuery) return recent;
    const q = searchQuery.toLowerCase();
    return recent.filter(c => 
      c.title.toLowerCase().includes(q) || 
      c.lastMessage.toLowerCase().includes(q)
    );
  }, [recent, searchQuery]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return { online, offline };
    const q = searchQuery.toLowerCase();
    return {
      online: online.filter(u => u.name.toLowerCase().includes(q)),
      offline: offline.filter(u => u.name.toLowerCase().includes(q)),
    };
  }, [online, offline, searchQuery]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-row">
          <div className="brand-mark">
            <img src="/ubridge-logo.svg" alt="UBridge" />
            <div className="brand-copy">
              <strong>UBridge</strong>
              <span>P2P Messenger</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="theme-toggle" onClick={() => store.toggleTheme()} aria-label="Toggle theme">
              <UIcon name={store.theme === "dark" ? "sun" : "moon"} size={18} />
            </button>
            <button className="icon-button" onClick={() => store.setInfoOpen(!store.isInfoOpen)} aria-label="Info">
              <UIcon name="info" size={18} />
            </button>
          </div>
        </div>

        <div className="search-box">
          <span className="search-icon"><UIcon name="search" size={16} /></span>
          <input 
            className="search-input" 
            placeholder="Chat, odam yoki xabar qidirish" 
            value={searchQuery} 
            onChange={(e) => onSearchChange(e.target.value)} 
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => onSearchChange("")}>
              <UIcon name="close" size={14} />
            </button>
          )}
        </div>

        <div className="p2p-badge">
          <UIcon name="shield" size={12} /> 
          P2P • E2E • {bgConnectedPeers?.size || 0} BG
        </div>

        <div className="filter-tabs">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "online" ? "active" : ""} onClick={() => setFilter("online")}>Online</button>
        </div>
      </div>

      <div className="sidebar-scroll">
        {searchQuery && searchResults.length > 0 && (
          <Section title={`Messages (${searchResults.length})`}>
            {searchResults.map(r => (
              <button key={r.messageId} className="chat-item" onClick={() => {
                const chat = chats.find(c => c.id === r.chatId);
                if (chat) {
                  const u = users.find(x => x.user_id === chat.peerId) || { 
                    user_id: chat.peerId, 
                    name: chat.title, 
                    online: false, 
                    status: null, 
                    relay: null, 
                    last_seen: null 
                  };
                  onChatSelect(u);
                }
              }}>
                <div className="avatar"><UIcon name="search" size={16} /></div>
                <div className="chat-main">
                  <div className="chat-name">{r.text.slice(0, 40)}</div>
                  <div className="chat-preview">{formatTime(r.at)}</div>
                </div>
              </button>
            ))}
          </Section>
        )}

        {pinned.length > 0 && filter === "all" && (
          <Section title="Mahkamlangan" count={pinned.length}>
            {pinned.map(c => (
              <ChatButton 
                key={c.id} 
                chat={c} 
                active={activeChatId === c.id} 
                onClick={() => {
                  const u = users.find(x => x.user_id === c.peerId) || { 
                    user_id: c.peerId, 
                    name: c.title, 
                    online: false, 
                    status: null, 
                    relay: null, 
                    last_seen: null 
                  };
                  onChatSelect(u);
                }} 
              />
            ))}
          </Section>
        )}

        {(filter === "all" || filteredChats.length > 0) && (
          <Section title="Chatlar" count={filteredChats.length}>
            {filteredChats.map(c => (
              <ChatButton 
                key={c.id} 
                chat={c} 
                active={activeChatId === c.id} 
                onClick={() => {
                  const u = users.find(x => x.user_id === c.peerId) || { 
                    user_id: c.peerId, 
                    name: c.title, 
                    online: false, 
                    status: null, 
                    relay: null, 
                    last_seen: null 
                  };
                  onChatSelect(u);
                }} 
              />
            ))}
            {filteredChats.length === 0 && searchQuery && (
              <div className="empty-filter">Hech qanday chat topilmadi</div>
            )}
          </Section>
        )}
      </div>

      <div className="sidebar-bottom">
        <Section title={`Online • ${filteredUsers.online.length}`}>
          {filteredUsers.online.map(u => (
            <UserButton 
              key={u.user_id} 
              u={u} 
              active={false} 
              onClick={() => onUserSelect(u)} 
              bgConnected={bgConnectedPeers?.has(u.user_id)}
            />
          ))}
          {filteredUsers.online.length === 0 && <div className="empty-filter">Hech kim online emas</div>}
        </Section>
        
        {filter === "all" && (
          <Section title={`Offline • ${filteredUsers.offline.length}`}>
            {filteredUsers.offline.map(u => (
              <UserButton 
                key={u.user_id} 
                u={u} 
                active={false} 
                onClick={() => onUserSelect(u)} 
              />
            ))}
          </Section>
        )}
      </div>
    </aside>
  );
}
