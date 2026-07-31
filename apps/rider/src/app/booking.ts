export const cancellableBookingStatuses = new Set(["requested", "offered", "accepted", "arrived"]);

export function canCancelBooking(status: string) {
  return cancellableBookingStatuses.has(status);
}

export function bookingStatusLabel(status: string) {
  return (
    {
      requested: "Finding a driver",
      scheduled: "Scheduled",
      offered: "Driver notified",
      accepted: "Driver accepted",
      arrived: "Driver arrived",
      in_progress: "Trip in progress",
      completed: "Completed",
      cancelled: "Cancelled",
    }[status] ?? status.replaceAll("_", " ")
  );
}

export function normalizeTenantSlug(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function riderErrorMessage(value: unknown) {
  const fallback = "Something went wrong. Please try again.";
  if (!(value instanceof Error)) return fallback;
  const message = value.message.trim();
  return message || fallback;
}

export function formatDateTimeInputInZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function zonedDateTimeToIso(localValue: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) throw new Error("Choose a valid pickup date and time.");
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = formatDateTimeInputInZone(new Date(candidate), timeZone);
    const renderedMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(rendered);
    if (!renderedMatch) break;
    const renderedWall = Date.UTC(
      Number(renderedMatch[1]),
      Number(renderedMatch[2]) - 1,
      Number(renderedMatch[3]),
      Number(renderedMatch[4]),
      Number(renderedMatch[5]),
    );
    candidate += desired - renderedWall;
  }
  return new Date(candidate).toISOString();
}
