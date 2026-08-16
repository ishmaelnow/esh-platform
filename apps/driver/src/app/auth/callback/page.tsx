"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createIsolatedBrowserSupabaseClient } from "@esh-platform/supabase";

export default function DriverAuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Completing secure sign-in…");
  const [error, setError] = useState("");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(
    () =>
      supabaseUrl && supabaseAnonKey
        ? createIsolatedBrowserSupabaseClient("esh-driver-portal-auth", {
            url: supabaseUrl,
            anonKey: supabaseAnonKey,
            auth: { detectSessionInUrl: false },
          })
        : null,
    [supabaseAnonKey, supabaseUrl],
  );

  useEffect(() => {
    if (!supabase) {
      setError("Driver sign-in is not configured. Please try again later.");
      return;
    }

    let cancelled = false;
    const callback = new URL(window.location.href);
    const callbackError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");

    const complete = async () => {
      if (callbackError) {
        setError(`Sign-in could not be completed: ${callbackError}`);
        return;
      }

      const code = callback.searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(`Sign-in could not be completed: ${exchangeError.message}`);
          return;
        }
      } else {
        const hash = new URLSearchParams(callback.hash.replace(/^#/, ""));
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!accessToken || !refreshToken) {
          setError("This sign-in link is missing its authentication details. Request a new link and try again.");
          return;
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          setError(`Sign-in could not be completed: ${sessionError.message}`);
          return;
        }
      }

      if (!cancelled) {
        setStatus("Signed in. Redirecting to ESH Driver…");
        router.replace("/");
      }
    };

    void complete().catch((value: unknown) => {
      if (!cancelled) {
        setError(value instanceof Error ? value.message : "Sign-in could not be completed.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  return (
    <main className="auth-callback-page">
      <section className="auth-callback-card" aria-live="polite">
        {error ? <p role="alert">{error}</p> : <p>{status}</p>}
        {error ? <Link href="/">Return to Driver sign-in</Link> : null}
      </section>
    </main>
  );
}
