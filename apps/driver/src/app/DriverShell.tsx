"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RiderHomeMap } from "@esh-platform/maps/client";

export type DriverView = "home" | "profile" | "notifications" | "recent" | "preorders" | "overview" | "dispatch" | "earnings" | "location" | "reputation" | "service_areas" | "documents" | "vehicle";
export function DriverIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    back: <path d="m14 5-7 7 7 7M7 12h14" />,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    notifications: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 13h5v4h-5z" /></>,
    recent: <><path d="M4 7a9 9 0 1 1-1 7M4 3v5h5M12 7v6l4 2" /></>,
    settings: <><path d="m12 2 8 5v10l-8 5-8-5V7z" /><circle cx="12" cy="12" r="3" /></>,
    area: <><path d="m12 2 9 5v10l-9 5-9-5V7z" /><path d="m8 12 3 3 5-6" /></>,
    car: <><path d="m4 10 2-6h12l2 6v9H4zM4 11h16M7 19v2m10-2v2M7 14h1m8 0h1" /></>,
    traffic: <><rect x="8" y="2" width="8" height="18" rx="3" /><circle cx="12" cy="6" r="1" /><circle cx="12" cy="11" r="1" /><circle cx="12" cy="16" r="1" /><path d="M12 20v3" /></>,
    locate: <><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></>,
    sharing: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="m4 8 5 2m6 0 5-2M12 15v6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] ?? paths.settings}</svg>;
}

