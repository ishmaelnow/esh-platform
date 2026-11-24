"use client";
import { useEffect, useRef, useState } from "react";
import type { Database, PlatformSupabaseClient } from "@esh-platform/supabase";
import { SavedGeographicPreview } from "./GeographicRequest";
import { readRequestStudents } from "../lib/customer";
import { ACCOMMODATIONS, readSavedStops } from "../lib/geography";
import { arrayValue, recordRef, scalarText, type PlanningRecord } from "../lib/planning";
import {
  currentBinding,
  stopReviews,
  studentSuggestions,
  type ReviewBinding,
} from "../lib/guided-planning";
import { PlanningRecordEditor, type RecordSubmission } from "./PlanningRecordEditor";
import { PlanningScheduleEditor, type ScheduleSubmission } from "./PlanningScheduleEditor";

type RequestRow = Database["public"]["Tables"]["student_transportation_requests"]["Row"];
export function GuidedRoutePlanner({
  client,
  request,
  records,
  busy,
  saveError,
  onReview,
  onSave,
}: {
  client: PlatformSupabaseClient;
  request: RequestRow;
  records: PlanningRecord[];
  busy: boolean;
  saveError: string;
  onReview: (body: RecordSubmission) => Promise<ReviewBinding | null>;
  onSave: (body: ScheduleSubmission) => void;
}) {
  const [step, setStep] = useState(1);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const heading = root.current?.querySelector<HTMLElement>("[data-step-heading]");
    heading?.focus();
  }, [step]);
  const [scheduleStarted, setScheduleStarted] = useState(false);
  const [students, setStudents] = useState<Record<number, ReviewBinding>>({});
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [points, setPoints] = useState<Record<number, ReviewBinding>>({});
  const [editing, setEditing] = useState<{ kind: "student" | "point"; index: number } | null>(null);
  const source = readRequestStudents(request.students);
  const stops = readSavedStops(request.geography);
  const activeStudents = records.filter(
    (r) => r.kind === "student" && r.state === "active" && r.customerId === request.customer_id,
  );
  const pointBinding = (i: number) => {
    if (points[i]) return currentBinding(records, points[i]);
    const candidates = stopReviews(records, request.customer_id, request.request_id, i);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const confirmedStudent = (i: number) => {
    const r = currentBinding(activeStudents, students[i]);
    return r &&
      (source[i]?.accommodations ?? []).every((tag) =>
        arrayValue(r.data, "requirements").includes(tag),
      )
      ? r
      : undefined;
  };
  const readyStudents =
    source.every((_, i) => confirmedStudent(i)) &&
    new Set(Object.values(students).map((r) => r.id)).size === source.length;
  const readyPoints = stops.every((_, i) => pointBinding(i));
  const editor = (kind: "student" | "point", index: number) =>
    editing?.kind === kind && editing.index === index ? (
      <PlanningRecordEditor
        key={`${kind}:${index}`}
        kind={kind}
        request={request}
        initialIndex={index}
        guided
        busy={busy}
        saveError={saveError}
        onClose={() => setEditing(null)}
        onSave={(body) => {
          void onReview(body).then((binding) => {
            if (!binding) return;
            if (kind === "student") {
              // Saving a review does not confirm its association with this request.
              setChoices((v) => ({ ...v, [index]: binding.id }));
              setStudents((v) => {
                const next = { ...v };
                delete next[index];
                return next;
              });
            } else setPoints((v) => ({ ...v, [index]: binding }));
            setEditing(null);
          });
        }}
      />
    ) : null;
  return (
    <section ref={root} className="notice guided-planner" aria-label="Plan this request">
      <h3>Plan this request</h3>
      <p>
        {request.destination_address} · {source.length} students
      </p>
      <ol className="planning-progress" aria-label="Planning steps">
        {["Review request", "Review stops", "Schedule and resources"].map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      <p>
        Reviews are saved individually. The schedule is saved at the last step. Unsaved choices
        clear when you leave or refresh.
      </p>
      {step === 1 ? (
        <>
          <h4 data-step-heading tabIndex={-1}>
            1. Review request
          </h4>
          <p>
            Confirm each student using the school reference and reviewed requirements. A matching
            name is only a suggestion.
          </p>
          {source.map((s, i) => {
            const suggestions = studentSuggestions(records, request.customer_id, s.name);
            const id = choices[i] ?? (suggestions.length === 1 ? suggestions[0]!.id : "");
            const selected = activeStudents.find((r) => r.id === id);
            const requirementsMatch =
              selected &&
              (s.accommodations ?? []).every((tag) =>
                arrayValue(selected.data, "requirements").includes(tag),
              );
            return (
              <div className="contact-card" key={i}>
                <h4>{s.name}</h4>
                <p>{s.pickupAddress}</p>
                <p>
                  Requested:{" "}
                  {(s.accommodations ?? []).map((t) => ACCOMMODATIONS[t]).join(", ") ||
                    "No accommodation requested"}
                </p>
                {activeStudents.length ? (
                  <label>
                    School student review
                    <select
                      aria-label={`School student review for ${s.name}`}
                      value={id}
                      disabled={busy}
                      onChange={(e) => {
                        setChoices((v) => ({ ...v, [i]: e.target.value }));
                        setStudents((v) => {
                          const next = { ...v };
                          delete next[i];
                          return next;
                        });
                      }}
                    >
                      <option value="">Choose the school student</option>
                      {activeStudents.map((r) => (
                        <option key={r.id} value={r.id}>
                          {scalarText(r.data.name)} · {r.reference}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p>No saved student review yet.</p>
                )}
                {selected ? (
                  <>
                    <p>
                      Reviewed:{" "}
                      {arrayValue(selected.data, "requirements")
                        .map(
                          (tag) =>
                            ACCOMMODATIONS[tag as keyof typeof ACCOMMODATIONS] ?? scalarText(tag),
                        )
                        .join(", ") || "None recorded"}
                      . Valid {scalarText(selected.data.validFrom)} through{" "}
                      {scalarText(selected.data.validUntil)}.
                    </p>
                    {!requirementsMatch ? (
                      <p role="alert">
                        This review does not include every requested requirement. Review it in
                        school setup before continuing.
                      </p>
                    ) : null}
                    <label className="check">
                      <input
                        type="checkbox"
                        disabled={busy || !requirementsMatch}
                        checked={!!confirmedStudent(i) && students[i]?.id === id}
                        onChange={(e) => {
                          setStudents((v) => {
                            const next = { ...v };
                            if (e.target.checked) next[i] = recordRef(selected);
                            else delete next[i];
                            return next;
                          });
                        }}
                      />
                      I confirm the school reference and requirements identify {s.name}.
                    </label>
                  </>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setEditing({ kind: "student", index: i })}
                >
                  Review a new student: {s.name}
                </button>
                {editor("student", i)}
              </div>
            );
          })}
          {new Set(Object.values(students).map((r) => r.id)).size !==
          Object.keys(students).length ? (
            <p role="alert">
              Each request entry needs a different student identity. Check the school references.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busy || !readyStudents || !!editing}
            onClick={() => setStep(2)}
          >
            Continue to stops
          </button>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h4 data-step-heading tabIndex={-1}>
            2. Review stops
          </h4>
          <p>
            Saved reviews are matched to this exact request and stop. Geocoding alone does not
            approve a safe loading point.
          </p>
          {records
            .filter(
              (r) =>
                r.kind === "policy" &&
                r.state === "active" &&
                r.customerId === request.customer_id &&
                r.data.loadingProcedure,
            )
            .map((p) => (
              <p key={p.id}>
                School procedure ({p.reference}): {scalarText(p.data.loadingProcedure)}
              </p>
            ))}
          <SavedGeographicPreview
            client={client}
            tenantId={request.tenant_id}
            requestId={request.request_id}
          />
          {stops.map((s, i) => {
            const reviewed = pointBinding(i);
            const candidates = stopReviews(records, request.customer_id, request.request_id, i);
            return (
              <div className="contact-card" key={i}>
                <h4>{i === source.length ? "School" : source[i]?.name}</h4>
                <p>{s.address}</p>
                {reviewed ? (
                  <p>
                    Reviewed: {scalarText(reviewed.data.label)} ·{" "}
                    {scalarText(reviewed.data.loadingType)} · valid{" "}
                    {scalarText(reviewed.data.validFrom)} through{" "}
                    {scalarText(reviewed.data.validUntil)}. Coordinates:{" "}
                    {scalarText(reviewed.data.latitude)}, {scalarText(reviewed.data.longitude)}.{" "}
                    {scalarText(reviewed.data.instructions)}
                  </p>
                ) : candidates.length > 0 ? (
                  <label>
                    Choose the reviewed loading point
                    <select
                      aria-label={`Reviewed loading point for stop ${i + 1}`}
                      value=""
                      disabled={busy}
                      onChange={(e) => {
                        const r = candidates.find((p) => p.id === e.target.value);
                        if (r) setPoints((v) => ({ ...v, [i]: recordRef(r) }));
                      }}
                    >
                      <option value="">Choose the current reviewed point</option>
                      {candidates.map((r) => (
                        <option value={r.id} key={r.id}>
                          {scalarText(r.data.label)} · {scalarText(r.data.loadingType)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p>Loading point needs review.</p>
                )}
                {!reviewed ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing({ kind: "point", index: i })}
                  >
                    Review this stop
                  </button>
                ) : null}
                {editor("point", i)}
              </div>
            );
          })}
          <div className="portal-actions">
            <button
              type="button"
              disabled={busy || !!editing}
              className="secondary"
              onClick={() => setStep(1)}
            >
              Back to request
            </button>
            <button
              type="button"
              disabled={busy || !readyStudents || !readyPoints || !!editing}
              onClick={() => {
                setScheduleStarted(true);
                setStep(3);
              }}
            >
              Continue to schedule
            </button>
          </div>
        </>
      ) : null}
      {scheduleStarted ? (
        <div hidden={step !== 3}>
          <button type="button" className="secondary" disabled={busy} onClick={() => setStep(2)}>
            Back to stops
          </button>
          {readyStudents && readyPoints ? (
            <PlanningScheduleEditor
              request={request}
              records={records}
              busy={busy}
              guided={{
                students: source.map((_, i) => ({
                  ...recordRef(confirmedStudent(i)!),
                  sourceIndex: i,
                  identityConfirmed: true,
                })),
                points: stops.map((_, i) => recordRef(pointBinding(i)!)),
              }}
              onSave={onSave}
              onClose={() => setStep(2)}
            />
          ) : (
            <p role="alert">
              A saved review changed. Return to the request and stops to confirm the current
              reviews.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
