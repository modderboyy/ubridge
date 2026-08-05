"use client";
import UIcon from "../UIcon";

interface ContextMenuProps {
  x: number;
  y: number;
  onReply: () => void;
  onForward: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
  canEdit?: boolean;
  t: any;
}

export function ContextMenu({ x, y, onReply, onForward, onEdit, onCopy, onDelete, onClose, canEdit, t }: ContextMenuProps) {
  const adjustedX = Math.min(x, typeof window !== "undefined" ? window.innerWidth - 210 : x);
  const adjustedY = Math.min(y, typeof window !== "undefined" ? window.innerHeight - 280 : y);

  return (
    <>
      <div className="context-backdrop" onClick={onClose} />
      <div className="context-menu" style={{ left: adjustedX, top: adjustedY }}>
        <button onClick={onReply}>
          <UIcon name="message" size={16} /> {t.reply || "Javob"}
        </button>
        <button onClick={onForward}>
          <UIcon name="share" size={16} /> Forward
        </button>
        {canEdit && (
          <button onClick={onEdit}>
            <UIcon name="edit" size={16} /> {t.edit || "Tahrir"}
          </button>
        )}
        <button onClick={onCopy}>
          <UIcon name="copy" size={16} /> {t.copy || "Nusxa"}
        </button>
        <div className="context-divider" />
        <button className="danger" onClick={onDelete}>
          <UIcon name="trash" size={16} /> {t.del || "O'chirish"}
        </button>
      </div>
    </>
  );
}
