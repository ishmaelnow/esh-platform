"use client";
import { useEffect, useRef, useState } from "react";
import { retrieveAddressSuggestion, suggestRegionalAddresses, validCoordinates, type AddressSuggestion, type GeocodingContext } from "@esh-platform/maps";
import { placeName, type PlaceKey } from "../lib/saved-places";

export function RiderPlaceEditor({ placeKey, initialLabel, accessToken, context, busy, onSave, onCancel }: {
  placeKey: PlaceKey; initialLabel: string; accessToken: string | undefined; context: GeocodingContext | null;
  busy: boolean; onSave: (key: PlaceKey, address: AddressSuggestion) => Promise<boolean>; onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialLabel);
  const [selection, setSelection] = useState<AddressSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchSession, setSearchSession] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const request = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); return () => { ++request.current; }; }, []);
  useEffect(() => {
    if (!accessToken || !context || selection) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void suggestRegionalAddresses({ accessToken, context, query, sessionToken: searchSession, types: "address", signal: controller.signal })
        .then((rows) => { if (!controller.signal.aborted) setSuggestions(rows); })
        .catch(() => { if (!controller.signal.aborted) setError("Address suggestions are unavailable. Try again when you are online."); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [accessToken, context, query, searchSession, selection]);
  async function select(suggestion: AddressSuggestion) {
    if (!accessToken) return;
    const id = ++request.current;
    setRetrieving(true); setError("");
    try {
      const address = await retrieveAddressSuggestion({ accessToken, mapboxId: suggestion.mapboxId, sessionToken: searchSession });
      if (id !== request.current) return;
      if (!validCoordinates(address.latitude, address.longitude)) throw new Error("Invalid location");
      setQuery(address.label); setSelection(address); setSuggestions([]);
    } catch { if (id === request.current) setError("This address could not be verified. Choose another suggestion."); }
    finally { if (id === request.current) setRetrieving(false); }
  }
  return <div className="saved-place-editor">
    <label htmlFor={`saved-${placeKey}-address`}>{placeName(placeKey)} address</label>
    <input id={`saved-${placeKey}-address`} ref={input} value={query} autoComplete="off" placeholder="Search for an address"
      disabled={busy || !accessToken || !context} onChange={(event) => {
        ++request.current; setRetrieving(false); setError(""); setQuery(event.target.value); setSelection(null);
        if (selection) setSearchSession(crypto.randomUUID());
      }} />
    {!accessToken || !context ? <p role="status">Address search is unavailable. Try again once your provider’s map coverage is loaded.</p> : null}
    {suggestions.length ? <div className="address-suggestions" role="listbox" aria-label={`${placeName(placeKey)} address suggestions`}>
      {suggestions.map((suggestion) => <button type="button" role="option" key={suggestion.mapboxId} disabled={busy || retrieving}
        onClick={() => void select(suggestion)}>{suggestion.label}</button>)}
    </div> : null}
    {selection ? <p role="status">Verified address selected</p> : null}
    {retrieving ? <p role="status">Verifying address…</p> : null}
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <div className="saved-place-buttons">
      <button className="button primary compact" type="button" disabled={busy || retrieving || !selection}
        onClick={() => { if (selection) void onSave(placeKey, selection).then((saved) => { if (saved) onCancel(); }); }}>
        {busy ? "Saving…" : `Save ${placeName(placeKey)}`}
      </button>
      <button className="button secondary compact" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
