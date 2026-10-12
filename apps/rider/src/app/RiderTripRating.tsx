"use client";

import { useState, type FormEvent } from "react";

export function RiderTripRating({ trip, busy, onSubmit }: {
  trip: { bookingId: string; canSubmit: boolean; submittedRating: { overall: number } | null };
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, bookingId: string) => void;
}) {
  const [overall, setOverall] = useState("");
  return <section className="rider-trip-rating" id={`rating-${trip.bookingId}`} tabIndex={-1} aria-label="Driver rating">
    {trip.submittedRating ? <p className="rating-thanks">You rated this trip ★ {trip.submittedRating.overall}/5</p>
      : trip.canSubmit ? <details>
        <summary>Rate your driver</summary>
        <form className="form-grid" onSubmit={(event) => onSubmit(event, trip.bookingId)}>
          <fieldset className="rating-stars wide">
            <legend>How was your trip?</legend>
            <div className="rating-star-options">
              {[1, 2, 3, 4, 5].map((score) => <label key={score}>
                <input type="radio" name="overall" value={score} required checked={overall === String(score)} onChange={(event) => setOverall(event.target.value)} aria-label={`${score} ${score === 1 ? "star" : "stars"}`} />
                <span aria-hidden="true" className={score <= Number(overall) ? "selected" : ""}>★</span>
              </label>)}
            </div>
          </fieldset>
          <div className="rating-criteria wide">{[["safety", "Safety"], ["communication", "Communication"], ["cleanliness", "Vehicle cleanliness"]].map(([name, label]) => (
            <label key={name}>{label}<select name={name} defaultValue="5" required>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
          ))}</div>
          <label className="wide">Optional comment<textarea name="comment" maxLength={1000} rows={2} /></label>
          <button className="button primary" disabled={busy || !overall}>Submit private rating</button>
        </form>
      </details> : <p className="area">The 30-day rating window has closed.</p>}
  </section>;
}
