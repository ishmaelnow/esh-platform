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
  const message = value instanceof Error
    ? value.message.trim()
    : typeof value === "object" && value !== null && "message" in value
      && typeof value.message === "string" ? value.message.trim() : "";
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

export function generateRecurringPickupTimes(options: {
  startDate: string; endDate: string; localTime: string; weekdays: number[]; timeZone: string; maximum?: number;
}) {
  const { startDate, endDate, localTime, timeZone } = options;
  const maximum = options.maximum ?? 50;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error("Choose valid recurring start and end dates.");
  if (!/^\d{2}:\d{2}$/.test(localTime)) throw new Error("Choose a valid recurring pickup time.");
  const weekdays = new Set(options.weekdays.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7));
  if (weekdays.size === 0) throw new Error("Choose at least one weekday.");
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start.valueOf()) || !Number.isFinite(end.valueOf()) || end < start)
    throw new Error("Recurring end date must be on or after the start date.");
  const result: string[] = [];
  for (let current = start; current <= end; current = new Date(current.valueOf() + 86_400_000)) {
    const isoWeekday = current.getUTCDay() === 0 ? 7 : current.getUTCDay();
    if (!weekdays.has(isoWeekday)) continue;
    const date = current.toISOString().slice(0, 10);
    result.push(zonedDateTimeToIso(`${date}T${localTime}`, timeZone));
    if (result.length > maximum) throw new Error(`Recurring schedules are limited to ${maximum} trips.`);
  }
  if (result.length < 2) throw new Error("Choose dates and weekdays that create at least two trips.");
  return result;
}
