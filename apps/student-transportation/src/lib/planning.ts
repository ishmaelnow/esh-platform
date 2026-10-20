import type { Json, Database } from "@esh-platform/supabase";
import { validCoordinates, type StudentStop } from "@esh-platform/maps";
export type PlanningKind = "student" | "point" | "policy" | "resource" | "schedule";
export function planningRecordFailure(error: { code?: string; message: string }) {
  const code = /^[A-Z0-9]{5}$/.test(error.code ?? "") ? error.code : undefined;
  const canCorrect = !!code && /^(P0001|22[A-Z0-9]{3}|23[A-Z0-9]{3}|42501)$/.test(code);
  let message: string;
  if (/^Use explicit (equipment )?credential keys$/.test(error.message))
    message =
      "Planning save failed: credential keys must use lowercase letters, numbers and underscores. Remove backticks and quotation marks.";
  else if (code === "23505")
    message =
      "Planning save failed: that reference already exists. Find it in the reviewed record register instead of creating it again.";
  else if (code === "42501")
    message = "Planning save failed: your account does not have permission to save this review.";
  else if (code?.startsWith("22"))
    message = "Planning save failed: check the review dates and field values.";
  else
    message = `Planning save failed${code ? ` (${code})` : ""}. Check your entries and access. If the result is uncertain, retry unchanged or refresh planning before changing it.`;
  return { message, canCorrect };
}
export function reviewedCredentialKeys(value: string, label: string): string[] {
  const keys = value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length > 20 || keys.some((key) => !/^[a-z][a-z0-9_]{1,63}$/.test(key)))
    throw Error(
      `${label}: use lowercase letters, numbers and underscores, starting with a letter. Remove backticks and quotation marks.`,
    );
  return keys;
}
export const scalarText = (value: unknown, fallback = ""): string =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : fallback;
export type PlanningRecord = {
  id: string;
  kind: PlanningKind;
  customerId: string | null;
  reference: string;
  revision: number;
  state: string;
  data: Record<string, Json | undefined>;
  actorId: string;
  recordedAt: string;
  reason: string;
};
export type PlanningManifest = Database["public"]["Tables"]["student_daily_manifests"]["Row"];
export type PlanningContext = { records: PlanningRecord[]; manifests: PlanningManifest[] };
export const jsonObject = (value: unknown): value is Record<string, Json | undefined> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function readPlanning(value: unknown): PlanningContext {
  if (
    !jsonObject(value) ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.manifests) ||
    value.operationallyReady !== false
  )
    throw Error("Planning unavailable");
  const records = value.records.map((r) => {
    if (
      !jsonObject(r) ||
      typeof r.id !== "string" ||
      typeof r.reference !== "string" ||
      typeof r.revision !== "number" ||
      !["student", "point", "policy", "resource", "schedule"].includes(scalarText(r.kind)) ||
      !jsonObject(r.data) ||
      typeof r.state !== "string" ||
      (r.customerId !== null && typeof r.customerId !== "string") ||
      typeof r.actorId !== "string" ||
      typeof r.recordedAt !== "string" ||
      typeof r.reason !== "string"
    )
      throw Error("Planning record unavailable");
    return {
      id: r.id,
      kind: r.kind as PlanningKind,
      customerId: r.customerId,
      reference: r.reference,
      revision: r.revision,
      state: r.state,
      data: r.data,
      actorId: r.actorId,
      recordedAt: r.recordedAt,
      reason: r.reason,
    };
  });
  return {
    records,
    manifests: value.manifests.filter(
      (m): m is PlanningManifest =>
        jsonObject(m) &&
        typeof m.schedule_id === "string" &&
        typeof m.service_date === "string" &&
        typeof m.revision === "number" &&
        typeof m.state === "string" &&
        jsonObject(m.snapshot),
    ),
  };
}
export const recordRef = (record: PlanningRecord) => ({ id: record.id, revision: record.revision });
export function planningStops(value: unknown): StudentStop[] {
  if (
    !jsonObject(value) ||
    !jsonObject(value.snapshot) ||
    !Array.isArray(value.snapshot.points) ||
    value.snapshot.points.length < 2 ||
    value.snapshot.points.length > 21
  )
    throw Error("Approved points unavailable");
  return value.snapshot.points.map((p) => {
    if (
      !jsonObject(p) ||
      !jsonObject(p.data) ||
      !validCoordinates(p.data.latitude, p.data.longitude) ||
      typeof p.data.address !== "string" ||
      typeof p.data.instructions !== "string"
    )
      throw Error("Approved point unavailable");
    return {
      address: p.data.address,
      latitude: p.data.latitude,
      longitude: p.data.longitude as number,
      addressLatitude: p.data.latitude,
      addressLongitude: p.data.longitude as number,
      accuracy: "reviewed",
      pointSource: "address",
      loadingInstructions: p.data.instructions,
      safetyStatus: "unreviewed",
    };
  });
}
export function parseCalendar(text: string) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const split = line.indexOf(" ");
      if (
        split < 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(line.slice(0, split)) ||
        line.slice(split).trim().length < 3
      )
        throw Error("Use one closure per line: YYYY-MM-DD reason");
      return { date: line.slice(0, split), reason: line.slice(split).trim() };
    });
}
export const stringValue = (data: Record<string, Json | undefined>, key: string, fallback = "") =>
  typeof data[key] === "string" ? data[key] : fallback;
