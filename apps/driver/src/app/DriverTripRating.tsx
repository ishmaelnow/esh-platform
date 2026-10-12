"use client";

import { useState, type FormEvent } from "react";

export function DriverTripRating({ trip, busy, onSubmit }: {
  trip: { bookingId: string; canSubmit: boolean; submittedRating: { overall: number } | null };
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>, bookingId: string) => void;
}) {
  const [overall, setOverall] = useState("");
  return <section className="driver-trip-rating" id={`rating-${trip.bookingId}`} tabIndex={-1} aria-label="Passenger rating">
    {trip.submittedRating ? <p className="rating-thanks">You rated this trip ★ {trip.submittedRating.overall}/5</p>
      : trip.canSubmit ? <details>
        <summary>Rate your passenger</summary>
        <form className="upload-form" onSubmit={(event) => onSubmit(event, trip.bookingId)}>
          <fieldset className="rating-stars">
            <legend>How was your trip?</legend>
            <div className="rating-star-options">
              {[1, 2, 3, 4, 5].map((score) => <label key={score}>
                <input type="radio" name="overall" value={score} required checked={overall === String(score)} onChange={(event) => setOverall(event.target.value)} aria-label={`${score} ${score === 1 ? "star" : "stars"}`} />
                <span aria-hidden="true" className={score <= Number(overall) ? "selected" : ""}>★</span>
              </label>)}
            </div>
          </fieldset>
          <div className="rating-criteria">{[["communication", "Communication"], ["readiness", "Readiness"], ["respect", "Respect"]].map(([name, label]) => (
            <label key={name}>{label}<select name={name} defaultValue="5" required>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
          ))}</div>
          <label>Optional comment<textarea name="comment" maxLength={1000} rows={2} /></label>
          <button disabled={busy || !overall} type="submit">Submit private rating</button>
        </form>
      </details> : <p className="document-help">The 30-day rating window has closed.</p>}
  </section>;
}
