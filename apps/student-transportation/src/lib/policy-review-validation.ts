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
    ["driverKeys", "Required Driver credential keys", true],
    ["attendantKeys", "Required attendant credential keys", true],
  ];
  for (const [tag, label] of [
    ["wheelchair_lift", "Wheelchair lift"],
    ["booster_seat", "Booster seat"],
    ["car_seat", "Car seat"],
  ]) {
    fields.push([`driver_${tag}`, `${label} Driver keys`, false]);
    fields.push([`attendant_${tag}`, `${label} attendant keys`, false]);
  }
  for (const [name, label, required] of fields) {
    const keys = text(form, name)
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    if (required && keys.length === 0) issues.push(`${label}: enter at least one key.`);
    if (keys.length > 20) issues.push(`${label}: enter no more than 20 keys.`);
    if (keys.some((key) => !/^[a-z][a-z0-9_]{1,63}$/.test(key)))
      issues.push(
        `${label}: each key must start with a lowercase letter and contain 2–64 lowercase letters, numbers or underscores. Remove quotes, backticks and spaces inside keys.`,
      );
  }
  if (!form.has("policyReviewed"))
    issues.push("Confirm that you reviewed the policy and qualifications.");
  return issues;
}
