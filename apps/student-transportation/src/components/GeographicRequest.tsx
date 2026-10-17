"use client";
import { useEffect, useRef, useState } from "react";
import { StudentRouteMap } from "@esh-platform/maps/client";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import {
  ACCOMMODATIONS,
  type AddressChoice,
  type GeographicStudent,
  type GeographicPreview,
} from "../lib/geography";
import type { Customer } from "../lib/customer";

async function geography<T>(
  client: PlatformSupabaseClient,
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  const auth = await client.auth.getSession();
  if (!auth.data.session || auth.error) throw Error("Sign in again.");
  const response = await fetch("/api/geography", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.data.session.access_token}`,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const result: unknown = await response.json();
  if (!response.ok)
    throw Error(
      result &&
        typeof result === "object" &&
        "message" in result &&
        typeof result.message === "string"
        ? result.message
        : "Mapping unavailable.",
    );
  return result as T;
}
function AddressPicker({
  label,
  instructionsLabel,
  value,
  onChange,
  client,
  customer,
}: {
  label: string;
  instructionsLabel: string;
  value: AddressChoice | null;
  onChange: (value: AddressChoice | null) => void;
  client: PlatformSupabaseClient;
  customer: Customer;
}) {
  const [text, setText] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<AddressChoice[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const search = async () => {
    controller.current?.abort();
    const current = ++generation.current;
    const next = new AbortController();
    controller.current = next;
    setSearching(true);
    setMessage("");
    setSuggestions([]);
    try {
      const result = await geography<{ suggestions: AddressChoice[] }>(
        client,
        {
          action: "search",
          tenantId: customer.tenantId,
          customerId: customer.customerId,
          query: text,
        },
        next.signal,
      );
      if (current !== generation.current) return;
      setSuggestions(result.suggestions);
      if (!result.suggestions.length)
        setMessage("No address found. Include the street number, city and state.");
    } catch {
      if (current === generation.current) setMessage("Address search unavailable. Try again.");
    } finally {
      if (current === generation.current) setSearching(false);
    }
  };
  return (
    <div className="student-address-picker">
      <label>
        {label}
        <input
          required
          minLength={5}
          maxLength={400}
          value={text}
          onChange={(e) => {
            generation.current++;
            controller.current?.abort();
            setSearching(false);
            setText(e.target.value);
            setSuggestions([]);
            setMessage("");
            onChange(null);
          }}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={searching || text.trim().length < 3}
        onClick={() => void search()}
      >
        {searching ? "Searching…" : `Search ${label.toLowerCase()}`}
      </button>
      {suggestions.length ? (
        <ul aria-label={`${label} suggestions`}>
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  generation.current++;
                  controller.current?.abort();
                  setText(s.address);
                  setSuggestions([]);
                  onChange(s);
                  setMessage("Address selected. Loading point still needs staff review.");
                }}
              >
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {value ? (
        <label>
          {instructionsLabel}
          <input
            placeholder="e.g. Use the north gate"
            maxLength={300}
            value={value.loadingInstructions}
            onChange={(e) => onChange({ ...value, loadingInstructions: e.target.value })}
          />
        </label>
      ) : null}
    </div>
  );
}

const blankStudent = (): GeographicStudent & { id: string } => ({
  id: crypto.randomUUID(),
  name: "",
  pickup: null,
  accommodations: [],
});
export function GeographicRequestForm({
  client,
  customer,
  onSaved,
}: {
  client: PlatformSupabaseClient;
  customer: Customer;
  onSaved: () => Promise<void>;
}) {
  const [students, setStudents] = useState<Array<GeographicStudent & { id: string }>>(() => [
    blankStudent(),
  ]);
  const [formVersion, setFormVersion] = useState(0);
  const [destination, setDestination] = useState<AddressChoice | null>(null);
  const [schedule, setSchedule] = useState("");
  const [preview, setPreview] = useState<GeographicPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const invalidate = () => {
    generation.current++;
    controller.current?.abort();
    setPreview(null);
    setMessage("");
  };
  const body = {
    tenantId: customer.tenantId,
    customerId: customer.customerId,
    scheduledAt: schedule ? new Date(schedule).toISOString() : "",
    destination,
    students,
  };
  const complete = !!schedule && !!destination && students.every((s) => s.name.trim() && s.pickup);
  const check = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const current = ++generation.current;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    try {
      if (retry.current && retry.current.signature !== JSON.stringify(body))
        throw Error("Submission status is uncertain. Refresh requests before changing it.");
      const result = await geography<GeographicPreview>(
        client,
        { ...body, action: "preview" },
        next.signal,
      );
      if (current === generation.current) setPreview(result);
    } catch (e) {
      if (current === generation.current)
        setMessage(e instanceof Error ? e.message : "Preview unavailable.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const submit = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setMessage("");
    const current = generation.current;
    try {
      const signature = JSON.stringify(body);
      if (retry.current && retry.current.signature !== signature)
        throw Error("Refresh requests before submitting changed data.");
      retry.current ??= { signature, key: crypto.randomUUID() };
      const result = await client.rpc("submit_geographic_student_request", {
        target_tenant_id: customer.tenantId,
        target_customer_id: customer.customerId,
        idempotency_key_value: retry.current.key,
        receipt_id_value: preview.receiptId,
      });
      if (result.error)
        throw Error(
          "Submission status is uncertain. Retry unchanged or refresh requests to check before submitting again.",
        );
      if (current !== generation.current) return;
      retry.current = null;
      setStudents([blankStudent()]);
      setDestination(null);
      setSchedule("");
      setPreview(null);
      setFormVersion((v) => v + 1);
      setMessage("Transportation request submitted for review. A ride has not been booked.");
      await onSaved();
    } catch (e) {
      if (current === generation.current)
        setMessage(e instanceof Error ? e.message : "Request unavailable.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <form
      className="notice"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>Schedule a shared journey</h2>
      <fieldset disabled={busy}>
        <label>
          Requested pickup time
          <input
            type="datetime-local"
            required
            value={schedule}
            onChange={(e) => {
              invalidate();
              setSchedule(e.target.value);
            }}
          />
        </label>
        <p>Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
        <AddressPicker
          key={formVersion}
          label="Destination address"
          instructionsLabel="Gate or entrance instructions (optional)"
          value={destination}
          client={client}
          customer={customer}
          onChange={(v) => {
            invalidate();
            setDestination(v);
          }}
        />
        <p>
          All students travel to this destination. Enter the school or shared drop-off street
          address, search, then select a result. Staff will review the loading point.
        </p>
        {students.map((s, i) => (
          <fieldset className="contact-card" key={s.id}>
            <legend>Student {i + 1}</legend>
            <label>
              Student name
              <input
                required
                maxLength={120}
                value={s.name}
                onChange={(e) => {
                  invalidate();
                  setStudents((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                  );
                }}
              />
            </label>
            <AddressPicker
              label={`Pickup address ${i + 1}`}
              instructionsLabel={`Pickup instructions for student ${i + 1} (optional)`}
              value={s.pickup}
              client={client}
              customer={customer}
              onChange={(v) => {
                invalidate();
                setStudents((rows) => rows.map((r, j) => (j === i ? { ...r, pickup: v } : r)));
              }}
            />
            <p>Where this student will be collected, such as their home address.</p>
            <fieldset className="student-accommodations">
              <legend>Equipment or staffing requirements</legend>
              {Object.entries(ACCOMMODATIONS).map(([tag, label]) => (
                <label key={tag}>
                  <input
                    type="checkbox"
                    checked={s.accommodations.includes(tag as keyof typeof ACCOMMODATIONS)}
                    onChange={(e) => {
                      invalidate();
                      const key = tag as keyof typeof ACCOMMODATIONS;
                      setStudents((rows) =>
                        rows.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                accommodations: e.target.checked
                                  ? [...r.accommodations, key]
                                  : r.accommodations.filter((a) => a !== key),
                              }
                            : r,
                        ),
                      );
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {students.length > 1 ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  invalidate();
                  setStudents((rows) => rows.filter((_, j) => i !== j));
                }}
              >
                Remove student {i + 1}
              </button>
            ) : null}
          </fieldset>
        ))}
        <p>
          Enter operational requirements only; do not include diagnoses or IEP documents. Staff must
          validate equipment, capacity, eligibility and loading points.
        </p>
        <div className="portal-actions">
          <button
            type="button"
            className="secondary"
            disabled={students.length >= 20}
            onClick={() => {
              invalidate();
              setStudents((rows) => [...rows, blankStudent()]);
            }}
          >
            Add student
          </button>
          <button type="button" disabled={!complete} onClick={() => void check()}>
            Verify stops and preview route
          </button>
          <button disabled={!preview}>Submit transportation request</button>
        </div>
      </fieldset>
      {busy ? <p role="status">Checking request…</p> : null}
      {preview ? (
        <>
          <StudentRouteMap
            stops={preview.stops}
            route={preview.route}
            accessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
          />
          <ol>
            {preview.stops.map((s, i) => (
              <li key={i}>
                {s.address} ·{" "}
                {s.pointSource === "routable"
                  ? "Provider vehicle access point"
                  : "Address point; precise loading location unresolved"}
                {s.loadingInstructions ? ` · ${s.loadingInstructions}` : ""}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}

export function SavedGeographicPreview({
  client,
  tenantId,
  requestId,
}: {
  client: PlatformSupabaseClient;
  tenantId: string;
  requestId: string;
}) {
  const [preview, setPreview] = useState<Omit<GeographicPreview, "receiptId"> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const current = ++generation.current;
          controller.current?.abort();
          const next = new AbortController();
          controller.current = next;
          setBusy(true);
          setPreview(null);
          setMessage("");
          void geography<Omit<GeographicPreview, "receiptId">>(
            client,
            { action: "saved", tenantId, requestId },
            next.signal,
          )
            .then((result) => {
              if (current === generation.current) setPreview(result);
            })
            .catch(() => {
              if (current === generation.current)
                setMessage("Road preview unavailable. Try again.");
            })
            .finally(() => {
              if (current === generation.current) setBusy(false);
            });
        }}
      >
        {busy ? "Loading route…" : "Show proposed road route"}
      </button>
      {preview ? (
        <StudentRouteMap
          stops={preview.stops}
          route={preview.route}
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
