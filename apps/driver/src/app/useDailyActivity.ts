"use client";

import { useEffect, useState } from "react";
import type { createIsolatedBrowserSupabaseClient } from "@esh-platform/supabase";
import type { DailyActivity } from "../lib/daily-activity";

export function useDailyActivity(client: ReturnType<typeof createIsolatedBrowserSupabaseClient> | null,
  scope: string | null, refreshKey: string) {
  const [result, setResult] = useState<{ scope: string; data: DailyActivity } | null>(null);
  useEffect(() => {
    setResult(null);
    if (!client || !scope) return;
    let cancelled = false;
    let pending = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (cancelled || pending || document.visibilityState !== "visible") return;
      pending = true;
      controller = new AbortController();
      const timer = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await client.rpc("my_driver_daily_activity").abortSignal(controller.signal);
        if (!cancelled) setResult(response.error || !response.data ? null : { scope, data: response.data as unknown as DailyActivity });
      } catch {
        if (!cancelled) setResult(null);
      } finally { window.clearTimeout(timer); pending = false; }
    };
    const update = () => { void refresh(); };
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelled = true; controller?.abort(); window.clearInterval(timer);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [client, scope, refreshKey]);
  return result?.scope === scope ? result.data : null;
}
