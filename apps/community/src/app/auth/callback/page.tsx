"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createIsolatedBrowserSupabaseClient } from "@esh-platform/supabase";

export default function CommunityAuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Completing Community sign-in…");
  const [error, setError] = useState("");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseAnonKey
        ? createIsolatedBrowserSupabaseClient("esh-community-auth", {
            url: supabaseUrl,
            anonKey: supabaseAnonKey,
            auth: { detectSessionInUrl: false },
          })
        : null,
    [supabaseAnonKey, supabaseUrl],
  );

  useEffect(() => {
    if (!supabase) {
      setError("Community sign-in is not configured. Please try again later.");
      return;
    }

    let cancelled = false;
    const callback = new URL(window.location.href);
    const invitation = callback.searchParams.get("invitation")?.trim() ?? "";
    const callbackError =
      callback.searchParams.get("error_description") ?? callback.searchParams.get("error");

    const complete = async () => {
      if (callbackError) throw new Error(callbackError);
      if (!invitation) throw new Error("This Community sign-in link is missing its invitation.");

      const code = callback.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      } else {
        const hash = new URLSearchParams(callback.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!accessToken || !refreshToken) {
          throw new Error("This sign-in link is invalid, expired, or has already been used.");
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw sessionError ?? new Error("Community sign-in did not create a session.");
      }
      setStatus("Signed in. Completing Community membership…");
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          authorization: `Bearer ${sessionData.session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ invitation }),
      });
      const result = (await response.json().catch(() => null)) as
        | { message?: string; status?: string }
        | null;
      if (!response.ok || result?.status !== "accepted") {
        throw new Error(result?.message ?? "Community membership could not be completed.");
      }

      if (!cancelled) {
        setStatus("Membership complete. Opening ESH Community…");
        router.replace("/");
      }
    };

    void complete().catch((value: unknown) => {
      if (!cancelled) setError(value instanceof Error ? value.message : "Sign-in failed.");
    });
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <main className="community-shell">
      <section className="community-card" aria-live="polite">
        <h1>ESH Community</h1>
        {error ? <p role="alert">{error}</p> : <p>{status}</p>}
        {error ? <Link href="/">Return to Community</Link> : null}
      </section>
    </main>
  );
}
