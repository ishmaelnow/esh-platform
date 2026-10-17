import { describe, expect, it } from "vitest";
import { readGeographicInput } from "./geography";
const address = {
  address: "TEST 123 Street, City, PA",
  latitude: 40,
  longitude: -75,
  loadingInstructions: "North gate",
};
const body = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  customerId: "00000000-0000-0000-0000-000000000002",
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  destination: address,
  students: [
    { name: "TEST STUDENT", pickup: address, accommodations: ["attendant", "wheelchair_lift"] },
  ],
};
describe("Student geographic intake", () => {
  it("retains per-student requirements and loading instructions", () =>
    expect(readGeographicInput(body).students[0]).toMatchObject({
      accommodations: ["attendant", "wheelchair_lift"],
      pickup: { loadingInstructions: "North gate" },
    }));
  it("rejects arbitrary health metadata and inherited object keys", () => {
    for (const tag of ["diagnosis", "constructor", "__proto__"])
      expect(() =>
        readGeographicInput({
          ...body,
          students: [{ ...body.students[0], accommodations: [tag] }],
        }),
      ).toThrow();
  });
  it("requires selected coordinates and future time", () => {
    expect(() =>
      readGeographicInput({ ...body, destination: { ...address, latitude: NaN } }),
    ).toThrow();
    expect(() => readGeographicInput({ ...body, scheduledAt: "2000-01-01" })).toThrow();
  });
});