export const arrayValue = (data: Record<string, Json | undefined>, key: string): Json[] =>
  Array.isArray(data[key]) ? (data[key] as Json[]) : [];
export function vehicleBlockers(vehicle: PlanningRecord, students: PlanningRecord[]) {
  const d = vehicle.data;
  const requirements = (s: PlanningRecord) => arrayValue(s.data, "requirements");
  const seats = students.filter((s) => s.data.seating !== "wheelchair").length;
  const wheels = students.length - seats;
  const attendants = students.filter((s) => requirements(s).includes("attendant")).length;
  const blockers: string[] = [];
  for (const [key, count, label] of [
    ["seats", seats + attendants, "passenger/attendant seats"],
    ["wheelchairPositions", wheels, "wheelchair positions"],
    [
      "boosterSeats",
      students.filter((s) => requirements(s).includes("booster_seat")).length,
      "booster seats",
    ],
    ["carSeats", students.filter((s) => requirements(s).includes("car_seat")).length, "car seats"],
  ] as const) {
    if (typeof d[key] !== "number" || d[key] < count) blockers.push(label);
  }
  if (students.some((s) => requirements(s).includes("wheelchair_lift")) && d.lift !== true)
    blockers.push("wheelchair lift");
  if (wheels && d.securementReviewed !== true) blockers.push("reviewed securement");
  return blockers;
}
export function credentialsCover(
  resource: PlanningRecord,
  keys: Json[],
  from: string,
  until: string,
) {
  if (
    !from ||
    !until ||
    typeof resource.data.validFrom !== "string" ||
    typeof resource.data.validUntil !== "string" ||
    resource.data.validFrom > from ||
    resource.data.validUntil < until
  )
    return false;
  return keys.every((key) =>
    arrayValue(resource.data, "credentials").some(
      (c) =>
        jsonObject(c) &&
        c.key === key &&
        typeof c.validFrom === "string" &&
        typeof c.validUntil === "string" &&
        c.validFrom <= from &&
        c.validUntil >= until,
    ),
  );
}
export function policyCredentialKeys(
  policy: PlanningRecord,
  role: "driver" | "attendant",
  students: PlanningRecord[],
): Json[] | null {
  const keys = [...arrayValue(policy.data, role === "driver" ? "driverKeys" : "attendantKeys")];
  const equipment =
    policy.data[role === "driver" ? "equipmentDriverKeys" : "equipmentAttendantKeys"];
  const tags = new Set(
    students
      .flatMap((s) => arrayValue(s.data, "requirements"))
      .filter((tag): tag is string => typeof tag === "string" && tag !== "attendant"),
  );
  for (const tag of tags) {
    const conditional = jsonObject(equipment) ? arrayValue(equipment, tag) : [];
    if (!conditional.length) return null;
    keys.push(...conditional);
  }
  return keys.length ? keys : null;
}
