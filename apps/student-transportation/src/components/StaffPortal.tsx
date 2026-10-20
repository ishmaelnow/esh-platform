"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { readEnrollmentContext, type EnrollmentContext } from "../lib/enrollment";
import { studentRequestError, type StaffSection } from "../lib/staff";
import { CustomerPortal } from "./CustomerPortal";
import { EnrollmentPortal } from "./EnrollmentPortal";
import { FoundationScreen } from "./FoundationScreen";

export function StaffPortal({ initialSection = "requests" }: { initialSection?: StaffSection }) {
  const enabled = process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = useMemo(
    () =>
      enabled && url && key
        ? createIsolatedBrowserSupabaseClient("esh-student-transportation-auth", {
            url,
            anonKey: key,
          })
        : null,
    [enabled, url, key],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [context, setContext] = useState<EnrollmentContext | null>(null);
  const [tenantId, setTenant] = useState("");
  const [section, setSection] = useState<StaffSection>(initialSection);
  const [enrollmentMode, setEnrollmentMode] = useState<"school" | "admin">("admin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const pending = busy || workspaceBusy;
  const [revision, setRevision] = useState(0);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const program = context?.programs.find((p) => p.tenantId === tenantId);
  const onContext = useCallback((next: EnrollmentContext) => {
    setContext((prior) => (JSON.stringify(prior) === JSON.stringify(next) ? prior : next));
    setTenant((prior) =>
      next.programs.some((p) => p.tenantId === prior)
        ? prior
        : (next.programs.find((p) => p.enrollmentEnabled && (p.canReview || p.canEnroll))
            ?.tenantId ??
          next.programs[0]?.tenantId ??
          ""),
    );
  }, []);
  const onError = useCallback((error: unknown) => {
    generation.current++;
    setContext(null);
    setMessage(error instanceof Error ? error.message : "Staff workspace could not load.");
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!client) return;
    let active = true;
    const accept = (next: SupabaseAuthSession | null) => {
      if (!active) return;
      const nextId = next?.user.id ?? null;
      if (identity.current !== nextId) {
        identity.current = nextId;
        generation.current++;
        setContext(null);
        setTenant("");
        setMessage("");
        setSection(initialSection);
      }
      setSession(next);
      setReady(true);
    };
    const { data } = client.auth.onAuthStateChange((_event, next) => accept(next));
    void client.auth
      .getSession()
      .then((result) => {
        if (result.error) throw result.error;
        accept(result.data.session);
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setMessage("Sign-in could not be restored.");
        }
      });
    return () => {
      active = false;
      mounted.current = false;
      generation.current++;
      data.subscription.unsubscribe();
    };
  }, [client, initialSection]);
  const reload = useCallback(async () => {
    if (!client) return;
    const current = ++generation.current;
    setContext(null);
    setMessage("");
    setBusy(true);
    try {
      const result = await client.rpc("my_student_enrollment_context");
      if (!mounted.current || current !== generation.current) return;
      if (result.error) throw studentRequestError("Load staff access", result.error, result.status);
      const next = readEnrollmentContext(result.data);
      onContext(next);
      setRevision((value) => value + 1);
    } catch (error) {
      if (mounted.current && current === generation.current) onError(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [client, onContext, onError]);
  useEffect(() => {
    if (session?.user.id) void reload();
  }, [session?.user.id, reload]);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const emailValue = new FormData(event.currentTarget).get("email");
    const email = typeof emailValue === "string" ? emailValue.trim() : "";
    setBusy(true);
    setMessage("");
    try {
      const result = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (result.error)
        throw studentRequestError("Send staff sign-in email", result.error, result.error.status);
      setMessage("Check your email for a secure sign-in link. It returns to this staff portal.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in email could not be sent.");
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return <FoundationScreen audience="admin" />;
  const canEnroll = !!(program?.canEnroll || program?.canReview);
  const activeSection =
    (section === "administration" && !program?.canConfigure) ||
    (section === "enrollment" && !canEnroll)
      ? "requests"
      : section;
  const mode =
    enrollmentMode === "school" && program?.canEnroll
      ? "school"
      : program?.canReview
        ? "admin"
        : "school";
  const workspace =
    client && session && program
      ? {
          client,
          session,
          tenantId,
          section: activeSection,
          onContext,
          onError,
          onBusy: setWorkspaceBusy,
        }
      : null;
  const effectiveMode = activeSection === "administration" ? "admin" : mode;
  return (
    <main className="enrollment-portal staff-portal">
      <header>
        <Link href="/">
          ESH <span>Student Transportation</span>
        </Link>
      </header>
      <section>
        <p className="eyebrow">Request pilot · rides are not available</p>
        <h1>Staff portal</h1>
        <p>
          Manage school customers, review requests and plan recurring schedules. No transportation
          is booked here.
        </p>
        {!client ? (
          <p role="status">Service is temporarily unavailable.</p>
        ) : !ready ? (
          <p role="status">Restoring sign-in…</p>
        ) : !session ? (
          <form className="notice" onSubmit={(event) => void signIn(event)}>
            <h2>Secure sign-in</h2>
            <p>Use your admitted internal staff account. Schools use the school portal.</p>
            <label>
              Email address
              <input type="email" name="email" required autoComplete="email" disabled={busy} />
            </label>
            <button disabled={busy}>Email me a secure link</button>
            <p>
              <Link href="/school">School customer sign-in</Link>
            </p>
          </form>
        ) : (
          <>
            <p>Signed in as {session.user.email}</p>
            <div className="portal-actions">
              <button disabled={pending} onClick={() => void reload()}>
                Refresh workspace
              </button>
              <button
                className="secondary"
                disabled={pending}
                onClick={() => {
                  setBusy(true);
                  void client.auth
                    .signOut({ scope: "local" })
                    .then((result) => {
                      if (result.error) throw result.error;
                      setContext(null);
                      setTenant("");
                    })
                    .catch(() => setMessage("Sign-out could not be completed."))
                    .finally(() => setBusy(false));
                }}
              >
                Sign out
              </button>
            </div>
            {context?.programs.length ? (
              <label>
                Operating business
                <select
                  aria-label="Operating business"
                  value={tenantId}
                  disabled={pending}
                  onChange={(event) => {
                    setTenant(event.target.value);
                    setMessage("");
                    setSection("requests");
                  }}
                >
                  {context.programs.map((p) => (
                    <option key={p.tenantId} value={p.tenantId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : context ? (
              <p>
                No staff access is available for this account. Contact your program administrator.
              </p>
            ) : null}
            {workspace ? (
              <>
                <nav className="staff-navigation" aria-label="Staff sections">
                  <button
                    aria-current={activeSection === "requests" ? "page" : undefined}
                    className={activeSection === "requests" ? "" : "secondary"}
                    disabled={pending}
                    onClick={() => setSection("requests")}
                  >
                    Requests and planning
                  </button>
                  {canEnroll ? (
                    <button
                      aria-current={activeSection === "enrollment" ? "page" : undefined}
                      className={activeSection === "enrollment" ? "" : "secondary"}
                      disabled={pending}
                      onClick={() => setSection("enrollment")}
                    >
                      Enrollment
                    </button>
                  ) : null}
                  {program?.canConfigure ? (
                    <button
                      aria-current={activeSection === "administration" ? "page" : undefined}
                      className={activeSection === "administration" ? "" : "secondary"}
                      disabled={pending}
                      onClick={() => setSection("administration")}
                    >
                      Administration
                    </button>
                  ) : null}
                </nav>
                <p className="staff-section-help">
                  Save your work before switching sections. Unsaved entries are cleared when you
                  switch.
                </p>
                {activeSection === "enrollment" && program?.canEnroll && program.canReview ? (
                  <div className="portal-actions">
                    <button
                      className={mode === "school" ? "" : "secondary"}
                      disabled={pending}
                      onClick={() => setEnrollmentMode("school")}
                    >
                      Manage enrollments
                    </button>
                    <button
                      className={mode === "admin" ? "" : "secondary"}
                      disabled={pending}
                      onClick={() => setEnrollmentMode("admin")}
                    >
                      Review enrollments
                    </button>
                  </div>
                ) : null}
                {activeSection === "requests" ? (
                  <CustomerPortal
                    key={`${session.user.id}:${tenantId}:${revision}`}
                    internal
                    workspace={workspace}
                  />
                ) : (
                  <EnrollmentPortal
                    key={`${session.user.id}:${tenantId}:${revision}:${activeSection}:${effectiveMode}`}
                    mode={effectiveMode}
                    workspace={workspace}
                  />
                )}
              </>
            ) : null}
          </>
        )}
        {message ? (
          <p role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        <Link className="back" href="/">
          ← Home
        </Link>
      </section>
      <footer>ESH Student Transportation</footer>
    </main>
  );
}
