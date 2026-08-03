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
  if ((window as unknown as { UFlowIcons?: unknown }).UFlowIcons) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://uflow.uz/icons.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://uflow.uz/icons.js";
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }
  return loading;
}

export default function UIcon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { void ensureIcons().then(() => setReady(true)); }, []);
  if (!ready) return <span className={`icon-fallback ${className}`} style={{ width: size, height: size }} />;
  return createElement("u-icon", { name, size: String(size), animated: "", className });
}
