"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

export default function DriverApplicationPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tenantSlug, setTenantSlug] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const supabase = useMemo(
    () =>
      createIsolatedBrowserSupabaseClient(
        "esh-driver-application-auth",
        adminPublicConfig.supabase,
      ),
    [],
  );

  useEffect(() => {
    void params.then(({ tenantSlug: slug }) => setTenantSlug(slug));
  }, [params]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
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

  async function requestVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Sending verification email…");
    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    const { error } = await supabase.auth.signInWithOtp({
      email: verificationEmail.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectUrl.toString(),
        shouldCreateUser: true,
      },
    });
    setMessage(
      error
        ? error.message
        : "Verification email sent. Open the link on this device to continue your application.",
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage("Preparing files and submitting your application…");
    try {
      const form = new FormData(formElement);
      form.set("tenantSlug", tenantSlug);
      for (const field of ["personalPhoto", "vehiclePhoto", "document"]) {
        const file = form.get(field);
        if (file instanceof File && file.type.startsWith("image/")) {
          form.set(field, await reduceImage(file));
        }
      }
      const totalFileBytes = [...form.values()].reduce(
        (total, value) => total + (value instanceof File ? value.size : 0),
        0,
      );
      if (totalFileBytes > 4_000_000) {
        throw new Error(
          "The selected files are still too large. Use a reference document smaller than 1 MB.",
        );
      }
      if (!session) throw new Error("Verify your email before submitting.");
      const response = await fetch("/api/applications/driver", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to submit application.");
      setSubmitted(true);
      setMessage(null);
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit application.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="panel">
        <h1>Apply to drive</h1>
        <p>Verify your email before submitting personal details and evidence.</p>
        {authLoading ? <p className="notice">Checking verification status…</p> : null}
        {!authLoading && !session ? (
          <form className="settings-grid" onSubmit={(event) => void requestVerification(event)}>
            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setVerificationEmail(event.target.value)}
                required
                type="email"
                value={verificationEmail}
              />
            </label>
            <button className="primary-button" type="submit">
              Verify email to continue
            </button>
          </form>
        ) : null}
        {session && !submitted ? (
          <div className="notice">
            <strong>Verified email:</strong> {session.user.email}
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => void signOut()}
              type="button"
            >
              {submitting ? "Signing out…" : "Use a different email"}
            </button>
          </div>
        ) : null}
        {session && submitted ? (
          <div className="content-stack" role="status">
            <h2>Application received</h2>
            <p>
              Your application was submitted successfully using the verified email{" "}
              <strong>{session.user.email}</strong>.
            </p>
            <p>
              The company will review your information and evidence. You do not need to submit
              another application.
            </p>
            <p className="notice">
              Keep access to this email address. Account activation and any requests for replacement
              evidence will be sent there.
            </p>
          </div>
        ) : null}
        {session && !submitted ? (
          <form className="settings-grid" onSubmit={(event) => void submit(event)}>
            <label>
              Full name
              <input name="fullName" required />
            </label>
            <label>
              Email
              <input name="email" readOnly required type="email" value={session.user.email ?? ""} />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <label>
              Personal photo
              <input
                accept="image/jpeg,image/png"
                capture="user"
                name="personalPhoto"
                type="file"
                required
              />
            </label>
            <label>
              Vehicle photo
              <input
                accept="image/jpeg,image/png"
                capture="environment"
                name="vehiclePhoto"
                type="file"
                required
              />
            </label>
            <label>
              Reference document
              <input
                accept="image/jpeg,image/png,application/pdf"
                capture="environment"
                name="document"
                type="file"
                required
              />
            </label>
            <button className="primary-button" disabled={submitting || !tenantSlug} type="submit">
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        ) : null}
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
  );
}

async function reduceImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.58]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= 1_000_000) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    }
  }
  throw new Error(`${file.name} could not be reduced below 1 MB. Choose a smaller image.`);
}
