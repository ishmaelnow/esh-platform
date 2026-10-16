import { describe, it, expect } from "vitest";
import { readCustomers, readRequestStudents } from "./customer";
describe("customer read models", () => {
  it("discards malformed account records without assuming tenant membership", () => {
    expect(
      readCustomers({
        customers: [
          null,
          { customerId: "c", tenantId: "t", name: "School" },
          { customerId: "bad" },
        ],
      }),
    ).toEqual([{ customerId: "c", tenantId: "t", name: "School" }]);
    expect(() => readCustomers(null)).toThrow();
  });
  it("renders only bounded-structure student request entries", () => {
    expect(
      readRequestStudents([null, { name: "Student", pickupAddress: "Address" }, { name: 12 }]),
    ).toEqual([{ name: "Student", pickupAddress: "Address" }]);
  });
});
