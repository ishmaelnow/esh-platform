"use client";
import { useState } from "react";
import { ACCOMMODATIONS } from "../lib/geography";
import {
  arrayValue,
  jsonObject,
  scalarText,
  stringValue,
  type PlanningRecord,
} from "../lib/planning";
import { qualificationName } from "../lib/policy-review-validation";
import { TextField } from "./PlanningTextField";

export function SchoolPolicyFields({ record }: { record?: PlanningRecord }) {
  const data = record?.data ?? {};
  const [dynamic, setDynamic] = useState(!record || data.policyVersion === 2);
  const [enabled, setEnabled] = useState<string[]>(() => {
    const result = ["driverKeys", "attendantKeys"].filter(
      (key) => arrayValue(data, key).length > 0,
    );
    for (const role of ["driver", "attendant"])
      for (const tag of ["wheelchair_lift", "booster_seat", "car_seat"]) {
        const equipment =
          data[role === "driver" ? "equipmentDriverKeys" : "equipmentAttendantKeys"];
        if (jsonObject(equipment) && arrayValue(equipment, tag).length)
          result.push(`${role}_${tag}`);
      }
    return result;
  });
  const qualifications = (name: string, label: string, values: unknown[]) => (
    <div key={name}>
      {dynamic ? (
        <label className="check">
          <input
            type="checkbox"
            name={`require_${name}`}
            checked={enabled.includes(name)}
            onChange={(e) =>
              setEnabled((v) => (e.target.checked ? [...v, name] : v.filter((key) => key !== name)))
            }
          />
          Require {label}
        </label>
      ) : null}
      {!dynamic || enabled.includes(name) ? (
        <TextField
          label={`${name === "driverKeys" || name === "attendantKeys" ? "Required " : ""}${label} (comma-separated)`}
          name={name}
          required={dynamic || name === "driverKeys" || name === "attendantKeys"}
          value={values.map((v) => qualificationName(scalarText(v))).join(", ")}
        />
      ) : null}
    </div>
  );
  return (
    <>
      <input type="hidden" name="policyVersion" value={dynamic ? "2" : "1"} />
      {record && data.policyVersion !== 2 ? (
        <label className="check">
          <input type="checkbox" checked={dynamic} onChange={(e) => setDynamic(e.target.checked)} />
          Revise this legacy policy using school-specific rules. History stays unchanged.
        </label>
      ) : null}
      <TextField
        label="Approved district policy reference"
        name="sourceReference"
        value={stringValue(data, "sourceReference")}
      />
      {dynamic ? (
        <>
          <p>
            Choose only this school's requirements. Unselected qualification categories mean no
            additional qualification is required by this policy. Equipment, capacity and student
            accommodations remain enforced.
          </p>
          <label>
            Minimum attendants on each route
            <input
              name="minimumRouteAttendants"
              type="number"
              min={0}
              max={20}
              required
              defaultValue={Number(data.minimumRouteAttendants ?? 0)}
            />
          </label>
          <p>
            Zero means attendants are needed only for students who require one. A dedicated
            attendant cannot be shared with another student.
          </p>
          <label>
            Review coverage
            <select
              name="reviewCoverage"
              defaultValue={stringValue(data, "reviewCoverage", "full_term")}
            >
              <option value="full_term">Reviews cover the whole schedule term</option>
              <option value="service_date">
                Check each service date; renew reviews before expiry
              </option>
            </select>
          </label>
          <p>
            Checking each date allows planning beyond a review's expiry. It never permits a manifest
            for a date without valid reviews and credentials.
          </p>
          <TextField
            label="School loading-point procedure (optional)"
            name="loadingProcedure"
            required={false}
            maxLength={500}
            value={stringValue(data, "loadingProcedure")}
          />
        </>
      ) : null}
      {qualifications("driverKeys", "Driver qualifications", arrayValue(data, "driverKeys"))}
      {qualifications(
        "attendantKeys",
        "attendant qualifications",
        arrayValue(data, "attendantKeys"),
      )}
      <p>
        Enter qualification names from this school's reviewed policy, separated by commas. Attendant
        qualifications apply only when an attendant is assigned.
      </p>
      <fieldset>
        <legend>Equipment qualifications</legend>
        {(["wheelchair_lift", "booster_seat", "car_seat"] as const).map((tag) => (
          <div key={tag}>
            {qualifications(
              `driver_${tag}`,
              `${ACCOMMODATIONS[tag]} Driver qualifications`,
              jsonObject(data.equipmentDriverKeys) ? arrayValue(data.equipmentDriverKeys, tag) : [],
            )}
            {qualifications(
              `attendant_${tag}`,
              `${ACCOMMODATIONS[tag]} attendant qualifications`,
              jsonObject(data.equipmentAttendantKeys)
                ? arrayValue(data.equipmentAttendantKeys, tag)
                : [],
            )}
          </div>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" name="policyReviewed" required />I reviewed the applicable policy and
        its required qualifications.
      </label>
    </>
  );
}
