"use client";
import { scalarText, reviewedCredentialKeys } from "../lib/planning";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Json, Database } from "@esh-platform/supabase";
import { ACCOMMODATIONS } from "../lib/geography";
import { readRequestStudents } from "../lib/customer";
import {
  jsonObject,
  stringValue,
  arrayValue,
  type PlanningRecord,
  type PlanningKind,
} from "../lib/planning";
import { readSavedStops } from "../lib/geography";
type RequestRow = Database["public"]["Tables"]["student_transportation_requests"]["Row"];
export type RecordSubmission = {
  kind: Exclude<PlanningKind, "schedule">;
  customerId: string | null;
  reference: string;
  id: string | null;
  revision: number;
  state: string;
  data: Json;
  reason: string;
};
export function TextField({
  label,
  name,
  value = "",
  type = "text",
  maxLength = 200,
  required = true,
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
export const formText = (form: FormData, key: string) => scalarText(form.get(key) ?? "").trim();
export function PlanningRecordEditor({
  kind,
  record,
  request,
  initialIndex = 0,
  busy,
  saveMessage = "",
  onSave,
  onClose,
}: {
  kind: Exclude<PlanningKind, "schedule">;
  record?: PlanningRecord;
  request?: RequestRow;
  initialIndex?: number;
  busy: boolean;
  saveMessage?: string;
  onSave: (body: RecordSubmission) => void;
  onClose: () => void;
}) {
  const data = record?.data ?? {};
  const students = request ? readRequestStudents(request.students) : [];
  const stops = request?.geography_status === "geocoded" ? readSavedStops(request.geography) : [];
  const [index, setIndex] = useState(Number(data.stopIndex ?? initialIndex));
  const [role, setRole] = useState(stringValue(data, "role", "vehicle"));
  const [credentials, setCredentials] = useState<Array<Record<string, Json | undefined>>>(() =>
    arrayValue(data, "credentials").filter(jsonObject),
  );
  const [requirements, setRequirements] = useState<string[]>(() =>
    record
      ? arrayValue(data, "requirements").filter((v): v is string => typeof v === "string")
      : (students[initialIndex]?.accommodations ?? []),
  );
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "center" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      const invalid = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement>(
        "input:invalid, select:invalid, textarea:invalid",
      );
      if (invalid) {
        const label =
          invalid.labels?.[0]?.textContent?.trim().replace(/\s+/g, " ") ?? "review field";
        invalid.focus();
        throw Error(`Check ${label}: ${invalid.validationMessage}`);
      }
      const f = new FormData(event.currentTarget);
      const common = { validFrom: formText(f, "validFrom"), validUntil: formText(f, "validUntil") };
      let next: Json;
      if (kind === "student")
        next = {
          ...common,
          name: formText(f, "name"),
          authorityReviewed: f.has("authorityReviewed"),
          authorityReference: formText(f, "authorityReference"),
          requirementsReviewed: f.has("requirementsReviewed"),
          requirements,
          seating: formText(f, "seating"),
        };
      else if (kind === "point") {
        if (!request) throw Error("Choose the source request.");
        next = {
          ...common,
          requestId: request.request_id,
          stopIndex: index,
          label: formText(f, "label"),
          loadingType: formText(f, "loadingType"),
          latitude: Number(formText(f, "latitude")),
          longitude: Number(formText(f, "longitude")),
          instructions: formText(f, "instructions"),
          siteReviewed: f.has("siteReviewed"),
          siteReference: formText(f, "siteReference"),
        };
      } else if (kind === "policy")
        next = {
          ...common,
          sourceReference: formText(f, "sourceReference"),
          driverKeys: reviewedCredentialKeys(
            formText(f, "driverKeys"),
            "Required Driver credential keys",
          ),
          attendantKeys: reviewedCredentialKeys(
            formText(f, "attendantKeys"),
            "Required attendant credential keys",
          ),
          equipmentDriverKeys: Object.fromEntries(
            ["wheelchair_lift", "booster_seat", "car_seat"].map((tag) => [
              tag,
              reviewedCredentialKeys(
                formText(f, `driver_${tag}`),
                `${ACCOMMODATIONS[tag as keyof typeof ACCOMMODATIONS]} Driver keys`,
              ),
            ]),
          ),
          equipmentAttendantKeys: Object.fromEntries(
            ["wheelchair_lift", "booster_seat", "car_seat"].map((tag) => [
              tag,
              reviewedCredentialKeys(
                formText(f, `attendant_${tag}`),
                `${ACCOMMODATIONS[tag as keyof typeof ACCOMMODATIONS]} attendant keys`,
              ),
            ]),
          ),
          policyReviewed: f.has("policyReviewed"),
        };
      else
        next = {
          ...common,
          role,
          label: formText(f, "label"),
          dedicatedReviewed: f.has("dedicatedReviewed"),
          evidenceReference: formText(f, "evidenceReference"),
          credentials: credentials.map((_, i) => ({
            key: formText(f, `credentialKey${i}`),
            reference: formText(f, `credentialReference${i}`),
            validFrom: formText(f, `credentialFrom${i}`),
            validUntil: formText(f, `credentialUntil${i}`),
          })),
          seats: Number(formText(f, "seats")),
          wheelchairPositions: Number(formText(f, "wheelchairPositions")),
          boosterSeats: Number(formText(f, "boosterSeats")),
          carSeats: Number(formText(f, "carSeats")),
          lift: f.has("lift"),
          securementReviewed: f.has("securementReviewed"),
        };
      onSave({
        kind,
        customerId:
          kind !== "resource" ? (record?.customerId ?? request?.customer_id ?? null) : null,
        reference: record?.reference ?? formText(f, "reference"),
        id: record?.id ?? null,
        revision: record?.revision ?? 0,
        state: formText(f, "state"),
        data: next,
        reason: formText(f, "reason"),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check review details.");
    }
  };
  const title = {
    student: "Student identity and requirements",
    point: "Loading point review",
    policy: "District qualification policy",
    resource: "Dedicated planning resource",
  }[kind];
  return (
    <form className="notice planning-editor" onSubmit={submit} noValidate>
      <h3 ref={heading} tabIndex={-1}>
        {record ? "New revision: " : "Add "}
        {title}
      </h3>
      <p>
        Only record reviews supported by your approved school/district procedures. This does not
        authorize a ride.
      </p>
      <fieldset disabled={busy}>
        <TextField
          label={
            kind === "student"
              ? "School student reference"
              : kind === "resource"
                ? "Unique person or vehicle reference"
                : kind === "point"
                  ? "Loading point reference"
                  : "Policy reference"
          }
          name="reference"
          value={record?.reference ?? ""}
          maxLength={100}
          disabled={!!record}
        />
        <label>
          Review status
          <select aria-label="Review status" name="state" defaultValue={record?.state ?? "active"}>
            <option value="active">Reviewed and current</option>
            <option value="revoked">Revoke this record</option>
          </select>
        </label>
        <TextField
          label="Review valid from"
          name="validFrom"
          type="date"
          value={stringValue(data, "validFrom")}
        />
        <TextField
          label="Review valid through"
          name="validUntil"
          type="date"
          value={stringValue(data, "validUntil")}
        />
        {kind === "student" ? (
          <>
            <TextField
              label="Canonical student name"
              name="name"
              value={stringValue(data, "name", students[initialIndex]?.name ?? "")}
              maxLength={120}
            />
            <TextField
              label="School authority evidence reference"
              name="authorityReference"
              value={stringValue(data, "authorityReference")}
            />
            <label className="check">
              <input type="checkbox" name="authorityReviewed" required />I reviewed the school's
              authority for this student and service.
            </label>
            <fieldset>
              <legend>Reviewed operational requirements</legend>
              {Object.entries(ACCOMMODATIONS).map(([key, label]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={requirements.includes(key)}
                    onChange={(e) =>
                      setRequirements((r) =>
                        e.target.checked ? [...r, key] : r.filter((v) => v !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Student seating
              <select
                aria-label="Student seating"
                name="seating"
                defaultValue={stringValue(
                  data,
                  "seating",
                  requirements.includes("wheelchair_lift") ? "wheelchair" : "seat",
                )}
              >
                <option value="seat">Passenger seat</option>
                <option value="wheelchair">Occupied wheelchair position</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="requirementsReviewed" required />I reviewed requirements,
              including an explicit finding if none are needed.
            </label>
            <p>
              A source request requirement cannot be silently removed. Do not enter diagnoses or IEP
              documents.
            </p>
          </>
        ) : null}
        {kind === "point" ? (
          <>
            <label>
              Source stop
              <select
                aria-label="Source stop"
                value={index}
                disabled={!!record}
                onChange={(e) => setIndex(Number(e.target.value))}
              >
                {stops.map((s, i) => (
                  <option key={i} value={i}>
                    {i === stops.length - 1 ? "School destination" : `Student ${i + 1} home`} —{" "}
                    {s.address}
                  </option>
                ))}
              </select>
            </label>
            <div key={index}>
              <TextField
                label="Approved point label"
                name="label"
                value={stringValue(data, "label")}
                maxLength={100}
              />
              <label>
                Loading type
                <select
                  aria-label="Loading type"
                  name="loadingType"
                  defaultValue={stringValue(data, "loadingType", "curb")}
                >
                  <option value="curb">Curb</option>
                  <option value="driveway_loop">Driveway loop</option>
                  <option value="designated_zone">Designated loading zone</option>
                </select>
              </label>
              <label>
                Approved latitude
                <input
                  name="latitude"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  required
                  defaultValue={Number(data.latitude ?? stops[index]?.latitude)}
                />
              </label>
              <label>
                Approved longitude
                <input
                  name="longitude"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  required
                  defaultValue={Number(data.longitude ?? stops[index]?.longitude)}
                />
              </label>
              <TextField
                label="Loading instructions (optional)"
                name="instructions"
                value={stringValue(data, "instructions", stops[index]?.loadingInstructions ?? "")}
                required={false}
                maxLength={300}
              />
            </div>
            <TextField
              label="Site or district loading approval reference"
              name="siteReference"
              value={stringValue(data, "siteReference")}
            />
            <label className="check">
              <input type="checkbox" name="siteReviewed" required />I verified this specific loading
              point under the applicable site policy.
            </label>
            <p>
              Coordinates begin at the geocoded point. Enter the verified gate/curb coordinates; a
              large move needs a new address request.
            </p>
          </>
        ) : null}
        {kind === "policy" ? (
          <>
            <TextField
              label="Approved district policy reference"
              name="sourceReference"
              value={stringValue(data, "sourceReference")}
            />
            <TextField
              label="Required Driver credential keys (comma-separated)"
              name="driverKeys"
              value={arrayValue(data, "driverKeys")
                .map((v) => scalarText(v))
                .join(", ")}
            />
            <TextField
              label="Required attendant credential keys (comma-separated)"
              name="attendantKeys"
              value={arrayValue(data, "attendantKeys")
                .map((v) => scalarText(v))
                .join(", ")}
            />
            <p>
              Use your reviewed policy's evidence identifiers, such as district_driver_clearance. No
              jurisdiction's requirements are assumed by the software.
            </p>
            <fieldset>
              <legend>Equipment-specific qualification keys</legend>
              <p>
                For each equipment type used by a route, specify matching Driver and attendant
                qualifications. The same approved credential key may cover multiple requirements.
              </p>
              {(["wheelchair_lift", "booster_seat", "car_seat"] as const).map((tag) => (
                <div key={tag}>
                  <TextField
                    label={`${ACCOMMODATIONS[tag]} Driver keys (comma-separated)`}
                    name={`driver_${tag}`}
                    required={false}
                    value={
                      jsonObject(data.equipmentDriverKeys)
                        ? arrayValue(data.equipmentDriverKeys, tag)
                            .map((v) => scalarText(v))
                            .join(", ")
                        : ""
                    }
                  />
                  <TextField
                    label={`${ACCOMMODATIONS[tag]} attendant keys (comma-separated)`}
                    name={`attendant_${tag}`}
                    required={false}
                    value={
                      jsonObject(data.equipmentAttendantKeys)
                        ? arrayValue(data.equipmentAttendantKeys, tag)
                            .map((v) => scalarText(v))
                            .join(", ")
                        : ""
                    }
                  />
                </div>
              ))}
            </fieldset>
            <label className="check">
              <input type="checkbox" name="policyReviewed" required />I reviewed the applicable
              policy and its required qualifications.
            </label>
          </>
        ) : null}
        {kind === "resource" ? (
          <>
            <label>
              Resource role
              <select
                aria-label="Resource role"
                value={role}
                disabled={!!record}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="vehicle">Vehicle</option>
                <option value="driver">Driver</option>
                <option value="attendant">Attendant</option>
              </select>
            </label>
            <TextField
              label="Resource display name"
              name="label"
              value={stringValue(data, "label")}
              maxLength={120}
            />
            <TextField
              label="Reviewed resource evidence reference"
              name="evidenceReference"
              value={stringValue(data, "evidenceReference")}
            />
            <label className="check">
              <input type="checkbox" name="dedicatedReviewed" required />
              This resource is dedicated to Student planning and I reviewed its eligibility
              evidence.
            </label>
            <p>
              Do not register resources shared with ordinary Transportation. Shared-resource
              conflict controls are not implemented.
            </p>
            {role === "vehicle" ? (
              <fieldset>
                <legend>Reviewed vehicle configuration</legend>
                {[
                  ["seats", "Passenger seats, excluding Driver and wheelchair positions"],
                  ["wheelchairPositions", "Equipped wheelchair positions"],
                  ["boosterSeats", "Available booster seats"],
                  ["carSeats", "Available car seats"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      type="number"
                      min={0}
                      max={100}
                      required
                      defaultValue={Number(data[name!] ?? 0)}
                    />
                  </label>
                ))}
                <label className="check">
                  <input type="checkbox" name="lift" defaultChecked={data.lift === true} />
                  Wheelchair lift available
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="securementReviewed"
                    defaultChecked={data.securementReviewed === true}
                  />
                  Wheelchair securement configuration reviewed
                </label>
                <p>
                  Use capacities for this exact seating configuration; do not count the same space
                  as both a seat and wheelchair position. Attendants consume passenger seats.
                </p>
              </fieldset>
            ) : null}
            <fieldset>
              <legend>Reviewed credentials</legend>
              {credentials.map((c, i) => (
                <fieldset key={i} className="contact-card">
                  <legend>Credential {i + 1}</legend>
                  <TextField
                    label="Credential key"
                    name={`credentialKey${i}`}
                    value={stringValue(c, "key")}
                    maxLength={64}
                  />
                  <TextField
                    label="Credential evidence reference"
                    name={`credentialReference${i}`}
                    value={stringValue(c, "reference")}
                  />
                  <TextField
                    label="Credential valid from"
                    name={`credentialFrom${i}`}
                    type="date"
                    value={stringValue(c, "validFrom")}
                  />
                  <TextField
                    label="Credential valid through"
                    name={`credentialUntil${i}`}
                    type="date"
                    value={stringValue(c, "validUntil")}
                  />
                </fieldset>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={credentials.length >= 20}
                onClick={() => setCredentials((c) => [...c, {}])}
              >
                Add credential
              </button>
              {credentials.length ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCredentials((c) => c.slice(0, -1))}
                >
                  Remove last credential
                </button>
              ) : null}
            </fieldset>
          </>
        ) : null}
        <TextField label="Review or change reason" name="reason" maxLength={300} />
        {error || saveMessage ? <p role="alert">{error || saveMessage}</p> : null}
        <div className="portal-actions">
          <button>Save reviewed revision</button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel review
          </button>
        </div>
      </fieldset>
    </form>
  );
}
