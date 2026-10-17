"use client";
import { scalarText } from "../lib/planning";
import { policyCredentialKeys } from "../lib/planning";
import { useState, type FormEvent } from "react";
import type { Json, Database } from "@esh-platform/supabase";
import { readRequestStudents } from "../lib/customer";
import { ACCOMMODATIONS } from "../lib/geography";
import {
  jsonObject,
  arrayValue,
  stringValue,
  recordRef,
  parseCalendar,
  vehicleBlockers,
  credentialsCover,
  type PlanningRecord,
} from "../lib/planning";
import { TextField, formText } from "./PlanningRecordEditor";
type RequestRow = Database["public"]["Tables"]["student_transportation_requests"]["Row"];
export type ScheduleSubmission = {
  id: string | null;
  revision: number;
  reference: string;
  reason: string;
  data: Json;
};
const refId = (v: Json | undefined) => (jsonObject(v) && typeof v.id === "string" ? v.id : "");
export function PlanningScheduleEditor({
  record,
  request,
  records,
  busy,
  onSave,
  onClose,
}: {
  record?: PlanningRecord;
  request: RequestRow;
  records: PlanningRecord[];
  busy: boolean;
  onSave: (body: ScheduleSubmission) => void;
  onClose: () => void;
}) {
  const d = record?.data ?? {};
  const source = readRequestStudents(request.students);
  const active = records.filter((r) => r.state === "active");
  const students = active.filter(
    (r) => r.kind === "student" && r.customerId === request.customer_id,
  );
  const points = active.filter(
    (r) =>
      r.kind === "point" &&
      r.customerId === request.customer_id &&
      r.data.requestId === request.request_id,
  );
  const resources = active.filter((r) => r.kind === "resource");
  const policies = active.filter(
    (r) => r.kind === "policy" && r.customerId === request.customer_id,
  );
  const [direction, setDirection] = useState(stringValue(d, "direction", "inbound"));
  const [from, setFrom] = useState(stringValue(d, "startDate"));
  const [until, setUntil] = useState(stringValue(d, "endDate"));
  const [policyId, setPolicy] = useState(refId(d.policy));
  const [driverId, setDriver] = useState(refId(d.driver));
  const [vehicleId, setVehicle] = useState(refId(d.vehicle));
  const [attendants, setAttendants] = useState<string[]>(() =>
    arrayValue(d, "attendants").map(refId),
  );
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    d.weekdays ? arrayValue(d, "weekdays").map(Number) : [1, 2, 3, 4, 5],
  );
  const [mapping, setMapping] = useState<
    Array<{ sourceIndex: number; id: string; confirmed: boolean }>
  >(() =>
    d.students
      ? arrayValue(d, "students")
          .filter(jsonObject)
          .map((s) => ({
            sourceIndex: Number(s.sourceIndex),
            id: refId(s),
            confirmed: s.identityConfirmed === true,
          }))
      : source.map((_, i) => ({ sourceIndex: i, id: "", confirmed: false })),
  );
  const [pointIds, setPointIds] = useState<Record<number, string>>(() => {
    const result: Record<number, string> = {};
    for (const p of arrayValue(d, "points")) {
      const id = refId(p);
      const point = records.find((r) => r.id === id);
      if (point) result[Number(point.data.stopIndex)] = id;
    }
    return result;
  });
  const [error, setError] = useState("");
  const selectedStudents = mapping
    .map((s) => students.find((r) => r.id === s.id))
    .filter((v): v is PlanningRecord => !!v);
  const policy = policies.find((p) => p.id === policyId);
  const orderedIndices =
    direction === "inbound"
      ? [...mapping.map((s) => s.sourceIndex), source.length]
      : [source.length, ...mapping.map((s) => s.sourceIndex)];
  const getRef = (id: string) => {
    const r = active.find((r) => r.id === id);
    return r ? recordRef(r) : null;
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const bindings = mapping.map((m) => {
        const ref = getRef(m.id);
        if (!ref || !m.confirmed) throw Error("Confirm each student identity mapping.");
        return { ...ref, sourceIndex: m.sourceIndex, identityConfirmed: true };
      });
      const orderedPoints = orderedIndices.map((i) => {
        const ref = getRef(pointIds[i] ?? "");
        if (!ref) throw Error("Select every reviewed loading point.");
        return ref;
      });
      onSave({
        id: record?.id ?? null,
        revision: record?.revision ?? 0,
        reference: record?.reference ?? formText(f, "reference"),
        reason: formText(f, "reason"),
        data: {
          requestId: request.request_id,
          name: formText(f, "name"),
          direction,
          timeZone: formText(f, "timeZone"),
          startDate: from,
          endDate: until,
          startTime: formText(f, "startTime"),
          endTime: formText(f, "endTime"),
          bufferMinutes: Number(formText(f, "bufferMinutes")),
          weekdays,
          exceptions: parseCalendar(formText(f, "exceptions")),
          calendarReviewed: f.has("calendarReviewed"),
          students: bindings,
          points: orderedPoints,
          policy: getRef(policyId),
          driver: getRef(driverId),
          vehicle: getRef(vehicleId),
          attendants: attendants
            .map((id) => getRef(id))
            .filter((v): v is { id: string; revision: number } => !!v),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check schedule details.");
    }
  };
  return (
    <form className="notice planning-editor" onSubmit={save}>
      <h3>{record ? "Revise" : "Create"} recurring schedule draft</h3>
      <p>
        One school/group request per schedule. Use separate morning and afternoon templates. Changes
        create a new draft requiring fresh road preview and planning approval.
      </p>
      <fieldset disabled={busy}>
        <TextField
          label="Schedule reference"
          name="reference"
          value={record?.reference ?? ""}
          disabled={!!record}
          maxLength={100}
        />
        <TextField
          label="Schedule name"
          name="name"
          value={stringValue(d, "name")}
          maxLength={120}
        />
        <label>
          Journey direction
          <select
            aria-label="Journey direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="inbound">Student homes to school</option>
            <option value="outbound">School to student homes</option>
          </select>
        </label>
        <label>
          School local time zone
          <select
            aria-label="School local time zone"
            name="timeZone"
            defaultValue={stringValue(d, "timeZone")}
            required
          >
            <option value="">Choose time zone</option>
            {[
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "America/Phoenix",
              "America/Anchorage",
              "Pacific/Honolulu",
              "UTC",
            ].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <label>
          Term start
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Term end
          <input type="date" required value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <TextField
          label="First pickup time (school local)"
          name="startTime"
          type="time"
          value={stringValue(d, "startTime")}
        />
        <TextField
          label="Final drop-off deadline (school local)"
          name="endTime"
          type="time"
          value={stringValue(d, "endTime")}
        />
        <label>
          Resource reservation buffer before and after (minutes)
          <input
            name="bufferMinutes"
            type="number"
            min={0}
            max={120}
            required
            defaultValue={Number(d.bufferMinutes ?? 0)}
          />
        </label>
        <fieldset>
          <legend>School service weekdays</legend>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
            (day, i) => (
              <label className="check" key={day}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(i + 1)}
                  onChange={(e) =>
                    setWeekdays((w) =>
                      e.target.checked ? [...w, i + 1].sort() : w.filter((v) => v !== i + 1),
                    )
                  }
                />
                {day}
              </label>
            ),
          )}
        </fieldset>
        <label>
          School closures and holidays (optional)
          <textarea
            name="exceptions"
            maxLength={15000}
            placeholder="2026-11-26 School closed"
            defaultValue={arrayValue(d, "exceptions")
              .filter(jsonObject)
              .map((e) => `${scalarText(e.date)} ${scalarText(e.reason)}`)
              .join("\n")}
          />
        </label>
        <p>
          One closure per line: YYYY-MM-DD followed by its reason. No holidays are assumed
          automatically.
        </p>
        <label className="check">
          <input
            type="checkbox"
            name="calendarReviewed"
            required
            defaultChecked={d.calendarReviewed === true}
          />
          I reviewed school dates, direction, service windows and calendar exceptions.
        </label>
        <fieldset>
          <legend>Canonical students and explicit stop order</legend>
          {mapping.map((m, i) => (
            <fieldset className="contact-card" key={m.sourceIndex}>
              <legend>
                Stop order {i + 1}: {source[m.sourceIndex]?.name}
              </legend>
              <p>Requested pickup: {source[m.sourceIndex]?.pickupAddress}</p>
              <label>
                Reviewed student identity
                <select
                  aria-label="Reviewed student identity"
                  required
                  value={m.id}
                  onChange={(e) =>
                    setMapping((rows) =>
                      rows.map((r, j) =>
                        i === j ? { ...r, id: e.target.value, confirmed: false } : r,
                      ),
                    )
                  }
                >
                  <option value="">Select canonical student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.reference} — {scalarText(s.data.name)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Reviewed requirements:{" "}
                {selectedStudents.find((s) => s.id === m.id)
                  ? arrayValue(selectedStudents.find((s) => s.id === m.id)!.data, "requirements")
                      .map(
                        (tag) =>
                          ACCOMMODATIONS[tag as keyof typeof ACCOMMODATIONS] ?? scalarText(tag),
                      )
                      .join(", ") || "Reviewed: none recorded"
                  : "Select a reviewed student"}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={m.confirmed}
                  onChange={(e) =>
                    setMapping((rows) =>
                      rows.map((r, j) => (i === j ? { ...r, confirmed: e.target.checked } : r)),
                    )
                  }
                />
                I confirmed this request entry is the selected student.
              </label>
              <div className="portal-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={i === 0}
                  onClick={() =>
                    setMapping((rows) => {
                      const next = [...rows];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      return next;
                    })
                  }
                >
                  Move earlier
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={i === mapping.length - 1}
                  onClick={() =>
                    setMapping((rows) => {
                      const next = [...rows];
                      [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
                      return next;
                    })
                  }
                >
                  Move later
                </button>
              </div>
            </fieldset>
          ))}
        </fieldset>
        <fieldset>
          <legend>Approved loading points in route order</legend>
          {orderedIndices.map((index, i) => (
            <label key={index}>
              Stop {i + 1}: {index === source.length ? "School" : source[index]?.name}
              <select
                aria-label={`Stop ${i + 1}: ${index === source.length ? "School" : source[index]?.name}`}
                required
                value={pointIds[index] ?? ""}
                onChange={(e) => setPointIds((p) => ({ ...p, [index]: e.target.value }))}
              >
                <option value="">Select reviewed loading point</option>
                {points
                  .filter((p) => Number(p.data.stopIndex) === index)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {scalarText(p.data.label)} — {scalarText(p.data.loadingType)}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Dedicated resources (required before planning approval)</legend>
          <label>
            Qualification policy
            <select
              aria-label="Qualification policy"
              value={policyId}
              onChange={(e) => setPolicy(e.target.value)}
            >
              <option value="">Not selected</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} · revision {p.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vehicle configuration
            <select
              aria-label="Vehicle configuration"
              value={vehicleId}
              onChange={(e) => setVehicle(e.target.value)}
            >
              <option value="">Not selected</option>
              {resources
                .filter((r) => r.data.role === "vehicle")
                .map((r) => {
                  const blockers = vehicleBlockers(r, selectedStudents);
                  return (
                    <option key={r.id} value={r.id} disabled={!!blockers.length}>
                      {scalarText(r.data.label)}
                      {blockers.length ? ` — missing ${blockers.join(", ")}` : ""}
                    </option>
                  );
                })}
            </select>
          </label>
          <label>
            Driver
            <select
              aria-label="Driver"
              value={driverId}
              onChange={(e) => setDriver(e.target.value)}
            >
              <option value="">Not selected</option>
              {resources
                .filter((r) => r.data.role === "driver")
                .map((r) => {
                  const requiredKeys = policy
                    ? policyCredentialKeys(policy, "driver", selectedStudents)
                    : null;
                  const eligible = !!requiredKeys && credentialsCover(r, requiredKeys, from, until);
                  return (
                    <option key={r.id} value={r.id} disabled={!eligible}>
                      {scalarText(r.data.label)}
                      {eligible ? "" : " — credentials/term need review"}
                    </option>
                  );
                })}
            </select>
          </label>
          <fieldset>
            <legend>Dedicated attendants</legend>
            {resources
              .filter((r) => r.data.role === "attendant")
              .map((r) => (
                <label className="check" key={r.id}>
                  <input
                    type="checkbox"
                    checked={attendants.includes(r.id)}
                    disabled={
                      !policy ||
                      !policyCredentialKeys(policy, "attendant", selectedStudents) ||
                      !credentialsCover(
                        r,
                        policyCredentialKeys(policy, "attendant", selectedStudents) ?? [],
                        from,
                        until,
                      )
                    }
                    onChange={(e) =>
                      setAttendants((ids) =>
                        e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                      )
                    }
                  />
                  {scalarText(r.data.label)}
                </label>
              ))}
          </fieldset>
          <p>
            One distinct attendant per student requesting a dedicated attendant. Capacity, evidence
            dates and overlapping reservations are also enforced by the server.
          </p>
        </fieldset>
        <TextField label="Schedule change reason" name="reason" maxLength={300} />
        <div className="portal-actions">
          <button>Save schedule draft</button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel schedule edit
          </button>
        </div>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
