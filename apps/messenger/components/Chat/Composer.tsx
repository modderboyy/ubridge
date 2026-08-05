"use client";
import { useRef } from "react";
import UIcon from "../UIcon";
import type { LocalMessage } from "../../lib/local-db";

interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onFileSelect: (file: File) => void;
  replyTo: LocalMessage | null;
  onCancelReply: () => void;
  editing: LocalMessage | null;
  onCancelEdit: () => void;
  t: any;
  disabled?: boolean;
}

export function Composer({ text, onTextChange, onSend, onFileSelect, replyTo, onCancelReply, editing, onCancelEdit, t, disabled }: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      {replyTo && (
        <div className="reply-bar">
          <div className="reply-content">
            <UIcon name="message" size={14} />
            <span>{t.reply || "Javob"}: {replyTo.text.slice(0, 60)}</span>
          </div>
          <button onClick={onCancelReply} className="reply-close">×</button>
        </div>
      )}
      
      {editing && (
        <div className="reply-bar editing">
          <div className="reply-content">
            <UIcon name="edit" size={14} />
            <span>{t.edit || "Tahrir"}</span>
          </div>
          <button onClick={onCancelEdit} className="reply-close">×</button>
        </div>
      )}

      <footer className="composer">
        <button className="round-button" title="Emoji" onClick={() => {}}>
          <span style={{ fontSize: 18 }}>😊</span>
        </button>

        <label className="round-button" title={t.file || "Fayl"}>
          <span style={{ fontSize: 20 }}>+</span>
          <input 
            ref={fileInputRef}
            type="file" 
            hidden 
            onChange={handleFileChange}
            accept="*/*"
          />
        </label>

        <textarea
          ref={textareaRef}
          className="composer-textarea"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.message || "Xabar yozing..."}
          disabled={disabled}
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 160) + "px";
          }}
        />

        <button 
          className="send-button" 
          onClick={onSend} 
          disabled={disabled || !text.trim()}
          aria-label="Send"
        >
          <UIcon name="send" size={18} />
        </button>
      </footer>
    </>
  );
}
