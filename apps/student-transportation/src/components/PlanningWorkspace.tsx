"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Database, PlatformSupabaseClient } from "@esh-platform/supabase";
import { scalarText, planningRecordFailure } from "../lib/planning";
import { StudentRouteMap } from "@esh-platform/maps/client";
import { ACCOMMODATIONS, type GeographicPreview } from "../lib/geography";
import { readRequestStudents } from "../lib/customer";
import {
  jsonObject,
  readPlanning,
  stringValue,
  arrayValue,
  type PlanningRecord,
  type PlanningContext,
  type PlanningManifest,
} from "../lib/planning";
import {
  PlanningRecordEditor,
  TextField,
  formText,
  type RecordSubmission,
} from "./PlanningRecordEditor";
import { PlanningScheduleEditor, type ScheduleSubmission } from "./PlanningScheduleEditor";
type RequestRow = Database["public"]["Tables"]["student_transportation_requests"]["Row"];
type Editor =
  | { kind: "student" | "point" | "policy" | "resource"; record?: PlanningRecord; index?: number }
  | { kind: "schedule"; record?: PlanningRecord };
const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /required|missing|expires|expiring|cannot satisfy|already reserved|overlapping|superseded|refresh|changed|Current draft|Road duration|service window|Historical manifests|Review every|Explicit unique|requested student|Loading point moved|Resolve seating|Request identifier|Use one closure|Use explicit (equipment )?credential keys|Planning save failed|does not cover|does not match|different reviewer|Record changed/i.test(
    message,
  )
    ? message.slice(0, 350)
    : "Planning could not be completed. Check your access and entries, then refresh before retrying.";
};

function ManifestDetails({ manifest }: { manifest: PlanningManifest }) {
  const snapshot = jsonObject(manifest.snapshot) ? manifest.snapshot : {};
  const plan = jsonObject(snapshot.schedule) ? snapshot.schedule : {};
  const reviewed = jsonObject(snapshot.reviewedRecords) ? snapshot.reviewedRecords : {};
  const people = arrayValue(reviewed, "students").filter(jsonObject);
  const schoolZone = stringValue(plan, "timeZone", "UTC");
  const localTime = (value: unknown) => {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Not reserved";
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: schoolZone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return "Time unavailable";
    }
  };
  return (
    <details className="notice">
      <summary>
        {manifest.service_date} · revision {manifest.revision} · {manifest.state}
      </summary>
      <p>
        {stringValue(plan, "name")} · schedule revision {manifest.schedule_revision} · planning only
      </p>
      <p>
        School time zone: {stringValue(plan, "timeZone")}. Reserved window:{" "}
        {localTime(snapshot.startsAt)} to {localTime(snapshot.endsAt)}.
      </p>
      <p>
        Recorded {new Date(manifest.recorded_at).toLocaleString()} by reviewer {manifest.actor_id}.
        Reason: {manifest.reason}
      </p>
      {manifest.state === "cancelled" ? (
        <p>{scalarText(snapshot.excludedReason ?? "Cancelled")}</p>
      ) : null}
      <h4>Immutable student snapshot</h4>
      <ul>
        {people.map((p, i) => {
          const d = jsonObject(p.data) ? p.data : {};
          return (
            <li key={i}>
              {scalarText(d.name)} · {scalarText(d.seating)} ·{" "}
              {arrayValue(d, "requirements")
                .map((tag) => ACCOMMODATIONS[tag as keyof typeof ACCOMMODATIONS] ?? scalarText(tag))
                .join(", ") || "Reviewed: none recorded"}{" "}
              · school reference {scalarText(p.reference)}
            </li>
          );
        })}
      </ul>
      <h4>Immutable loading points</h4>
      <ol>
        {arrayValue(reviewed, "points")
          .filter(jsonObject)
          .map((p, i) => {
            const d = jsonObject(p.data) ? p.data : {};
            return (
              <li key={i}>
                {scalarText(d.label)} · {scalarText(d.loadingType)} · {scalarText(d.address)} ·{" "}
                {scalarText(d.latitude)}, {scalarText(d.longitude)} ·{" "}
                {scalarText(d.instructions ?? "")}
              </li>
            );
          })}
      </ol>
      <h4>Reserved resources</h4>
      <ul>
        {[reviewed.vehicle, reviewed.driver, ...arrayValue(reviewed, "attendants")]
          .filter(jsonObject)
          .map((r, i) => {
            const d = jsonObject(r.data) ? r.data : {};
            return (
              <li key={i}>
                {scalarText(d.role)}: {scalarText(d.label)} · revision {scalarText(r.revision)} ·
                evidence {scalarText(d.evidenceReference)}
              </li>
            );
          })}
      </ul>
      <h4>Per-segment capacity demand</h4>
      <details>
        <summary>Qualification evidence snapshot</summary>
        {jsonObject(reviewed.policy) && jsonObject(reviewed.policy.data) ? (
          <p>
            Policy reference: {scalarText(reviewed.policy.data.sourceReference)} · revision{" "}
            {scalarText(reviewed.policy.revision)}
          </p>
        ) : null}
        <ul>
          {[reviewed.driver, ...arrayValue(reviewed, "attendants")]
            .filter(jsonObject)
            .map((r, i) => {
              const d = jsonObject(r.data) ? r.data : {};
              return (
                <li key={i}>
                  {scalarText(d.label)}
                  <ul>
                    {arrayValue(d, "credentials")
                      .filter(jsonObject)
                      .map((c, j) => (
                        <li key={j}>
                          {scalarText(c.key)} · {scalarText(c.reference)} · valid{" "}
                          {scalarText(c.validFrom)} through {scalarText(c.validUntil)}
                        </li>
                      ))}
                  </ul>
                </li>
              );
            })}
        </ul>
      </details>
      <ol>
        {arrayValue(reviewed, "segments")
          .filter(jsonObject)
          .map((s, i) => (
            <li key={i}>
              Stops {Number(s.fromStop) + 1}–{Number(s.toStop) + 1}: {scalarText(s.studentSeats)}{" "}
              student seats, {scalarText(s.wheelchairPositions)} wheelchair positions,{" "}
              {scalarText(s.attendantSeats)} attendant seats, {scalarText(s.boosterSeats)} boosters,{" "}
              {scalarText(s.carSeats)} car seats.
            </li>
          ))}
      </ol>
      <p>
        Retained planning snapshot. Current eligibility must be rechecked before any future service
        release.
      </p>
    </details>
  );
}

