import { describe, it, expect } from "vitest";
import {
  vehicleBlockers,
  credentialsCover,
  policyCredentialKeys,
  parseCalendar,
  planningStops,
  readPlanning,
  type PlanningRecord,
} from "./planning";
const record = (data: PlanningRecord["data"]): PlanningRecord => ({
  id: "TEST",
  kind: "resource",
  customerId: null,
  reference: "TEST",
  revision: 1,
  state: "active",
  data,
  actorId: "TEST REVIEWER",
  recordedAt: "2026-10-17",
  reason: "TEST REVIEW",
});
describe("Student planning review boundaries", () => {
  it("reserves an attendant seat separately from an occupied wheelchair position", () => {
    const student = record({
      seating: "wheelchair",
      requirements: ["wheelchair_lift", "attendant"],
    });
    const vehicle = record({
      seats: 0,
      wheelchairPositions: 1,
      boosterSeats: 0,
      carSeats: 0,
      lift: true,
      securementReviewed: true,
    });
    expect(vehicleBlockers(vehicle, [student])).toEqual(["passenger/attendant seats"]);
    expect(vehicleBlockers({ ...vehicle, data: { ...vehicle.data, seats: 1 } }, [student])).toEqual(
      [],
    );
  });
  it("rejects missing lift, securement and actual child-restraint capacity", () => {
    const vehicle = record({
      seats: 4,
      wheelchairPositions: 0,
      boosterSeats: 0,
      carSeats: 0,
      lift: false,
      securementReviewed: false,
    });
    expect(
      vehicleBlockers(vehicle, [
        record({ seating: "wheelchair", requirements: ["wheelchair_lift"] }),
        record({ seating: "seat", requirements: ["booster_seat"] }),
      ]),
    ).toEqual(["wheelchair positions", "booster seats", "wheelchair lift", "reviewed securement"]);
  });
  it("requires qualification evidence covering the full term", () => {
    const resource = record({
      validFrom: "2026-01-01",
      validUntil: "2027-12-31",
      credentials: [{ key: "district_driver", validFrom: "2026-01-01", validUntil: "2027-06-01" }],
    });
    expect(credentialsCover(resource, ["district_driver"], "2027-01-01", "2027-05-31")).toBe(true);
    expect(credentialsCover(resource, ["district_driver"], "2027-01-01", "2027-06-02")).toBe(false);
    expect(credentialsCover(resource, ["lift_training"], "2027-01-01", "2027-05-31")).toBe(false);
  });
  it("does not treat an unspecified equipment qualification policy as approval", () => {
    const student = record({ requirements: ["wheelchair_lift"] });
    const policy = record({ driverKeys: ["district_driver"], equipmentDriverKeys: {} });
    expect(policyCredentialKeys(policy, "driver", [student])).toBeNull();
    expect(
      policyCredentialKeys(
        {
          ...policy,
          data: { ...policy.data, equipmentDriverKeys: { wheelchair_lift: ["lift_training"] } },
        },
        "driver",
        [student],
      ),
    ).toEqual(["district_driver", "lift_training"]);
  });
  it("parses explicit school closure reasons without inventing holidays", () => {
    expect(parseCalendar("")).toEqual([]);
    expect(parseCalendar("2027-01-18 TEST SCHOOL CLOSED")).toEqual([
      { date: "2027-01-18", reason: "TEST SCHOOL CLOSED" },
    ]);
    expect(() => parseCalendar("2027-01-18")).toThrow();
  });
  it("requires reviewed coordinates in the server-projected point sequence", () => {
    expect(() =>
      planningStops({
        snapshot: { points: [{ data: { address: "TEST" } }, { data: { address: "TEST" } }] },
      }),
    ).toThrow();
  });
  it("requires the explicitly closed operational state in planning reads", () => {
    expect(() => readPlanning({ records: [], manifests: [], operationallyReady: true })).toThrow();
    expect(readPlanning({ records: [], manifests: [], operationallyReady: false })).toEqual({
      records: [],
      manifests: [],
    });
  });
});
