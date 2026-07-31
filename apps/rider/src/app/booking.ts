export const cancellableBookingStatuses = new Set(["requested", "offered", "accepted", "arrived"]);

export function canCancelBooking(status: string) {
  return cancellableBookingStatuses.has(status);
}

export function bookingStatusLabel(status: string) {
  return (
    {
      requested: "Finding a driver",
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
