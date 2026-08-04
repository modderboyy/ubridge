"use client";

import { createElement, useEffect, useState } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "u-icon": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { name?: string; size?: string | number; animated?: string };
    }
  }
}

let loading: Promise<void> | null = null;

function ensureIcons() {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).UFlowIcons) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://uflow.uz/icons.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        // if already loaded
        if ((window as any).UFlowIcons) resolve();
        setTimeout(() => resolve(), 800);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://uflow.uz/icons.js";
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
      setTimeout(() => resolve(), 1200);
    });
  }
  return loading;
}

// Local fallback SVG icons - used if uflow icons not available
const fallbackIcons: Record<string, string> = {
  search: "🔍",
  moon: "🌙",
  sun: "☀️",
  "arrow-left": "←",
  phone: "📞",
  video: "📹",
  "video-off": "🚫📹",
  "mic-off": "🔇",
  mic: "🎤",
  volume: "🔊",
  "volume-mute": "🔇",
  close: "✕",
  send: "➤",
  message: "💬",
  share: "↗️",
  edit: "✏️",
  copy: "📋",
  trash: "🗑️",
  shield: "🛡️",
  database: "💾",
  link: "🔗",
  settings: "⚙️",
  info: "ℹ️",
  more: "⋯",
  file: "📄",
  download: "⬇️",
  lock: "🔒",
  check: "✓",
};

export default function UIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const [ready, setReady] = useState(false);
  const [hasUFlow, setHasUFlow] = useState(false);

  useEffect(() => {
    void ensureIcons().then(() => {
      setReady(true);
      setHasUFlow(!!(window as any).UFlowIcons);
    });
  }, []);

  if (!ready) return <span className={`icon-fallback ${className}`} style={{ width: size, height: size, display: "inline-block" }} />;

  if (hasUFlow) {
    try {
      return createElement("u-icon", { name, size: String(size), animated: "", className });
    } catch {
      // fallback
    }
  }

  // Fallback to emoji or text
  const fallback = fallbackIcons[name] || "•";
  return (
    <span className={`uicon-fallback ${className}`} style={{ fontSize: size * 0.75, width: size, height: size, display: "inline-grid", placeItems: "center", lineHeight: 1 }} aria-label={name}>
      {fallback}
    </span>
  );
}
