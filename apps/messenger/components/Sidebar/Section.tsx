"use client";
import { ReactNode } from "react";

export function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="sidebar-section">
      <div className="section-title">
        <span>{title}</span>
        {count !== undefined && <span className="section-count">{count}</span>}
      </div>
      <div className="section-list">{children}</div>
    </section>
  );
}
