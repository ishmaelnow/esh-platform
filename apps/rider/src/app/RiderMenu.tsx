"use client";

import { useEffect, useRef, useState } from "react";

export type RiderView = "book" | "trips" | "account" | "payments" | "wallet";
const destinations: { id: RiderView; label: string; symbol: string }[] = [
  { id: "book", label: "Request", symbol: "+" },
  { id: "trips", label: "Trips", symbol: "↗" },
  { id: "payments", label: "Payments", symbol: "$" },
  { id: "wallet", label: "Wallet", symbol: "◇" },
  { id: "account", label: "Account", symbol: "○" },
];

export function RiderMenu({ activeView, onSelect }: { activeView: RiderView; onSelect: (view: RiderView) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  return <div className={`rider-donut${open ? " is-open" : ""}`} ref={root}>
    {open ? <nav id="rider-donut-links" className="donut-ring" aria-label="Rider sections">
      {destinations.map((item, index) => <button key={item.id}
        className={`donut-item donut-item-${index}`} aria-current={activeView === item.id ? "page" : undefined}
        type="button" onClick={() => { onSelect(item.id); setOpen(false); toggle.current?.focus(); }}>
        <span aria-hidden="true">{item.symbol}</span>{item.label}
      </button>)}
    </nav> : null}
    <button ref={toggle} className="donut-toggle" aria-expanded={open}
      aria-controls={open ? "rider-donut-links" : undefined} aria-label={open ? "Close rider menu" : "Open rider menu"}
      type="button" onClick={() => setOpen((value) => !value)}>
      {open ? <span aria-hidden="true">×</span> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>}
    </button>
  </div>;
}
