"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient, type SupabaseAuthSession } from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

type InvitationStatus =
  | "loading"
  | "missing_token"
  | "invalid_token"
  | "expired"
  | "cancelled"
  | "already_accepted"
  | "authentication_required"
  | "confirmation_required"
  | "email_mismatch"
  | "success"
  | "error";

type AcceptanceResult = {
  status: InvitationStatus;
  tenant_id?: string | null;
  redirect_to?: string;
  tenant_display_name?: string | null;
  intended_role?: string | null;
  invitation_email?: string | null;
};

type InvitationDetails = {
  tenantDisplayName: string;
  intendedRole: string;
  invitationEmail: string;
};

export function InvitationAcceptanceApp() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [status, setStatus] = useState<InvitationStatus>("loading");
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function signOut() {
    if (!supabase) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
      setSubmitting(false);
    }
  }

  const inspectInvitation = useCallback(
    async (activeSession: SupabaseAuthSession | null) => {
      if (!token) {
        setStatus("missing_token");
        return;
      }

      const result = await postInvitationRequest("/api/invitations/inspect", token, activeSession);
      const nextStatus = normalizeStatus(result.status);

      if (result.tenant_display_name && result.intended_role && result.invitation_email) {
        setDetails({
          tenantDisplayName: result.tenant_display_name,
          intendedRole: result.intended_role,
          invitationEmail: result.invitation_email,
        });
      }

      if (nextStatus === "pending") {
        setStatus(activeSession ? "authentication_required" : "authentication_required");
        return;
      }

      if (nextStatus === "accepted") {
        setStatus("success");
        return;
      }

      setStatus(nextStatus);
    },
    [token],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      void inspectInvitation(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void inspectInvitation(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [inspectInvitation, supabase]);

  async function acceptInvitation() {
    if (!session) {
      setStatus("authentication_required");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const result = await postInvitationRequest("/api/invitations/accept", token, session);
    const nextStatus = normalizeStatus(result.status);
    setSubmitting(false);

    if (nextStatus === "accepted") {
      setStatus("success");
      window.setTimeout(() => {
        window.location.assign(result.redirect_to ?? "/");
      }, 900);
      return;
    }

    if (nextStatus === "pending") {
      setStatus("authentication_required");
      return;
    }

    setStatus(nextStatus);
    setMessage(result.message ?? null);
  }

  return (
    <main className="signed-out-shell">
      <section className="sign-in-panel">
        <p className="eyebrow">Invitation</p>
        <h1>Accept Invitation</h1>
        {details ? (
          <dl className="definition-list invitation-details">
            <div>
              <dt>Organization</dt>
              <dd>{details.tenantDisplayName}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{details.intendedRole}</dd>
            </div>
            <div>
              <dt>Invited email</dt>
              <dd>{details.invitationEmail}</dd>
            </div>
          </dl>
        ) : null}
        <InvitationState status={status} />

        {status === "authentication_required" ? (
          session ? (
            <div className="form-grid">
              <p className="notice">
                Signed in as {session.user.email}. Accepting will verify this email against the
                invitation.
              </p>
              <button
                className="primary-button"
                disabled={submitting}
                onClick={() => void acceptInvitation()}
                type="button"
              >
                {submitting ? "Accepting invitation" : "Accept invitation"}
              </button>
              <button
                className="secondary-button"
                disabled={submitting}
                onClick={() => void signOut()}
                type="button"
              >
                {submitting ? "Signing out…" : "Sign in with another account"}
              </button>
            </div>
          ) : (
            <InvitationAuthForm
              details={details}
              onAuthenticated={() => void inspectInvitation(session)}
              token={token}
            />
          )
        ) : null}

        {status === "success" ? (
          <Link className="primary-button" href="/">
            Continue to Tenant Administration
          </Link>
        ) : null}

        {message ? <p className="form-error">{message}</p> : null}
      </section>
    </main>
  );
}

function InvitationAuthForm({
  details,
  onAuthenticated,
  token,
}: {
  details: InvitationDetails | null;
  onAuthenticated: () => void;
  token: string;
}) {
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [email, setEmail] = useState(details?.invitationEmail ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);

  async function authenticate(mode: "sign_in" | "sign_up") {
    setMessage(null);

    if (!supabase) {
      setMessage("Account service is not ready. Please try again.");
      return;
    }

    if (details && email.trim().toLowerCase() !== details.invitationEmail.toLowerCase()) {
      setMessage("Use the invited email address for this invitation.");
      return;
    }

    if (mode === "sign_up" && password !== passwordConfirmation) {
      setMessage("Passwords do not match.");
      return;
    }

    const result =
      mode === "sign_in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}`,
            },
          });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "sign_up" && !result.data.session) {
      setMessage("Check your email to confirm the new account, then reopen this invitation link.");
      return;
    }

    onAuthenticated();
  }

  async function requestPasswordReset() {
    setMessage(null);
    setResetRequested(false);

    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, token }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setMessage(payload?.message ?? "Unable to request password reset.");
      return;
    }

    setResetRequested(true);
  }

  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        void authenticate("sign_in");
      }}
    >
      <label>
        Email
        <input
          autoComplete="email"
          disabled={Boolean(details)}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        Password
        <input
          autoComplete="current-password"
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
          onChange={(event) => setPasswordConfirmation(event.target.value)}
          type="password"
          value={passwordConfirmation}
        />
      </label>
      {message ? <p className="form-error">{message}</p> : null}
      {resetRequested ? (
        <p className="notice">Password reset email sent. Check your inbox to continue.</p>
      ) : null}
      <button className="primary-button" type="submit">
        Sign in and continue
      </button>
      <button
        className="secondary-button"
        onClick={() => void authenticate("sign_up")}
        type="button"
      >
        Create credentials
      </button>
      <button
        className="secondary-button"
        onClick={() => void requestPasswordReset()}
        type="button"
      >
        Forgot password
      </button>
    </form>
  );
}

