export type DispatchBookingInput = {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  notes: string;
};

export type MatchingSettingsInput = {
  automaticMatchingEnabled: boolean;
  offerDurationSeconds: number;
  maximumAttempts: number;
};

export function parseMatchingSettingsInput(input: Record<string, unknown>): MatchingSettingsInput {
  if (typeof input.automaticMatchingEnabled !== "boolean")
    throw new Error("Automatic matching must be enabled or disabled.");
  const offerDurationSeconds = wholeNumber(input.offerDurationSeconds, "Offer duration");
  const maximumAttempts = wholeNumber(input.maximumAttempts, "Maximum attempts");
  if (offerDurationSeconds < 30 || offerDurationSeconds > 300)
    throw new Error("Offer duration must be between 30 and 300 seconds.");
  if (maximumAttempts < 1 || maximumAttempts > 10)
    throw new Error("Maximum attempts must be between 1 and 10.");
  return {
    automaticMatchingEnabled: input.automaticMatchingEnabled,
    offerDurationSeconds,
    maximumAttempts,
  };
}

export function parseDispatchBookingInput(input: Record<string, unknown>): DispatchBookingInput {
  const customerName = text(input.customerName);
  const customerPhone = text(input.customerPhone);
  const pickupAddress = text(input.pickupAddress);
  const destinationAddress = text(input.destinationAddress);
  const notes = text(input.notes);
  if (!customerName || !pickupAddress || !destinationAddress)
    throw new Error("Customer, pickup, and destination are required.");
  if (
    customerName.length > 160 ||
    customerPhone.length > 60 ||
    pickupAddress.length > 500 ||
    destinationAddress.length > 500 ||
    notes.length > 1000
  )
    throw new Error("One or more booking fields are too long.");
  return { customerName, customerPhone, pickupAddress, destinationAddress, notes };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function wholeNumber(value: unknown, label: string) {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(result)) throw new Error(`${label} must be a whole number.`);
  return result;
}
