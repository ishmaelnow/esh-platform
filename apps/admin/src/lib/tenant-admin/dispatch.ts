export type DispatchBookingInput = {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  notes: string;
};

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
