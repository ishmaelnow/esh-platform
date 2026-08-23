"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

export function AdminSignIn() {
  const supabase = useMemo(() => typeof window === "undefined" ? null : createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null);
    if (!supabase) { setMessage("Supabase client is not ready."); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  return <main className="signed-out-shell"><section className="sign-in-panel">
    <p className="eyebrow">Admin</p><h1>Sign in</h1>
    <p className="muted">Use an existing Supabase Auth account with an active tenant membership.</p>
    <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
      <label>Email<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
      <label>Password<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
      {message ? <p className="form-error">{message}</p> : null}
      <button className="primary-button" type="submit">Sign in</button>
    </form>
  </section></main>;
}
