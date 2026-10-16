"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type SupabaseAuthSession,
  type StudentEnrollment,
  type StudentEnrollmentContact,
} from "@esh-platform/supabase";
import {
  blankEnrollment,
  enrollmentError,
  readEnrollmentContext,
  type EnrollmentContext,
  type EnrollmentInput,
} from "../lib/enrollment";
import { FoundationScreen } from "./FoundationScreen";

function textField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function EnrollmentPortal({ mode }: { mode: "school" | "admin" }) {
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
  const [resolved, setResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<EnrollmentContext | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [students, setStudents] = useState<StudentEnrollment[]>([]);
  const [contacts, setContacts] = useState<StudentEnrollmentContact[]>([]);
  const [editing, setEditing] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [input, setInput] = useState<EnrollmentInput>(blankEnrollment);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const loadGeneration = useRef(0);
  const mutation = useRef<{ key: string; id: string } | null>(null);
  const authUser = session?.user.id;
  const program = context?.programs.find((row) => row.tenantId === tenantId);
  const permitted = mode === "school" ? program?.canEnroll : program?.canReview;

  useEffect(() => {
    if (!client) return;
    let active = true;
    let currentIdentity: string | null = null;
    const acceptSession = (next: SupabaseAuthSession | null) => {
      if (!active) return;
      if (currentIdentity !== (next?.user.id ?? null)) {
        ++loadGeneration.current;
        setContext(null);
        setStudents([]);
        setContacts([]);
        setTenantId("");
        setEditing(false);
        setInput(blankEnrollment());
        setReviewNotes({});
        mutation.current = null;
        currentIdentity = next?.user.id ?? null;
      }
      setSession(next);
      setResolved(true);
    };
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      acceptSession(next);
    });
    void (async () => {
      try {
        const code = new URL(window.location.href).searchParams.get("code");
        if (code) {
          const result = await client.auth.exchangeCodeForSession(code);
          window.history.replaceState({}, "", window.location.pathname);
          if (result.error) throw result.error;
        }
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        if (active) {
          acceptSession(result.data.session);
        }
      } catch {
        if (active) {
          setMessage(enrollmentError("auth"));
          setResolved(true);
        }
      }
    })();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const load = useCallback(
    async (selected = "") => {
      if (!client) return;
      const generation = ++loadGeneration.current;
      const result = await client.rpc("my_student_enrollment_context");
      if (result.error) throw result.error;
      const next = readEnrollmentContext(result.data);
      const selectedId = next.programs.some((row) => row.tenantId === selected)
        ? selected
        : (next.programs[0]?.tenantId ?? "");
      const access = next.programs.find((row) => row.tenantId === selectedId);
      let rows: StudentEnrollment[] = [];
      let contactRows: StudentEnrollmentContact[] = [];
      if (selectedId && (mode === "school" ? access?.canEnroll : access?.canReview)) {
        let query = client
          .from("student_transportation_students")
          .select("*")
          .eq("tenant_id", selectedId);
        if (mode === "school") query = query.eq("guardian_person_id", next.personId);
        const studentsResult = await query.order("updated_at", { ascending: false }).limit(100);
        if (studentsResult.error) throw studentsResult.error;
        rows = studentsResult.data;
        if (rows.length) {
          const contactResult = await client
            .from("student_transportation_contacts")
            .select("*")
            .eq("tenant_id", selectedId)
            .in(
              "student_id",
              rows.map((row) => row.student_id),
            );
          if (contactResult.error) throw contactResult.error;
          contactRows = contactResult.data;
        }
      }
      if (generation !== loadGeneration.current) return;
      setContext(next);
      setTenantId(selectedId);
      setStudents(rows);
      setContacts(contactRows);
      mutation.current = null;
    },
    [client, mode],
  );

  useEffect(() => {
    ++loadGeneration.current;
    setContext(null);
    setStudents([]);
    setContacts([]);
    setTenantId("");
    setEditing(false);
    setInput(blankEnrollment());
    setReviewNotes({});
    mutation.current = null;
    if (!authUser) return;
    setBusy(true);
    void load()
      .catch(() => setMessage(enrollmentError("load")))
      .finally(() => setBusy(false));
    return () => {
      ++loadGeneration.current;
    };
  }, [authUser, load]);

  async function run(task: () => Promise<void>, action: "load" | "save" | "access" | "auth") {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch {
      setMessage(enrollmentError(action));
    } finally {
      setBusy(false);
    }
  }
  function requestId(fingerprint: string) {
    if (mutation.current && mutation.current.key !== fingerprint)
      throw new Error("Refresh before changing a pending submission.");
    if (mutation.current?.key !== fingerprint)
      mutation.current = { key: fingerprint, id: crypto.randomUUID() };
    return mutation.current.id;
  }
  async function save(action: "save" | "submit" | "withdraw", id = studentId) {
    if (!client || !tenantId) return;
    await run(async () => {
      const payload =
        action === "withdraw" ? {} : (JSON.parse(JSON.stringify(input)) as EnrollmentInput);
      const result = await client.rpc("save_my_student_enrollment", {
        target_tenant_id: tenantId,
        request_id_value: requestId(JSON.stringify({ tenantId, id, action, payload })),
        student_id_value: id,
        action_value: action,
        payload_value: payload,
      });
      if (result.error) throw result.error;
      mutation.current = null;
      setEditing(false);
      setStudentId(null);
      setInput(blankEnrollment());
      await load(tenantId);
      setMessage(
        action === "submit"
          ? "Enrollment submitted for review. This does not book transportation."
          : action === "withdraw"
            ? "Enrollment withdrawn."
            : "Draft saved.",
      );
    }, "save");
  }
  function edit(row: StudentEnrollment) {
    if (mutation.current) {
      setMessage("Refresh enrollment before changing a pending submission.");
      return;
    }
    setStudentId(row.student_id);
    setEditing(true);
    mutation.current = null;
    setInput({
      fullName: row.full_name,
      grade: row.grade,
      schoolName: row.school_name,
      guardianPhone: row.guardian_phone,
      relationship: row.guardian_relationship,
      authorityAttested: row.authority_attested,
      contacts: contacts
        .filter((contact) => contact.student_id === row.student_id)
        .map((contact) => ({
          fullName: contact.full_name,
          phone: contact.phone,
          relationship: contact.relationship,
          pickup: contact.proposed_pickup,
          dropoff: contact.proposed_dropoff,
        })),
    });
  }
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = textField(new FormData(event.currentTarget), "email").trim();
    await run(async () => {
      const result = await client!.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (result.error) throw result.error;
      setMessage(
        "Check your email for your secure sign-in link. Return to this Student Transportation page.",
      );
    }, "auth");
  }

  if (!enabled) return <FoundationScreen audience={mode} />;
  return (
    <main className="enrollment-portal">
      <header>
        <Link href="/">
          ESH <span>Student Transportation</span>
        </Link>
      </header>
      <section aria-labelledby="portal-title">
        <p className="eyebrow">Enrollment pilot · rides are not available</p>
        <h1 id="portal-title">
          {mode === "school" ? "Student enrollment · internal staff" : "Enrollment administration"}
        </h1>
        <p>
          No transportation is booked here. Contact details are proposed contacts for review, not
          verified handoff authorization.
        </p>
        {!client ? (
          <div className="notice" role="status">
            Enrollment is not configured on this installation. Contact the program administrator.
          </div>
        ) : !resolved ? (
          <p role="status">Checking your sign-in…</p>
        ) : !session ? (
          <form
            onSubmit={(event) => {
              void signIn(event);
            }}
            className="notice"
          >
            <h2>Secure sign-in</h2>
            <p>Use the email invited by your program administrator. Existing ESH accounts only.</p>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required disabled={busy} />
            </label>
            <button disabled={busy}>Email me a secure link</button>
          </form>
        ) : (
          <>
            <div className="portal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await load(tenantId);
                    setEditing(false);
                    setInput(blankEnrollment());
                  }, "load");
                }}
              >
                Refresh enrollment
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    const result = await client.auth.signOut({ scope: "local" });
                    if (result.error) throw result.error;
                  }, "auth");
                }}
              >
                Sign out
              </button>
            </div>
            <p>Signed in as {session.user.email}</p>
            {context && !context.programs.length ? (
              <div className="notice">
                No enrollment access is available. Ask your program administrator for admission.
              </div>
            ) : null}
            {context?.programs.length ? (
              <label>
                Organization
                <select
                  aria-label="Organization"
                  value={tenantId}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value;
                    ++loadGeneration.current;
                    setStudents([]);
                    setContacts([]);
                    setEditing(false);
                    setInput(blankEnrollment());
                    setReviewNotes({});
                    setTenantId(next);
                    mutation.current = null;
                    void run(() => load(next), "load");
                  }}
                >
                  {context.programs.map((row) => (
                    <option key={row.tenantId} value={row.tenantId}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {mode === "admin" && program?.canConfigure ? (
              <div className="notice">
                <h2>Enrollment access setup</h2>
                <p>
                  Managing enrollment for <strong>{program.name}</strong> only. Student ride
                  operations stay disabled.
                </p>
                <p>
                  Organization owners can manage access. Viewing children requires a separate
                  Reviewer grant, including for yourself.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      const result = await client.rpc("configure_student_enrollment_program", {
                        target_tenant_id: tenantId,
                        enabled_value: !program.enrollmentEnabled,
                        reason_value: program.enrollmentEnabled ? "program_paused" : "pilot_setup",
                      });
                      if (result.error) throw result.error;
                      await load(tenantId);
                    }, "access");
                  }}
                >
                  {program.enrollmentEnabled ? "Pause enrollment pilot" : "Enable enrollment pilot"}
                </button>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(async () => {
                      const result = await client.rpc("set_student_enrollment_access", {
                        target_tenant_id: tenantId,
                        email_value: textField(form, "email"),
                        role_value: textField(form, "role"),
                        enabled_value: form.get("action") === "grant",
                        reason_value:
                          form.get("action") !== "grant"
                            ? "access_revoked"
                            : form.get("role") === "school_admin"
                              ? "school_administrator_assignment"
                              : "reviewer_assignment",
                      });
                      if (result.error) throw result.error;
                      await load(tenantId);
                      setMessage("Enrollment access updated.");
                    }, "access");
                  }}
                >
                  <label>
                    Existing tenant member’s email
                    <input name="email" type="email" required disabled={busy} />
                  </label>
                  <label>
                    Enrollment role
                    <select name="role" aria-label="Enrollment role" disabled={busy}>
                      <option value="school_admin">Internal enrollment staff</option>
                      <option value="reviewer">Reviewer</option>
                    </select>
                  </label>
                  <label>
                    Access action
                    <select name="action" aria-label="Access action" disabled={busy}>
                      <option value="grant">Grant access</option>
                      <option value="revoke">Revoke access</option>
                    </select>
                  </label>
                  <button disabled={busy}>Update access</button>
                </form>
              </div>
            ) : null}
            {program?.canEnroll && mode === "admin" ? (
              <Link className="back" href="/enrollment">
                Manage student enrollment →
              </Link>
            ) : null}
            {program && (program.canConfigure || program.canEnroll || program.canReview) ? (
              <Link className="back" href="/clients">
                Customers and transportation requests →
              </Link>
            ) : null}
            {program && !permitted ? (
              <div className="notice">
                {program.enrollmentEnabled
                  ? "You have not been admitted to this enrollment role."
                  : "Enrollment is paused for this organization."}
              </div>
            ) : null}
            {permitted ? (
              <>
                {mode === "school" && !editing ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (mutation.current) {
                        setMessage("Refresh enrollment before starting another submission.");
                        return;
                      }
                      setEditing(true);
                      setStudentId(null);
                      setInput(blankEnrollment());
                      mutation.current = null;
                    }}
                  >
                    Add a student
                  </button>
                ) : null}
                {mode === "school" && editing ? (
                  <form
                    className="notice"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save("submit");
                    }}
                  >
                    <h2>{studentId ? "Update enrollment" : "Add a student"}</h2>
                    <fieldset disabled={busy}>
                      <label>
                        Student full name
                        <input
                          required
                          maxLength={120}
                          value={input.fullName}
                          onChange={(event) => setInput({ ...input, fullName: event.target.value })}
                        />
                      </label>
                      <label>
                        Grade
                        <select
                          required
                          aria-label="Grade"
                          value={input.grade}
                          onChange={(event) => setInput({ ...input, grade: event.target.value })}
                        >
                          <option value="">Choose grade</option>
                          {[
                            "K",
                            ...Array.from({ length: 12 }, (_, index) => String(index + 1)),
                          ].map((grade) => (
                            <option key={grade}>{grade}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        School name
                        <input
                          required
                          maxLength={200}
                          value={input.schoolName}
                          onChange={(event) =>
                            setInput({ ...input, schoolName: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Parent/guardian contact phone
                        <input
                          type="tel"
                          required
                          minLength={7}
                          maxLength={32}
                          value={input.guardianPhone}
                          onChange={(event) =>
                            setInput({ ...input, guardianPhone: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Parent/guardian relationship to the student
                        <input
                          required
                          maxLength={60}
                          value={input.relationship}
                          onChange={(event) =>
                            setInput({ ...input, relationship: event.target.value })
                          }
                        />
                      </label>
                      <h3>Proposed pickup and drop-off contacts</h3>
                      <p>
                        Add at least one contact before submitting. Include the proposed responsible
                        adults. These contacts must be reviewed before transport can begin.
                      </p>
                      {input.contacts.map((contact, index) => (
                        <fieldset className="contact-card" key={index}>
                          <legend>Contact {index + 1}</legend>
                          <label>
                            Contact name
                            <input
                              required
                              maxLength={120}
                              value={contact.fullName}
                              onChange={(event) =>
                                setInput({
                                  ...input,
                                  contacts: input.contacts.map((item, i) =>
                                    i === index ? { ...item, fullName: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            Contact phone
                            <input
                              type="tel"
                              required
                              minLength={7}
                              maxLength={32}
                              value={contact.phone}
                              onChange={(event) =>
                                setInput({
                                  ...input,
                                  contacts: input.contacts.map((item, i) =>
                                    i === index ? { ...item, phone: event.target.value } : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            Contact relationship
                            <input
                              required
                              maxLength={60}
                              value={contact.relationship}
                              onChange={(event) =>
                                setInput({
                                  ...input,
                                  contacts: input.contacts.map((item, i) =>
                                    i === index
                                      ? { ...item, relationship: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={contact.pickup}
                              onChange={(event) =>
                                setInput({
                                  ...input,
                                  contacts: input.contacts.map((item, i) =>
                                    i === index ? { ...item, pickup: event.target.checked } : item,
                                  ),
                                })
                              }
                            />
                            Proposed pickup contact
                          </label>
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={contact.dropoff}
                              onChange={(event) =>
                                setInput({
                                  ...input,
                                  contacts: input.contacts.map((item, i) =>
                                    i === index ? { ...item, dropoff: event.target.checked } : item,
                                  ),
                                })
                              }
                            />
                            Proposed drop-off contact
                          </label>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setInput({
                                ...input,
                                contacts: input.contacts.filter((_, i) => i !== index),
                              })
                            }
                          >
                            Remove contact {index + 1}
                          </button>
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className="secondary"
                        disabled={input.contacts.length >= 6}
                        onClick={() =>
                          setInput({
                            ...input,
                            contacts: [
                              ...input.contacts,
                              {
                                fullName: "",
                                phone: "",
                                relationship: "",
                                pickup: true,
                                dropoff: true,
                              },
                            ],
                          })
                        }
                      >
                        Add contact
                      </button>
                      <label className="check">
                        <input
                          type="checkbox"
                          required
                          checked={input.authorityAttested}
                          onChange={(event) =>
                            setInput({ ...input, authorityAttested: event.target.checked })
                          }
                        />
                        I confirm our business is authorized to submit enrollment for this student
                        and provide these contacts.
                      </label>
                      <div className="portal-actions">
                        <button
                          type="button"
                          onClick={() => {
                            void save("save");
                          }}
                        >
                          Save draft
                        </button>
                        <button disabled={!input.authorityAttested || !input.contacts.length}>
                          Submit enrollment
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setEditing(false);
                            setInput(blankEnrollment());
                          }}
                        >
                          Close form
                        </button>
                      </div>
                    </fieldset>
                  </form>
                ) : null}
                <h2>{mode === "school" ? "Students you enrolled" : "Enrollment requests"}</h2>
                {!students.length ? <p>No enrollments yet.</p> : null}
                {students.length === 100 ? (
                  <p>Showing the 100 most recently updated enrollments.</p>
                ) : null}
                {students.map((row) => (
                  <article className="notice" key={row.student_id}>
                    <h3>{row.full_name}</h3>
                    <p>
                      Grade {row.grade} · {row.school_name}
                    </p>
                    <p className="status">{row.status}</p>
                    {row.review_notes ? <p>Reviewer response: {row.review_notes}</p> : null}
                    <p>
                      {row.status === "approved"
                        ? "Enrollment approved. Transportation is not booked or authorized by this approval."
                        : "Enrollment review only; no ride is booked."}
                    </p>
                    {mode === "admin" ? (
                      <>
                        <p>
                          Parent/guardian relationship: {row.guardian_relationship} ·{" "}
                          {row.guardian_phone}
                        </p>
                        <ul>
                          {contacts
                            .filter((contact) => contact.student_id === row.student_id)
                            .map((contact) => (
                              <li key={contact.contact_id}>
                                {contact.full_name} · {contact.phone} · {contact.relationship}
                                {contact.proposed_pickup ? " · pickup" : ""}
                                {contact.proposed_dropoff ? " · drop-off" : ""}
                              </li>
                            ))}
                        </ul>
                      </>
                    ) : null}
                    {mode === "school" ? (
                      <div className="portal-actions">
                        {!["submitted", "approved"].includes(row.status) ? (
                          <button type="button" disabled={busy} onClick={() => edit(row)}>
                            Edit enrollment
                          </button>
                        ) : null}
                        {row.status !== "withdrawn" ? (
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              void save("withdraw", row.student_id);
                            }}
                          >
                            Withdraw enrollment
                          </button>
                        ) : null}
                      </div>
                    ) : row.status === "submitted" ? (
                      <div>
                        <label>
                          Review notes
                          <textarea
                            maxLength={1000}
                            value={reviewNotes[row.student_id] ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setReviewNotes({
                                ...reviewNotes,
                                [row.student_id]: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="portal-actions">
                          {(["approved", "rejected"] as const).map((decision) => (
                            <button
                              type="button"
                              key={decision}
                              disabled={
                                busy ||
                                (decision === "rejected" && !reviewNotes[row.student_id]?.trim())
                              }
                              onClick={() => {
                                void run(async () => {
                                  const notes = reviewNotes[row.student_id] ?? "";
                                  const result = await client.rpc("review_student_enrollment", {
                                    target_tenant_id: tenantId,
                                    student_id_value: row.student_id,
                                    request_id_value: requestId(
                                      JSON.stringify({
                                        tenantId,
                                        studentId: row.student_id,
                                        decision,
                                        notes,
                                      }),
                                    ),
                                    decision_value: decision,
                                    notes_value: notes,
                                  });
                                  if (result.error) throw result.error;
                                  mutation.current = null;
                                  await load(tenantId);
                                  setMessage("Enrollment review saved.");
                                }, "save");
                              }}
                            >
                              {decision === "approved" ? "Approve enrollment" : "Reject enrollment"}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </>
            ) : null}
          </>
        )}
        {!busy && mutation.current ? (
          <p>
            A save may need confirmation. Retry with the same entries, or refresh enrollment before
            making a different change.
          </p>
        ) : null}
        <p role="status" aria-live="polite">
          {busy ? "Please wait…" : message}
        </p>
        <Link className="back" href="/">
          ← Home
        </Link>
      </section>
      <footer>Private enrollment · Student Transportation</footer>
    </main>
  );
}