export function DriverShell({ view, onView, children, accessToken, loading, center, location, locationNotice, onLocate,
  locationBusy, recenterVersion, rating, totals, online, availabilityKnown, availabilityBusy, onAvailability,
  availabilityNotice, tripCount, offerCount, sharing }: {
  view: DriverView; onView: (view: DriverView) => void; children: ReactNode; accessToken?: string | undefined;
  loading: boolean;
  center: { latitude: number; longitude: number } | null;
  location: { latitude: number; longitude: number; accuracy: number } | null;
  locationNotice: string | null; onLocate: () => void; locationBusy: boolean; recenterVersion: number;
  rating: string | null; totals: { trips: number | null; earnings: string | null; fees: string | null };
  online: boolean; availabilityKnown: boolean; availabilityBusy: boolean; onAvailability: () => void;
  availabilityNotice: string | null; tripCount: number; offerCount: number; sharing: boolean;
}) {
  const [drawer, setDrawer] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [preorderTab, setPreorderTab] = useState("assigned");
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const home = view === "home";
  const closeDrawer = () => { if ((window.history.state as { driverDrawer?: boolean } | null)?.driverDrawer) window.history.back(); else setDrawer(false); };
  useEffect(() => {
    const dismiss = () => setDrawer(false);
    window.addEventListener("popstate", dismiss);
    return () => window.removeEventListener("popstate", dismiss);
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); window.history.back(); }
      if (event.key === "Tab") {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0]!, last = buttons[buttons.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [drawer]);
  const labels: Partial<Record<DriverView, string>> = { profile: "Profile", notifications: "Notifications", earnings: "Wallet", recent: "Recent orders", overview: "Settings", dispatch: "Dispatch", location: "Location", reputation: "Ratings", service_areas: "Operating areas", documents: "Documents", vehicle: "Vehicle" };
  return <main className={`driver-shell ${home ? "driver-map-home" : "driver-secondary"}`} aria-busy={loading}>
    {home ? <>
      <div className="driver-map"><RiderHomeMap accessToken={accessToken} center={center} currentLocation={location}
        recenterVersion={recenterVersion} showTraffic={Boolean(accessToken && traffic)} /></div>
      <section className="driver-total" aria-label="Today's totals">
        <div><h2>Today’s total</h2><p>{loading ? "Loading trips…" : `${totals.trips ?? "—"} completed trips`}</p><p>Distance traveled <span>Unavailable</span></p><p>Time online <span>Unavailable</span></p></div>
        <div className="driver-total-money"><strong>{loading ? "…" : totals.earnings ?? "—"}</strong><span>{loading ? "Loading earnings…" : totals.fees ? `${totals.fees} platform fees` : "Earnings unavailable"}</span><small>Earned · not paid out</small></div>
      </section>
      <div className="driver-map-actions driver-actions-left">
        <button type="button" className="driver-circle" aria-label="Location sharing settings" onClick={() => onView("location")} aria-pressed={sharing}><DriverIcon name="sharing" /></button>
        {(tripCount > 0 || offerCount > 0) ? <button type="button" className="driver-circle" aria-label="Open active trips and offers" onClick={() => onView("dispatch")}><DriverIcon name="recent" /></button> : null}
      </div>
      <div className="driver-map-actions driver-actions-right">
        <button type="button" className="driver-circle" aria-label="Operating areas" onClick={() => onView("service_areas")}><DriverIcon name="area" /></button>
        <button type="button" className="driver-circle" aria-label="Vehicle and compliance" onClick={() => onView("vehicle")}><DriverIcon name="car" /></button>
        {accessToken ? <button type="button" className="driver-circle" aria-label="Show traffic" aria-pressed={traffic} onClick={() => setTraffic((value) => !value)}><DriverIcon name="traffic" /></button> : null}
        <button type="button" className="driver-circle" aria-label="Center on my location" disabled={locationBusy} onClick={onLocate}><DriverIcon name="locate" /></button>
      </div>
      {(locationNotice || availabilityNotice || !availabilityKnown) ? <div className="driver-home-notice" role="status">{locationNotice ?? availabilityNotice ?? "Availability unavailable. Open Settings to retry."}</div> : null}
      {(tripCount > 0 || offerCount > 0) ? <button className="driver-trip-banner" type="button" onClick={() => onView("dispatch")}>{offerCount ? `${offerCount} new trip offer${offerCount === 1 ? "" : "s"} · View now` : "Active trip · Open controls"}</button> : null}
      <footer className="driver-home-bottom">
        <button className="driver-preorders-link" type="button" onClick={() => onView("preorders")}>Preorders <span>(—)</span><span aria-hidden="true">›</span></button>
        <div className={`driver-availability ${online ? "is-online" : "is-offline"}`} aria-busy={availabilityBusy}>
          <span>OFFLINE</span><button type="button" role="switch" aria-label="Driver availability" aria-checked={online}
            disabled={availabilityBusy || !availabilityKnown} onClick={onAvailability}><span /></button><span>ONLINE</span>
          {availabilityBusy ? <small role="status">Updating availability…</small> : !availabilityKnown ? <small>Status unavailable</small> : null}
        </div>
      </footer>
    </> : view === "preorders" ? <section className="driver-preorders">
      <button className="driver-circle driver-page-back" type="button" aria-label="Back to home" onClick={() => onView("home")}><DriverIcon name="back" /></button>
      <h1>Preorders</h1>
      <label className="preorder-setting">Receive while offline<input type="checkbox" role="switch" disabled aria-describedby="preorders-unavailable" /></label>
      <div className="preorder-tabs" role="tablist" aria-label="Preorders">
        {([['assigned', 'Assigned to me'], ['new', 'New']] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={preorderTab === id} aria-controls="preorder-content" id={`preorder-${id}`} key={id} onClick={() => setPreorderTab(id)}>{label} <span>—</span></button>)}
      </div>
      <div className="preorder-empty" id="preorder-content" role="tabpanel" aria-labelledby={`preorder-${preorderTab}`}>
        <svg viewBox="0 0 80 64" aria-hidden="true"><rect x="12" y="8" width="48" height="36" rx="6" /><rect x="20" y="18" width="48" height="36" rx="6" /><path d="M30 30h28M30 40h18" /></svg>
        <h2>Preorders aren’t available yet</h2><p id="preorders-unavailable">Advance assignments and receiving preorders while offline aren’t supported by your driver portal yet. Scheduled rides enter normal dispatch when they are ready.</p>
        <button className="secondary" type="button" onClick={() => onView("dispatch")}>View current offers and trips</button>
      </div>
    </section> : <section className="driver-page">
      <header><button className="driver-circle" type="button" aria-label="Back to home" onClick={() => onView("home")}><DriverIcon name="back" /></button><h1>{labels[view]}</h1></header>
      {children}
    </section>}
    <button ref={toggle} className="driver-circle driver-menu-toggle" type="button" aria-label="Open driver menu" aria-expanded={drawer} aria-controls={drawer ? "driver-drawer" : undefined}
      onClick={() => { window.history.pushState({ ...window.history.state, driverView: view, driverDrawer: true }, ""); setDrawer(true); }}><DriverIcon name="menu" /></button>
    {drawer ? <div className="driver-drawer-backdrop" onClick={closeDrawer}>
      <div className="driver-drawer" id="driver-drawer" role="dialog" aria-modal="true" aria-label="Driver menu" ref={panel} onClick={(event) => event.stopPropagation()}>
        <button className="drawer-close" type="button" aria-label="Close driver menu" onClick={closeDrawer}>×</button>
        <nav aria-label="Driver sections">{([
          ["profile", "Profile", "profile"], ["notifications", "Notifications", "notifications"], ["earnings", "Wallet", "wallet"], ["recent", "Recent orders", "recent"], ["overview", "Settings", "settings"],
        ] as const).map(([id, label, icon]) => <button type="button" key={id} onClick={() => { window.history.replaceState({ ...window.history.state, driverDrawer: false }, ""); setDrawer(false); onView(id); }}>
          <DriverIcon name={icon} /><strong>{label}</strong>{id === "profile" ? <span className="driver-rating"><span aria-hidden="true">★</span> {rating ?? "—"}</span> : null}
        </button>)}</nav>
      </div>
    </div> : null}
  </main>;
}
