"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function RiderSheet({ children, onClose, focusDestination = false, onHeightChange }: {
  children: ReactNode; onClose: () => void; focusDestination?: boolean; onHeightChange: (height: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = panel.current?.parentElement;
    if (!viewport || !element) return;
    const update = () => {
      const keyboardOpen = viewport.height < window.innerHeight * .8;
      element.classList.toggle("keyboard-open", keyboardOpen);
      element.style.setProperty("--visible-height", `${viewport.height}px`);
      element.style.setProperty("--visible-top", `${viewport.offsetTop}px`);
      if (keyboardOpen) {
        requestAnimationFrame(() => {
          const input = document.activeElement;
          if (input instanceof HTMLElement && panel.current?.contains(input)) input.scrollIntoView({ block: "nearest" });
        });
      }
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeightChange(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = panel.current;
    const initial = focusDestination ? dialog?.querySelector<HTMLInputElement>("#rider-destination-address") : null;
    (initial && !initial.disabled ? initial : dialog?.querySelector<HTMLButtonElement>("button"))?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [focusDestination]);
  return <div className="ride-sheet-backdrop">
    <div className="ride-sheet" role="dialog" aria-label="Request a ride" ref={panel}>
      <button className="sheet-close" onClick={onClose} type="button"><span aria-hidden="true">←</span> Home</button>
      {children}
    </div>
  </div>;
}
