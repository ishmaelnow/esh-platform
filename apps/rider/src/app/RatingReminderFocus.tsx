"use client";

import { useEffect, useRef } from "react";

export function RatingReminderFocus({ bookingId, trips, ready, intent }: {
  bookingId: string | null;
  trips: Array<{ bookingId: string; canSubmit: boolean; submittedRating: unknown }>;
  ready: boolean;
  intent?: "received" | "review" | undefined;
}) {
  const trip = trips.find((item) => item.bookingId === bookingId);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !trip || focused.current === trip.bookingId) return;
    const focus = () => {
    if (focused.current === trip.bookingId) return;
    const card = document.getElementById(`${intent ? "rating-details" : "rating"}-${trip.bookingId}`);
    let panel = card?.closest("details");
    while (panel) { panel.open = true; panel = panel.parentElement?.closest("details") ?? null; }
    const formPanel = card?.querySelector("details");
    if (formPanel && !intent) formPanel.open = true;
    card?.scrollIntoView({ block: "start", behavior: "auto" });
    card?.focus({ preventScroll: true });
    if (card) focused.current = trip.bookingId;
    };
    focus();
    const observer = new MutationObserver(focus);
    if (focused.current !== trip.bookingId) observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ready, trip, intent]);
  if (!bookingId || !ready) return null;
  return !trip ? <p role="status">This rating is unavailable for this account. Refresh your trips to check again.</p>
    : intent ? null : trip.submittedRating ? <p role="status">You already rated this trip. Thank you.</p>
    : !trip.canSubmit ? <p role="status">The rating window for this trip has closed.</p> : null;
}

