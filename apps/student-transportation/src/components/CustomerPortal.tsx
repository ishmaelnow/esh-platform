"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
  type Database,
} from "@esh-platform/supabase";
import { readEnrollmentContext, type EnrollmentProgram } from "../lib/enrollment";
import { readCustomers, readRequestStudents, type Customer } from "../lib/customer";
import { FoundationScreen } from "./FoundationScreen";
import { GeographicRequestForm, SavedGeographicPreview } from "./GeographicRequest";
import { ACCOMMODATIONS } from "../lib/geography";
import { PlanningWorkspace } from "./PlanningWorkspace";
type RequestRow = Database["public"]["Tables"]["student_transportation_requests"]["Row"];
type AccountRow = Database["public"]["Tables"]["student_transportation_customers"]["Row"];
type InvitationRow =
  Database["public"]["Tables"]["student_transportation_customer_invitations"]["Row"];
function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function CustomerPortal({ internal = false }: { internal?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const enabled = process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED === "true";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [programs, setPrograms] = useState<EnrollmentProgram[]>([]);
  const [selected, setSelected] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [planningOpen, setPlanningOpen] = useState(false);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const generation = useRef(0);
  const customer = customers.find((c) => c.customerId === selected);
  const program = programs.find((p) => p.tenantId === selected);
  const canManage = !!(program?.canConfigure || program?.canEnroll);
  const clear = useCallback(() => {
    generation.current++;
    setCustomers([]);
    setPrograms([]);
    setSelected("");
    setRequests([]);
    setAccounts([]);
    setInvitations([]);
    setPlanningOpen(false);
    retry.current = null;
  }, []);
  useEffect(() => {
    if (!client) return;
    let live = true;
    let identity: string | null = null;
    const accept = (next: SupabaseAuthSession | null) => {
      if (!live) return;
      if (identity !== (next?.user.id ?? null)) {
        clear();
        setMessage("");
        identity = next?.user.id ?? null;
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
        if (live) {
          setReady(true);
          setMessage("Sign-in could not be restored. Please try again.");
        }
      });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [client, clear]);
  const load = useCallback(
    async (choice = "") => {
      if (!client) return;
      const current = ++generation.current;
      let options: Customer[] = [];
      let nextPrograms: EnrollmentProgram[] = [];
      if (internal) {
        const result = await client.rpc("my_student_enrollment_context");
        if (result.error) throw result.error;
        nextPrograms = readEnrollmentContext(result.data).programs.filter(
          (p) => p.canConfigure || p.canEnroll || p.canReview,
        );
      } else {
        const accepted = await client.rpc("accept_my_student_customer_invitations");
        if (accepted.error) throw accepted.error;
        const result = await client.rpc("my_student_customer_context");
        if (result.error) throw result.error;
        options = readCustomers(result.data);
      }
      const ids = internal ? nextPrograms.map((p) => p.tenantId) : options.map((c) => c.customerId);
      const id = ids.includes(choice) ? choice : (ids[0] ?? "");
      const tenant = internal ? id : options.find((c) => c.customerId === id)?.tenantId;
      let nextRequests: RequestRow[] = [];
      let nextAccounts: AccountRow[] = [];
      let nextInvitations: InvitationRow[] = [];
      if (tenant) {
        let query = client
          .from("student_transportation_requests")
          .select("*")
          .eq("tenant_id", tenant);
        if (!internal) query = query.eq("customer_id", id);
        const result = await query.order("created_at", { ascending: false }).limit(100);
        if (result.error) throw result.error;
        nextRequests = result.data;
        if (internal) {
          const result = await client
            .from("student_transportation_customers")
            .select("*")
            .eq("tenant_id", tenant)
            .order("display_name")
            .limit(100);
          if (result.error) throw result.error;
          nextAccounts = result.data;
          const invitationsResult = await client
            .from("student_transportation_customer_invitations")
            .select("*")
            .eq("tenant_id", tenant)
            .limit(100);
          if (invitationsResult.error) throw invitationsResult.error;
          nextInvitations = invitationsResult.data;
        }
      }
      if (current !== generation.current) return;
      setCustomers(options);
      setPrograms(nextPrograms);
      setSelected(id);
      setRequests(nextRequests);
      setAccounts(nextAccounts);
      setInvitations(nextInvitations);
    },
    [client, internal],
  );
  useEffect(() => {
    if (!session?.user.id) return;
    void load().catch(() => {
      clear();
      setMessage("We could not load your account. Please refresh.");
    });
  }, [session?.user.id, load, clear]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch {
      setMessage(
        "We could not complete this request. Refresh to check its status before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const requestKey = (signature: string) => {
    if (retry.current && retry.current.signature !== signature)
      throw new Error("Unresolved request; retry unchanged or refresh first");
    retry.current ??= { signature, id: crypto.randomUUID() };
    return retry.current.id;
  };
  const sendInvitation = async (body: Record<string, string>) => {
    const auth = await client!.auth.getSession();
    if (auth.error || !auth.data.session) throw Error("Sign-in required");
    const response = await fetch("/api/customers/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.data.session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const result: unknown = await response.json();
    const note =
      result &&
      typeof result === "object" &&
      "message" in result &&
      typeof result.message === "string"
        ? result.message
        : "Invitation could not be sent. Refresh and try again.";
    await load(selected);
    setMessage(note);
    return response.ok;
  };
  if (!enabled) return <FoundationScreen audience={internal ? "admin" : "school"} />;
  if (!client)
    return (
      <main>
        <h1>Student Transportation</h1>
        <p>Service is temporarily unavailable.</p>
      </main>
    );
  return (
    <main className="enrollment-portal">
      <header>
        <Link href="/">
          ESH <span>Student Transportation</span>
        </Link>
      </header>
      <section>
        <p className="eyebrow">Request pilot · rides are not available</p>
        <h1>{internal ? "Customers and requests" : "School transportation"}</h1>
        <p>
          {internal
            ? "Internal staff manage customer accounts and review scheduled requests."
            : "Request a school, organization or group journey for students travelling together."}
        </p>
        <p>
          Requests require operational review. No driver, vehicle, fare or ride is confirmed here.
        </p>
        {!ready ? (
          <p role="status">Restoring sign-in…</p>
        ) : !session ? (
          <form
            className="notice"
            onSubmit={(e) => {
              e.preventDefault();
              const email = field(new FormData(e.currentTarget), "email");
              void run(async () => {
                const result = await client.auth.signInWithOtp({
                  email,
                  options: {
                    shouldCreateUser: false,
                    emailRedirectTo: `${window.location.origin}/${internal ? "admin" : "school"}`,
                  },
                });
                if (result.error) throw result.error;
                setMessage(
                  "Check your email for a secure sign-in link. Use the account admitted by your transportation provider.",
                );
              });
            }}
          >
            <h2>Secure sign-in</h2>
            <label>
              Email address
              <input name="email" type="email" required disabled={busy} />
            </label>
            <button disabled={busy}>Email me a secure link</button>
          </form>
        ) : (
          <>
            <p>Signed in as {session.user.email}</p>
            <div className="portal-actions">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    clear();
                    await load(selected);
                    retry.current = null;
                  })
                }
              >
                Refresh requests
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await client.auth.signOut({ scope: "local" });
                    if (result.error) throw result.error;
                    clear();
                  })
                }
              >
                Sign out
              </button>
            </div>
            <label>
              {internal ? "Operating business" : "Customer account"}
              <select
                value={selected}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  clear();
                  void run(() => load(id));
                }}
              >
                {!selected ? <option value="">No account access</option> : null}
                {(internal
                  ? programs.map((p) => ({ id: p.tenantId, name: p.name }))
                  : customers.map((c) => ({ id: c.customerId, name: c.name }))
                ).map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!selected ? (
              <p>No account access is available. Contact your transportation provider.</p>
            ) : null}
            {internal && canManage ? (
              <form
                className="notice"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const element = e.currentTarget;
                  const body = {
                    target_tenant_id: selected,
                    name_value: field(form, "name"),
                    kind_value: field(form, "kind"),
                    email_value: field(form, "email"),
                  };
                  void run(async () => {
                    const id = requestKey(JSON.stringify(body));
                    const sent = await sendInvitation({
                      ...body,
                      request_id_value: id,
                    });
                    if (!sent) return;
                    retry.current = null;
                    element.reset();
                  });
                }}
              >
                <h2>Add customer account</h2>
                <fieldset disabled={busy}>
                  <label>
                    School or organization name
                    <input name="name" required maxLength={160} />
                  </label>
                  <label>
                    Customer type
                    <select name="kind">
                      <option value="school">School</option>
                      <option value="organization">Organization</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                  <label>
                    School contact email
                    <input name="email" type="email" required />
                  </label>
                  <p>
                    We will email an invitation. The contact can be new to ESH and receives customer
                    access only.
                  </p>
                  <button>Create account and send invitation</button>
                </fieldset>
              </form>
            ) : null}
            {internal
              ? accounts.map((a) => (
                  <article className="notice" key={a.customer_id}>
                    <h2>{a.display_name}</h2>
                    <p>
                      {a.customer_kind} · {a.status}
                    </p>
                    {invitations
                      .filter((i) => i.customer_id === a.customer_id)
                      .map((i) => (
                        <div key={i.invitation_id}>
                          <p>
                            {i.status === "accepted"
                              ? "Invitation accepted"
                              : new Date(i.expires_at) <= new Date()
                                ? "Invitation expired"
                                : "Invitation pending"}{" "}
                            · {i.normalized_email}
                          </p>
                          {canManage && i.status === "pending" && a.status === "active" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const sent = await sendInvitation({
                                    target_tenant_id: selected,
                                    target_customer_id: a.customer_id,
                                  });
                                  if (sent) retry.current = null;
                                })
                              }
                            >
                              Resend invitation
                            </button>
                          ) : null}
                        </div>
                      ))}
                    {canManage ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const r = await client.rpc("set_student_customer_status", {
                              target_tenant_id: selected,
                              target_customer_id: a.customer_id,
                              active_value: a.status !== "active",
                            });
                            if (r.error) throw r.error;
                            await load(selected);
                          })
                        }
                      >
                        {a.status === "active"
                          ? "Pause customer access"
                          : "Restore customer access"}
                      </button>
                    ) : null}
                  </article>
                ))
              : null}
            {!internal && customer ? (
              <GeographicRequestForm
                key={`${session.user.id}:${customer.customerId}:${generation.current}`}
                client={client}
                customer={customer}
                onSaved={async () => {
                  await load(selected);
                  setMessage(
                    "Transportation request submitted for review. A ride has not been booked.",
                  );
                }}
              />
            ) : null}
            <h2>{internal ? "Transportation requests" : "Your requests"}</h2>
            {internal && selected && (program?.canReview || program?.canEnroll) ? (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPlanningOpen((v) => !v)}
                >
                  {planningOpen ? "Close route planning" : "Open route planning"}
                </button>
                {planningOpen ? (
                  <PlanningWorkspace
                    key={`${session.user.id}:${selected}:${generation.current}`}
                    client={client}
                    tenantId={selected}
                    canReview={!!program?.canReview}
                    requests={requests}
                  />
                ) : null}
              </>
            ) : null}
            {!requests.length ? <p>No requests yet.</p> : null}
            {requests.length === 100 ? <p>Showing the latest 100 requests.</p> : null}
            {requests.map((r) => (
              <article className="notice" key={r.request_id}>
                <h3>{new Date(r.scheduled_at).toLocaleString()}</h3>
                {internal ? (
                  <p>
                    {accounts.find((a) => a.customer_id === r.customer_id)?.display_name ??
                      "Customer account"}
                  </p>
                ) : null}
                <p>{r.destination_address}</p>
                <p>
                  {r.geography_status === "geocoded"
                    ? "Geocoded · loading points unreviewed"
                    : "Unverified text-only addresses · geographic review required"}
                </p>
                <p>
                  {r.status === "submitted" ? "Awaiting review · ride not confirmed" : "Withdrawn"}
                </p>
                <ul>
                  {readRequestStudents(r.students).map((s, i) => (
                    <li key={i}>
                      {s.accommodations?.length ? (
                        <span>
                          Requirements: {s.accommodations.map((a) => ACCOMMODATIONS[a]).join(", ")}
                          .{" "}
                        </span>
                      ) : null}
                      {s.name} · {s.pickupAddress}
                    </li>
                  ))}
                </ul>
                {r.geography_status === "geocoded" ? (
                  <SavedGeographicPreview
                    key={`${r.request_id}:${generation.current}`}
                    client={client}
                    tenantId={r.tenant_id}
                    requestId={r.request_id}
                  />
                ) : null}
                {!internal && r.status === "submitted" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await client.rpc("withdraw_student_transport_request", {
                          target_tenant_id: r.tenant_id,
                          target_request_id: r.request_id,
                        });
                        if (result.error) throw result.error;
                        await load(selected);
                        setMessage("Request withdrawn.");
                      })
                    }
                  >
                    Withdraw request
                  </button>
                ) : null}
              </article>
            ))}
          </>
        )}
        {message ? <p role="status">{message}</p> : null}
        <Link className="back" href="/">
          ← Home
        </Link>
      </section>
      <footer>ESH Student Transportation</footer>
    </main>
  );
}
