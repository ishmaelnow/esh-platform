"use client";
import { placeName, type PlaceKey, type SavedPlace } from "../lib/saved-places";
import { useState } from "react";
import type { AddressSuggestion, GeocodingContext } from "@esh-platform/maps";
import { RiderPlaceEditor } from "./RiderPlaceEditor";

export function RiderSavedPlaces({ places, busy, loading, error, feedback, accessToken, context, onSave, onRemove, onRefresh }: {
  places: SavedPlace[]; busy: boolean; loading: boolean; error: string; feedback: string;
  accessToken: string | undefined; context: GeocodingContext | null;
  onSave: (key: PlaceKey, address: AddressSuggestion) => Promise<boolean>; onRemove: (key: PlaceKey) => void; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<PlaceKey | null>(null);
  return <article className="card saved-places-card">
    <div><h3>Your destinations</h3><p>Save Home and Work for this account and transportation provider, across your devices.</p></div>
    {(["home", "work"] as const).map((key) => <div className="saved-place-row" key={key}>
      <div><strong>{placeName(key)}</strong><p>{places.find((place) => place.key === key)?.label || "Not saved"}</p></div>
      <div className="saved-place-buttons">
        <button className="button secondary compact" type="button" disabled={busy || loading} onClick={() => setEditing(key)}>{places.some((place) => place.key === key) ? "Edit" : "Add"} {placeName(key)}</button>
        {places.some((place) => place.key === key) ? <button className="button secondary compact" type="button" disabled={busy || loading} onClick={() => onRemove(key)}>Remove {placeName(key)}</button> : null}
      </div>
    </div>)}
    {editing ? <RiderPlaceEditor key={editing} placeKey={editing} initialLabel={places.find((place) => place.key === editing)?.label || ""}
      accessToken={accessToken} context={context} busy={busy} onSave={onSave} onCancel={() => setEditing(null)} /> : null}
    {loading ? <p role="status">Loading saved addresses…</p> : null}
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    {feedback ? <p role="status">{feedback}</p> : null}
    <button className="button secondary compact" type="button" disabled={busy || loading} onClick={onRefresh}>Refresh saved addresses</button>
  </article>;
}