export function PlanningWorkspace({
  client,
  tenantId,
  canReview,
  requests,
}: {
  client: PlatformSupabaseClient;
  tenantId: string;
  canReview: boolean;
  requests: RequestRow[];
}) {
  const [context, setContext] = useState<PlanningContext | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [requestId, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPlan, setPlan] = useState("");
  const [preview, setPreview] = useState<
    (GeographicPreview & { planId: string; revision: number }) | null
  >(null);
  const [history, setHistory] = useState<PlanningManifest[] | null>(null);
  const [versionHistory, setVersionHistory] = useState<
    Database["public"]["Tables"]["student_planning_versions"]["Row"][] | null
  >(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const running = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const records = context?.records ?? [];
  const plans = records.filter((r) => r.kind === "schedule");
  const plan = plans.find((p) => p.id === selectedPlan);
  const request = requests.find((r) => r.request_id === requestId);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    const result = await client.rpc("my_student_planning", { t: tenantId });
    if (!mounted.current || current !== generation.current) return;
    if (result.error) {
      setContext(null);
      setPreview(null);
      setHistory(null);
      setVersionHistory(null);
      throw Error(result.error.message);
    }
    setContext(readPlanning(result.data));
  }, [client, tenantId]);
  useEffect(() => {
    mounted.current = true;
    void reload().catch(() => {
      if (mounted.current)
        setMessage("Planning is unavailable. Check internal admission or refresh.");
    });
    return () => {
      mounted.current = false;
      generation.current++;
      controller.current?.abort();
    };
  }, [reload]);
  const run = async (signature: string, action: (key: string) => Promise<void>, write = true) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (write) {
        if (retry.current && retry.current.signature !== signature)
          throw Error("Unresolved request; retry unchanged or refresh planning to check first.");
        retry.current ??= { signature, key: crypto.randomUUID() };
      }
      await action(retry.current?.key ?? crypto.randomUUID());
    } catch (e) {
      if (mounted.current) setMessage(errorMessage(e));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const saved = async () => {
    retry.current = null;
    if (!mounted.current) return;
    setEditor(null);
    setPreview(null);
    setHistory(null);
    setVersionHistory(null);
    await reload();
    if (mounted.current) setMessage("Planning revision saved. Transport remains unavailable.");
  };
  const saveRecord = (body: RecordSubmission) =>
    void run(JSON.stringify(body), async (key) => {
      const result = await client.rpc("save_student_planning_record", {
        t: tenantId,
        kind_value: body.kind,
        customer_value: body.customerId,
        reference_value: body.reference,
        entity_value: body.id,
        expected_revision: body.revision,
        state_value: body.state,
        data_value: body.data,
        reason_value: body.reason,
        request_key: key,
      });
      if (result.error) {
        const failure = planningRecordFailure(result.error);
        // A returned SQL error rolls back this RPC. Transport failures remain uncertain.
        if (failure.canCorrect) retry.current = null;
        throw Error(failure.message);
      }
      await saved();
    });
  const saveSchedule = (body: ScheduleSubmission) =>
    void run(JSON.stringify(body), async (key) => {
      const result = await client.rpc("save_student_route_plan", {
        t: tenantId,
        entity_value: body.id,
        expected_revision: body.revision,
        reference_value: body.reference,
        data_value: body.data,
        reason_value: body.reason,
        request_key: key,
      });
      if (result.error) throw Error(result.error.message);
      await saved();
    });
  const roadPreview = () => {
    if (!plan) return;
    void run(
      "preview",
      async () => {
        setPreview(null);
        controller.current?.abort();
        controller.current = new AbortController();
        const auth = await client.auth.getSession();
        if (auth.error || !auth.data.session) throw Error("Sign-in required");
        const response = await fetch("/api/planning/preview", {
          method: "POST",
          signal: controller.current.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.data.session.access_token}`,
          },
          body: JSON.stringify({ tenantId, planId: plan.id, revision: plan.revision }),
        });
        const value: unknown = await response.json();
        if (!response.ok)
          throw Error(
            jsonObject(value) && typeof value.message === "string"
              ? value.message
              : "Road preview unavailable; refresh planning.",
          );
        if (
          !jsonObject(value) ||
          typeof value.receiptId !== "string" ||
          !Array.isArray(value.stops) ||
          !jsonObject(value.route)
        )
          throw Error("Road preview unavailable");
        if (mounted.current)
          setPreview({
            ...(value as unknown as GeographicPreview),
            planId: plan.id,
            revision: plan.revision,
          });
      },
      false,
    );
  };
  return (
    <section className="planning-workspace" aria-label="Internal route planning">
      <h2>Internal route review and recurring planning</h2>
      <p>
        Planning only. No route can be released for student transport. Dedicated Student planning
        resources do not enter ordinary dispatch.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() =>
          void run(
            "refresh",
            async () => {
              await reload();
              retry.current = null;
              setPreview(null);
              setHistory(null);
              setVersionHistory(null);
              setEditor(null);
            },
            false,
          )
        }
      >
        Refresh planning
      </button>
      {message ? <p role="status">{message}</p> : null}
      {busy ? <p role="status">Checking planning…</p> : null}
      {context ? (
        <>
          <p>
            Showing up to 200 current records and 100 recent manifest revisions. Use date-specific
            history below for an older manifest.
          </p>
          {!canReview ? (
            <p>
              You can inspect planning records. Explicit reviewer admission is required to change or
              approve them.
            </p>
          ) : null}
          {canReview ? (
            <>
              <h3>1. Review records</h3>
              <div className="portal-actions">
                <button
                  type="button"
                  disabled={busy || !request}
                  onClick={() => setEditor({ kind: "policy" })}
                >
                  Add qualification policy
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditor({ kind: "resource" })}
                >
                  Add dedicated resource
                </button>
              </div>
              <p>
                Select the source request to review that customer's qualification policy, students
                and loading points.
              </p>
              <label>
                Source geographic request
                <select
                  aria-label="Source geographic request"
                  value={requestId}
                  disabled={busy}
                  onChange={(e) => {
                    setRequest(e.target.value);
                    setEditor(null);
                  }}
                >
                  <option value="">Choose submitted request</option>
                  {requests
                    .filter((r) => r.status === "submitted" && r.geography_status === "geocoded")
                    .map((r) => (
                      <option key={r.request_id} value={r.request_id}>
                        {new Date(r.scheduled_at).toLocaleString()} · {r.destination_address}
                      </option>
                    ))}
                </select>
              </label>
              {request ? (
                <>
                  <h4>Review each requested student</h4>
                  {readRequestStudents(request.students).map((s, i) => (
                    <div className="contact-card" key={i}>
                      <p>
                        {s.name} · {s.pickupAddress}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditor({ kind: "student", index: i })}
                      >
                        Register student {i + 1} identity
                      </button>
                    </div>
                  ))}
                  <div className="portal-actions">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditor({ kind: "point" })}
                    >
                      Review loading point
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditor({ kind: "schedule" })}
                    >
                      Create recurring schedule
                    </button>
                  </div>
                </>
              ) : null}
              {editor && editor.kind !== "schedule" ? (
                <PlanningRecordEditor
                  key={`${editor.kind}:${editor.record?.id ?? "new"}:${editor.index ?? 0}:${requestId}`}
                  kind={editor.kind}
                  {...(editor.record ? { record: editor.record } : {})}
                  {...(request ? { request } : {})}
                  initialIndex={editor.index ?? 0}
                  busy={busy}
                  saveMessage={message}
                  onSave={saveRecord}
                  onClose={() => setEditor(null)}
                />
              ) : null}
              {editor?.kind === "schedule" && request ? (
                <PlanningScheduleEditor
                  key={`${editor.record?.id ?? "new"}:${requestId}`}
                  {...(editor.record ? { record: editor.record } : {})}
                  request={request}
                  records={records}
                  busy={busy}
                  onSave={saveSchedule}
                  onClose={() => setEditor(null)}
                />
              ) : null}
            </>
          ) : null}
          <h3>Reviewed record register</h3>
          {records
            .filter((r) => r.kind !== "schedule")
            .map((r) => (
              <details className="notice" key={r.id}>
                <summary>
                  {r.kind}: {scalarText(r.data.name ?? r.data.label ?? r.reference)} · revision{" "}
                  {r.revision} · {r.state}
                </summary>
                <p>
                  Reference {r.reference}. Reviewed {new Date(r.recordedAt).toLocaleString()} by{" "}
                  {r.actorId}. Reason: {r.reason}.
                </p>
                <p>
                  Valid {scalarText(r.data.validFrom)} through {scalarText(r.data.validUntil)}.
                </p>
                {r.kind === "point" ? (
                  <p>
                    {scalarText(r.data.loadingType)} · {scalarText(r.data.address)} ·{" "}
                    {scalarText(r.data.instructions ?? "")}
                  </p>
                ) : null}
                {canReview ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const sourceRequest =
                        r.kind === "point"
                          ? requests.find((q) => q.request_id === r.data.requestId)
                          : requests.find(
                              (q) => q.customer_id === r.customerId && q.status === "submitted",
                            );
                      if (sourceRequest) setRequest(sourceRequest.request_id);
                      setEditor({
                        kind: r.kind as "student" | "point" | "policy" | "resource",
                        record: r,
                      });
                    }}
                  >
                    Revise or revoke review
                  </button>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      "history",
                      async () => {
                        const result = await client
                          .from("student_planning_versions")
                          .select("*")
                          .eq("tenant_id", tenantId)
                          .eq("entity_id", r.id)
                          .order("revision")
                          .limit(100);
                        if (result.error) throw Error(result.error.message);
                        if (mounted.current) setVersionHistory(result.data);
                      },
                      false,
                    )
                  }
                >
                  Show review history
                </button>
              </details>
            ))}
          {versionHistory ? (
            <div className="notice">
              <h4>Immutable review history (up to 100 revisions)</h4>
              <ol>
                {versionHistory.map((v) => (
                  <li key={v.revision}>
                    Revision {v.revision}: {v.state} · {new Date(v.recorded_at).toLocaleString()} ·
                    reviewer {v.actor_id} · {v.reason}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <h3>2. Preview and approve planning</h3>
          <label>
            Recurring schedule
            <select
              aria-label="Recurring schedule"
              value={selectedPlan}
              disabled={busy}
              onChange={(e) => {
                setPlan(e.target.value);
                controller.current?.abort();
                setPreview(null);
                setHistory(null);
              }}
            >
              <option value="">Choose schedule</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {scalarText(p.data.name)} · revision {p.revision} · {p.state.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          {plan ? (
            <div className="notice">
              <p>
                {scalarText(plan.data.direction)} · {scalarText(plan.data.timeZone)} ·{" "}
                {scalarText(plan.data.startDate)} to {scalarText(plan.data.endDate)} ·{" "}
                {scalarText(plan.data.startTime)}–{scalarText(plan.data.endTime)}
              </p>
              <p>State: {plan.state.replaceAll("_", " ")}. Transport execution unavailable.</p>
              {canReview && plan.state !== "cancelled" ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const sourceRequest = requests.find(
                      (r) => r.request_id === plan.data.requestId,
                    );
                    if (!sourceRequest) {
                      setMessage("Source request unavailable; refresh requests.");
                      return;
                    }
                    setRequest(sourceRequest.request_id);
                    setEditor({ kind: "schedule", record: plan });
                  }}
                >
                  Create revised schedule draft
                </button>
              ) : null}
              {plan.state !== "cancelled" ? (
                <button type="button" disabled={busy} onClick={roadPreview}>
                  Preview reviewed route
                </button>
              ) : null}
              {preview && preview.planId === plan.id && preview.revision === plan.revision ? (
                <>
                  <StudentRouteMap
                    stops={preview.stops}
                    route={preview.route}
                    accessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
                    reviewed
                  />
                  {canReview && plan.state === "draft" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const reason = formText(new FormData(e.currentTarget), "reason");
                        void run(
                          JSON.stringify([
                            "approve",
                            plan.id,
                            plan.revision,
                            preview.receiptId,
                            reason,
                          ]),
                          async (key) => {
                            const result = await client.rpc("approve_student_route_plan", {
                              t: tenantId,
                              id: plan.id,
                              expected_revision: plan.revision,
                              receipt_value: preview.receiptId,
                              reason_value: reason,
                              request_key: key,
                            });
                            if (result.error) throw Error(result.error.message);
                            await saved();
                          },
                        );
                      }}
                    >
                      <fieldset disabled={busy}>
                        <TextField label="Planning approval reason" name="reason" maxLength={300} />
                        <label className="check">
                          <input type="checkbox" required />I reviewed identity, school authority,
                          loading points, route order, loading time, calendar and dedicated resource
                          evidence.
                        </label>
                        <button>Approve planning data</button>
                      </fieldset>
                    </form>
                  ) : null}
                </>
              ) : null}
              <h4>3. Daily planning manifests</h4>
              {canReview ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const args = {
                      t: tenantId,
                      id: plan.id,
                      expected_revision: plan.revision,
                      from_day: formText(f, "from"),
                      to_day: formText(f, "to"),
                      reason_value: formText(f, "reason"),
                      cancel_value: formText(f, "action") === "cancel",
                    };
                    void run(JSON.stringify(args), async (key) => {
                      const result = await client.rpc("generate_student_manifests", {
                        ...args,
                        request_key: key,
                      });
                      if (result.error) throw Error(result.error.message);
                      await saved();
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <TextField label="Manifest dates from" name="from" type="date" />
                    <TextField
                      label="Manifest dates through (maximum 14 dates)"
                      name="to"
                      type="date"
                    />
                    <label>
                      Daily planning action
                      <select aria-label="Daily planning action" name="action">
                        <option value="generate">Generate or revise planning manifests</option>
                        <option value="cancel">Cancel planning manifests for these dates</option>
                      </select>
                    </label>
                    <TextField label="Manifest change reason" name="reason" maxLength={300} />
                    <button>Apply daily planning action</button>
                  </fieldset>
                </form>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const date = formText(new FormData(e.currentTarget), "date");
                  void run(
                    "manifest-history",
                    async () => {
                      const result = await client
                        .from("student_daily_manifests")
                        .select("*")
                        .eq("tenant_id", tenantId)
                        .eq("schedule_id", plan.id)
                        .eq("service_date", date)
                        .order("revision")
                        .limit(100);
                      if (result.error) throw Error(result.error.message);
                      if (mounted.current) setHistory(result.data);
                    },
                    false,
                  );
                }}
              >
                <fieldset disabled={busy}>
                  <TextField label="Manifest history date" name="date" type="date" />
                  <button className="secondary">Show all revisions for date</button>
                </fieldset>
              </form>
              {(history ?? context.manifests.filter((m) => m.schedule_id === plan.id)).map((m) => (
                <ManifestDetails key={`${m.service_date}:${m.revision}`} manifest={m} />
              ))}
              {history && !history.length ? <p>No manifest revisions on that date.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
