"use client";
import UIcon from "../UIcon";

interface HeaderPopupProps {
  x: number;
  y: number;
  onClose: () => void;
  onInfo: () => void;
  onSearch: () => void;
  onMute: () => void;
  onClear: () => void;
  onBlock: () => void;
  t: any;
  isMuted?: boolean;
}

export function HeaderPopup({ x, y, onClose, onInfo, onSearch, onMute, onClear, onBlock, t, isMuted }: HeaderPopupProps) {
  // Adjust position to stay in viewport
  const adjustedX = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 260 : x);
  const adjustedY = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 300 : y);

  return (
    <>
      <div className="popup-backdrop" onClick={onClose} />
      <div className="header-popup" style={{ left: adjustedX, top: adjustedY }}>
        <div className="popup-title">Chat options</div>
        
        <button onClick={() => { onInfo(); onClose(); }}>
          <UIcon name="info" size={18} /> {t.info || "Ma'lumot"}
        </button>
        
        <button onClick={() => { onSearch(); onClose(); }}>
          <UIcon name="search" size={18} /> Qidiruv
        </button>
        
        <button onClick={() => { onMute(); onClose(); }}>
          <UIcon name={isMuted ? "volume" : "volume-mute"} size={18} /> 
          {isMuted ? "Ovozni yoqish" : t.mute || "Ovozsiz"}
        </button>
        
        <div className="popup-divider" />
        
        <button onClick={() => { onClear(); onClose(); }}>
          <UIcon name="trash" size={18} /> {t.clear || "Tozalash"}
        </button>
        
        <button className="danger" onClick={() => { onBlock(); onClose(); }}>
          <UIcon name="close" size={18} /> {t.block || "Bloklash"}
        </button>
      </div>
    </>
  );
}