function InvitationState({ status }: { status: InvitationStatus }) {
  const copy: Record<InvitationStatus, string> = {
    loading: "Checking this invitation.",
    missing_token: "This invitation link is missing a token.",
    invalid_token: "This invitation link is invalid.",
    expired: "This invitation has expired.",
    cancelled: "This invitation has been cancelled.",
    already_accepted: "This invitation has already been accepted.",
    authentication_required: "Sign in or create credentials using the invited email address.",
    confirmation_required:
      "Check your email to confirm the new account, then reopen this invitation link.",
    email_mismatch: "The signed-in account email does not match this invitation.",
    success: "Invitation accepted. Redirecting to Tenant Administration.",
    error: "Unable to process this invitation.",
  };

  return <p className={status === "error" ? "form-error" : "muted"}>{copy[status]}</p>;
}

async function postInvitationRequest(
  path: string,
  token: string,
  session: SupabaseAuthSession | null,
): Promise<AcceptanceResult & { message?: string }> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (AcceptanceResult & { message?: string })
    | null;

  if (!response.ok && payload?.status) {
    return payload;
  }

  if (!response.ok) {
    return {
      status: "error",
      message: payload?.message ?? "The invitation request failed.",
    };
  }

  return payload ?? { status: "error" };
}

function normalizeStatus(status: string | undefined): InvitationStatus | "pending" | "accepted" {
  if (
    status === "pending" ||
    status === "accepted" ||
    status === "missing_token" ||
    status === "invalid_token" ||
    status === "expired" ||
    status === "cancelled" ||
    status === "already_accepted" ||
    status === "authentication_required" ||
    status === "confirmation_required" ||
    status === "email_mismatch" ||
    status === "success" ||
    status === "error"
  ) {
    return status;
  }

  return "error";
}
