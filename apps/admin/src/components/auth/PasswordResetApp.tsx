"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

export function PasswordResetApp() {
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("token")?.trim() ?? "";
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!supabase) {
      setMessage("Account service is not ready. Please try again.");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      return;
    }

    setComplete(true);
  }

  const acceptHref = invitationToken
    ? `/invite/accept?token=${encodeURIComponent(invitationToken)}`
    : "/invite/accept";

  return (
    <main className="signed-out-shell">
      <section className="sign-in-panel">
        <p className="eyebrow">Password Reset</p>
        <h1>Set New Password</h1>
        <p className="muted">
          After setting a new password, continue to your ESH invitation.
        </p>

        {complete ? (
          <Link className="primary-button" href={acceptHref}>
            Continue to invitation
          </Link>
        ) : (
          <form className="form-grid" onSubmit={(event) => void submit(event)}>
            <label>
              New password
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </label>
            {message ? <p className="form-error">{message}</p> : null}
            <button className="primary-button" type="submit">
              Update password
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
