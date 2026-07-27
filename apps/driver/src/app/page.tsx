"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";

type DriverSummary = {
  driverProfileId: string;
  driverNumber: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: string;
  onboardingStatus: string;
  documentCompliance: boolean;
};

export default function DriverHome() {
  const supabase = useMemo(() => createIsolatedBrowserSupabaseClient("esh-driver-portal-auth"), []);
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Sign in with the email used for your application.");
  const [summary, setSummary] = useState<DriverSummary | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      setSummary(null);
      return;
    }
    void activateAndLoad();
    async function activateAndLoad() {
      setMessage("Connecting your approved driver account…");
      const activation = await supabase.rpc("activate_my_driver_account");
      if (activation.error) {
        setMessage(activation.error.message);
        return;
      }
      const result = await supabase.rpc("my_driver_portal_summary");
      if (result.error || !result.data) {
        setMessage(result.error?.message ?? "Driver profile is unavailable.");
        return;
      }
      setSummary(result.data as unknown as DriverSummary);
      setMessage("Driver account connected.");
    }
  }, [session, supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: false },
    });
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  return (
    <main className="shell">
      <section className="portal-card">
        <p className="eyebrow">Driver portal</p>
        <h1>ESH Platform</h1>
        {!session ? (
          <form onSubmit={(event) => void signIn(event)}>
            <label>
              Application email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <button type="submit">Email me a sign-in link</button>
          </form>
        ) : null}
        {summary ? (
          <div className="status-grid">
            <h2>{summary.displayName}</h2>
            <p>Driver #{summary.driverNumber}</p>
            <dl>
              <div>
                <dt>Driver status</dt>
                <dd>{summary.status}</dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd>{summary.onboardingStatus}</dd>
              </div>
              <div>
                <dt>Document compliance</dt>
                <dd>{summary.documentCompliance ? "satisfied" : "pending"}</dd>
              </div>
            </dl>
            <button
              className="secondary"
              onClick={() => void supabase.auth.signOut()}
              type="button"
            >
              Sign out
            </button>
          </div>
        ) : null}
        <p className="summary">{message}</p>
      </section>
    </main>
  );
}
