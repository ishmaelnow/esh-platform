"use client";

import { useEffect, useRef } from "react";

export function RatingReminderFocus({ bookingId, trips, ready }: {
  bookingId: string | null;
  trips: Array<{ bookingId: string; canSubmit: boolean; submittedRating: unknown }>;
  ready: boolean;
}) {
  const trip = trips.find((item) => item.bookingId === bookingId);
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !trip || focused.current === trip.bookingId) return;
    const card = document.getElementById(`rating-${trip.bookingId}`);
    const panel = card?.closest("details");
    if (panel) panel.open = true;
    card?.scrollIntoView({ block: "start", behavior: "auto" });
    card?.focus({ preventScroll: true });
    if (card) focused.current = trip.bookingId;
  }, [ready, trip]);
  if (!bookingId || !ready) return null;
  return !trip ? <p role="status">This rating is unavailable for this account. Refresh your trips to check again.</p>
    : trip.submittedRating ? <p role="status">You already rated this trip. Thank you.</p>
    : !trip.canSubmit ? <p role="status">The rating window for this trip has closed.</p> : null;
}

