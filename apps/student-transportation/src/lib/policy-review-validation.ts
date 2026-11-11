// Mirrors policy input constraints in save_student_planning_record. SQL remains authoritative.
const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const normalizeCredentialKey = (value: string) => {
  const name = value
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[`'"\u2018\u2019\u201c\u201d]/g, "")
    .toLowerCase();
  if (/^[a-z][a-z0-9_]{1,63}$/.test(name)) return name;
  const key = name.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) return "";
  return /^[0-9]/.test(key) || key.length === 1 ? `qualification_${key}` : key;
};

export const credentialKeys = (value: string) =>
  value.split(",").map(normalizeCredentialKey).filter(Boolean);

export const qualificationName = (key: string) => {
  const name = key.replaceAll("_", " ");
  // Show readable saved names only when editing them preserves the exact existing identifier.
  return normalizeCredentialKey(name) === key ? name : key;
};

export function policyReviewIssues(form: FormData, existingReference?: string): string[] {
  const issues: string[] = [];
  for (const [name, label, min, max] of [
    ["reference", "Policy reference", 1, 100],
    ["sourceReference", "Approved district policy reference", 3, 200],
    ["reason", "Review or change reason", 3, 300],
  ] as const) {
    const value = name === "reference" ? (existingReference ?? text(form, name)) : text(form, name);
    if (value.length < min || value.length > max)
      issues.push(`${label}: enter ${min}–${max} characters.`);
  }
  const from = text(form, "validFrom");
  const through = text(form, "validUntil");
  if (!isDate(from)) issues.push("Review valid from: enter a valid date.");
  if (!isDate(through)) issues.push("Review valid through: enter a valid date.");
  if (isDate(from) && isDate(through) && through < from)
    issues.push("Review valid through must be on or after Review valid from.");

  const fields: Array<[string, string, boolean]> = [
    ["driverKeys", "Required Driver qualifications", true],
    ["attendantKeys", "Required attendant qualifications", true],
  ];
  for (const [tag, label] of [
    ["wheelchair_lift", "Wheelchair lift"],
    ["booster_seat", "Booster seat"],
    ["car_seat", "Car seat"],
  ]) {
    fields.push([`driver_${tag}`, `${label} Driver qualifications`, false]);
    fields.push([`attendant_${tag}`, `${label} attendant qualifications`, false]);
  }
  for (const [name, label, required] of fields) {
    const keys = credentialKeys(text(form, name));
    const unusable = text(form, name)
      .split(",")
      .some((value) => value.trim() && !normalizeCredentialKey(value));
    if ((required && keys.length === 0) || unusable)
      issues.push(`${label}: enter a qualification name.`);
    if (keys.length > 20) issues.push(`${label}: enter no more than 20 qualifications.`);
    if (keys.some((key) => !/^[a-z][a-z0-9_]{1,63}$/.test(key)))
      issues.push(`${label}: shorten the qualification name.`);
  }
  if (!form.has("policyReviewed"))
    issues.push("Confirm that you reviewed the policy and qualifications.");
  return issues;
}
