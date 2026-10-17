import { validCoordinates, type StudentStop, type StudentRoadRoute } from "@esh-platform/maps";
export const ACCOMMODATIONS = {
  wheelchair_lift: "Wheelchair lift",
  booster_seat: "Booster seat",
  car_seat: "Car seat",
  attendant: "Dedicated attendant",
} as const;
export type Accommodation = keyof typeof ACCOMMODATIONS;
export type AddressChoice = {
  address: string;
  latitude: number;
  longitude: number;
  loadingInstructions: string;
};
export type GeographicStudent = {
  name: string;
  pickup: AddressChoice | null;
  accommodations: Accommodation[];
};
export type GeographicPreview = {
  receiptId: string;
  stops: StudentStop[];
  route: StudentRoadRoute;
};
export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function readAddress(value: unknown): AddressChoice {
  if (
    !object(value) ||
    typeof value.address !== "string" ||
    value.address.trim().length < 5 ||
    value.address.length > 400 ||
    !validCoordinates(value.latitude, value.longitude) ||
    typeof value.loadingInstructions !== "string" ||
    value.loadingInstructions.length > 300
  )
    throw Error("Select a complete address");
  return {
    address: value.address.trim(),
    latitude: value.latitude,
    longitude: value.longitude as number,
    loadingInstructions: value.loadingInstructions.trim(),
  };
}
export function readGeographicInput(value: unknown) {
  if (
    !object(value) ||
    !uuid(value.tenantId) ||
    !uuid(value.customerId) ||
    typeof value.scheduledAt !== "string" ||
    !Number.isFinite(Date.parse(value.scheduledAt)) ||
    Date.parse(value.scheduledAt) <= Date.now() ||
    Date.parse(value.scheduledAt) > Date.now() + 366 * 86400000 ||
    !Array.isArray(value.students) ||
    value.students.length < 1 ||
    value.students.length > 20
  )
    throw Error("Check request details");
  const students = value.students.map((s: unknown) => {
    if (
      !object(s) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      s.name.length > 120 ||
      !Array.isArray(s.accommodations) ||
      s.accommodations.length > 4 ||
      s.accommodations.some(
        (a) => typeof a !== "string" || !Object.prototype.hasOwnProperty.call(ACCOMMODATIONS, a),
      )
    )
      throw Error("Check student requirements");
    return {
      name: s.name.trim(),
      pickup: readAddress(s.pickup),
      accommodations: [...new Set(s.accommodations as Accommodation[])].sort(),
    };
  });
  return {
    tenantId: value.tenantId,
    customerId: value.customerId,
    scheduledAt: new Date(value.scheduledAt).toISOString(),
    destination: readAddress(value.destination),
    students,
  };
}
export function readSavedStops(value: unknown): StudentStop[] {
  if (
    !object(value) ||
    value.safetyStatus !== "unreviewed" ||
    !Array.isArray(value.stops) ||
    value.stops.length < 2 ||
    value.stops.length > 21
  )
    throw Error("Unverified geography");
  return value.stops.map((s: unknown) => {
    const address = readAddress(s);
    if (
      !object(s) ||
      s.safetyStatus !== "unreviewed" ||
      !validCoordinates(s.addressLatitude, s.addressLongitude) ||
      typeof s.accuracy !== "string" ||
      (s.pointSource !== "routable" && s.pointSource !== "address")
    )
      throw Error("Unverified geography");
    return {
      ...address,
      addressLatitude: s.addressLatitude,
      addressLongitude: s.addressLongitude as number,
      accuracy: s.accuracy,
      pointSource: s.pointSource,
      safetyStatus: "unreviewed",
    };
  });
}
