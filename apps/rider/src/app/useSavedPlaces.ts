"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { createIsolatedBrowserSupabaseClient } from "@esh-platform/supabase";
import type { AddressSuggestion } from "@esh-platform/maps";
import { parseSavedPlaces, placeName, type PlaceKey, type SavedPlace } from "../lib/saved-places";

export function useSavedPlaces(client: ReturnType<typeof createIsolatedBrowserSupabaseClient> | null,
  tenantSlug: string, scope: string | null) {
  const current = useRef(scope); current.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState<{ scope: string | null; places: SavedPlace[]; loading: boolean; busy: boolean; error: string; feedback: string }>(
    { scope: null, places: [], loading: false, busy: false, error: "", feedback: "" });
  const refresh = useCallback(async () => {
    if (!client || !scope) return;
    const request = ++generation.current;
    setState((old) => ({ ...old, scope, places: old.scope === scope ? old.places : [], loading: true, error: "" }));
    try {
      const { data, error } = await client.rpc("my_rider_saved_places", { target_tenant_slug: tenantSlug });
      if (error) throw error;
      const places = parseSavedPlaces(data);
      if (current.current === scope && request === generation.current)
        setState((old) => ({ ...old, places, loading: false }));
    } catch {
      if (current.current === scope && request === generation.current)
        setState((old) => ({ ...old, loading: false, error: "Saved addresses could not be loaded. Retry when you are online." }));
    }
  }, [client, scope, tenantSlug]);
  useEffect(() => {
    setState({ scope, places: [], loading: Boolean(scope), busy: false, error: "", feedback: "" });
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible); document.addEventListener("visibilitychange", onVisible);
    return () => { ++generation.current; window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [scope, refresh]);

  async function mutate(key: PlaceKey, address?: AddressSuggestion) {
    if (!client || !scope) return false;
    const expected_rider_profile_id = scope.split(":").at(-1)!;
    ++generation.current;
    setState((old) => ({ ...old, busy: true, loading: false, error: "", feedback: "" }));
    try {
      if (address) {
        const session = await client.auth.getSession();
        if (session.error || !session.data.session || current.current !== scope) return false;
        const response = await fetch("/api/places", {
          method: "POST", headers: { Authorization: `Bearer ${session.data.session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tenantSlug, riderProfileId: expected_rider_profile_id, key,
            label: address.label, latitude: address.latitude, longitude: address.longitude }),
        });
        if (!response.ok) {
          const body = await response.json() as { message?: string };
          throw new Error(body.message || "Your address could not be saved. Refresh before retrying.");
        }
      } else {
        const result = await client.rpc("remove_my_rider_place", { target_tenant_slug: tenantSlug, expected_rider_profile_id, place_key_value: key });
        if (result.error) throw result.error;
      }
      if (current.current !== scope) return false;
      // Do not invent an optimistic saved address after an uncertain server write.
      await refresh();
      if (current.current !== scope) return false;
      setState((old) => ({ ...old, feedback: `${placeName(key)} ${address ? "saved" : "removed"}.` }));
      return true;
    } catch (error) {
      if (current.current === scope) setState((old) => ({ ...old, error: error instanceof Error ? error.message : "Your saved address could not be updated. Retry or refresh to check its status." }));
      return false;
    } finally { if (current.current === scope) setState((old) => ({ ...old, busy: false })); }
  }
  return { ...(state.scope === scope ? state : { places: [], loading: Boolean(scope), busy: false, error: "", feedback: "" }),
    refresh, save: (key: PlaceKey, address: AddressSuggestion) => mutate(key, address), remove: (key: PlaceKey) => mutate(key) };
}
