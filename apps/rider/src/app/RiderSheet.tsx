"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function RiderSheet({ children, onClose, focusDestination = false }: {
  children: ReactNode; onClose: () => void; focusDestination?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = panel.current;
    const initial = focusDestination ? dialog?.querySelector<HTMLInputElement>("#rider-destination-address") : null;
    (initial && !initial.disabled ? initial : dialog?.querySelector<HTMLButtonElement>("button"))?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href]"))
        .filter((item) => !item.matches(":disabled") && item.getClientRects().length > 0);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = bodyOverflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [focusDestination]);
  return <div className="ride-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="ride-sheet" role="dialog" aria-modal="true" aria-label="Request a ride" ref={panel}>
      <button className="sheet-close" onClick={onClose} type="button">← Back to map</button>
      {children}
    </div>
  </div>;
}
