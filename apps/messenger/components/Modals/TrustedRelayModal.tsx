"use client";
import { useState, useMemo } from "react";
import UIcon from "../UIcon";

type UserRow = { user_id: string; name: string; online: boolean; status: string | null; relay: string | null; last_seen: string | null };

interface TrustedRelayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (selectedIds: string[]) => void;
  onlineUsers: UserRow[];
  bgConnected?: Set<string>;
  t: any;
  peerName: string;
}

export function TrustedRelayModal({ isOpen, onClose, onSend, onlineUsers, bgConnected, t, peerName }: TrustedRelayModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const trustedList = useMemo(() => {
    // UFlow server always at top - always online and fast
    const uflowUser = onlineUsers.find(u => 
      u.name.toLowerCase().includes("uflow") || 
      u.user_id.toLowerCase().includes("uflow") ||
      u.name.toLowerCase().includes("server")
    );
    
    let list = [...onlineUsers];
    
    // Sort: UFlow first, then BG connected, then online
    list.sort((a, b) => {
      const aIsUflow = a.name.toLowerCase().includes("uflow") || a.user_id.toLowerCase().includes("uflow");
      const bIsUflow = b.name.toLowerCase().includes("uflow") || b.user_id.toLowerCase().includes("uflow");
      if (aIsUflow && !bIsUflow) return -1;
      if (!aIsUflow && bIsUflow) return 1;
      
      const aBg = bgConnected?.has(a.user_id);
      const bBg = bgConnected?.has(b.user_id);
      if (aBg && !bBg) return -1;
      if (!aBg && bBg) return 1;
      
      return a.name.localeCompare(b.name);
    });

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => 
        u.name.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q) ||
        (u.status && u.status.toLowerCase().includes(q))
      );
    }

    return list.slice(0, 20); // Limit to 20 for performance
  }, [onlineUsers, bgConnected, search]);

  const toggleSelect = (userId: string) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelected(next);
  };

  const handleSend = () => {
    if (selected.size > 0) {
      onSend(Array.from(selected));
      setSelected(new Set());
      setSearch("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="trusted-modal">
      <div className="trusted-card">
        <div className="trusted-header">
          <h3>{t.trustedTitle || "Ishonchli relay tanlang"}</h3>
          <p>{t.trustedSub || "Offline foydalanuvchiga xabar yetkazish uchun ishonchli odamlar tanlang. UFlow eng tepasida, har doim ishlaydi."}</p>
          <div className="trusted-search-box">
            <UIcon name="search" size={16} />
            <input 
              placeholder="Odamlarni qidirish..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch("")} className="search-clear">
                <UIcon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="trusted-list">
          {trustedList.length === 0 ? (
            <div className="empty-trusted">
              <UIcon name="search" size={24} />
              <p>{search ? `"${search}" bo'yicha hech kim topilmadi` : "Hech kim online emas"}</p>
              <span>UFlow server har doim mavjud, qidirib ko'ring</span>
            </div>
          ) : (
            trustedList.map(u => {
              const isSelected = selected.has(u.user_id);
              const isUflow = u.name.toLowerCase().includes("uflow") || u.user_id.toLowerCase().includes("uflow");
              const isBg = bgConnected?.has(u.user_id);

              return (
                <div 
                  key={u.user_id} 
                  className={`trusted-item ${isSelected ? "selected" : ""} ${isUflow ? "uflow-item" : ""}`}
                  onClick={() => toggleSelect(u.user_id)}
                >
                  <div className="avatar">
                    {u.name[0]?.toUpperCase()}
                    <span className="online-dot" />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span>{u.name}</span>
                      {isUflow && <span className="trusted-badge uflow">⚡ {t.uflow || "UFlow"}</span>}
                      {isBg && <span className="trusted-badge bg">BG ⚡ Fast</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {isUflow ? "Har doim online • Tez relay server" : u.online ? "Online • Ishonchli relay" : "Offline"}
                    </div>
                  </div>

                  <div className="check">
                    {isSelected ? <UIcon name="check" size={14} /> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="trusted-footer">
          <div className="trusted-info">
            {selected.size > 0 && (
              <span>{selected.size} ta tanlandi • Xabar {peerName} ga {selected.size} ta relay orqali yetkaziladi</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="action-button" onClick={onClose}>Bekor qilish</button>
            <button 
              className="action-button primary" 
              disabled={selected.size === 0} 
              onClick={handleSend}
            >
              {t.sendViaTrusted || "Ishonchli orqali yuborish"} ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
