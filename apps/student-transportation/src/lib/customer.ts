import { ACCOMMODATIONS, type Accommodation } from "./geography";
export type Customer = { customerId: string; tenantId: string; name: string };
export type RequestStudent = {
  name: string;
  pickupAddress: string;
  accommodations?: Accommodation[];
};
export function readCustomers(value: unknown): Customer[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("customers" in value) ||
    !Array.isArray(value.customers)
  )
    throw new Error("Customer access unavailable");
  return value.customers.filter(
    (row: unknown): row is Customer =>
      !!row &&
      typeof row === "object" &&
      "customerId" in row &&
      typeof row.customerId === "string" &&
      "tenantId" in row &&
      typeof row.tenantId === "string" &&
      "name" in row &&
      typeof row.name === "string",
  );
}
export function readRequestStudents(value: unknown): RequestStudent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (row: unknown): row is RequestStudent =>
        !!row &&
        typeof row === "object" &&
        "name" in row &&
        typeof row.name === "string" &&
        "pickupAddress" in row &&
        typeof row.pickupAddress === "string",
    )
    .map((row) => ({
      name: row.name,
      pickupAddress: row.pickupAddress,
      ...(Array.isArray(row.accommodations)
        ? {
            accommodations: row.accommodations.filter(
              (a): a is Accommodation =>
                typeof a === "string" && Object.prototype.hasOwnProperty.call(ACCOMMODATIONS, a),
            ),
          }
        : {}),
    }));
}
