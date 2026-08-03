export type ServiceAreaInput = {
  name: string;
  description: string | null;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  coverageMode: "all_drivers" | "selected_drivers";
};

export type ServiceAreaDraft = {
  name: string;
  description: string;
  centerLatitude: string;
  centerLongitude: string;
  radiusKm: string;
  coverageMode: string;
};

export const emptyServiceAreaDraft: ServiceAreaDraft = {
  name: "",
  description: "",
  centerLatitude: "",
  centerLongitude: "",
  radiusKm: "",
  coverageMode: "all_drivers",
};

export function restoreServiceAreaDraft(raw: string | null) {
  if (!raw) return { showForm: false, draft: emptyServiceAreaDraft };
  try {
    const stored = JSON.parse(raw) as unknown;
    if (typeof stored !== "object" || stored === null || !("draft" in stored)) throw new Error();
    const draft = stored.draft;
    if (typeof draft !== "object" || draft === null) throw new Error();
    const value = (key: keyof ServiceAreaDraft) => {
      const candidate = (draft as Record<string, unknown>)[key];
      return typeof candidate === "string" ? candidate : emptyServiceAreaDraft[key];
    };
    const coverageMode = value("coverageMode");
    return {
      showForm: "showForm" in stored && stored.showForm === true,
      draft: {
        name: value("name"),
        description: value("description"),
        centerLatitude: value("centerLatitude"),
        centerLongitude: value("centerLongitude"),
        radiusKm: value("radiusKm"),
        coverageMode: ["all_drivers", "selected_drivers"].includes(coverageMode)
          ? coverageMode
          : "all_drivers",
      },
    };
  } catch {
    return { showForm: false, draft: emptyServiceAreaDraft };
  }
}

export function parseServiceAreaInput(input: Record<string, unknown>): ServiceAreaInput {
  const name = text(input.name);
  const description = text(input.description) || null;
  const centerLatitude = number(input.centerLatitude);
  const centerLongitude = number(input.centerLongitude);
  const radiusKm = number(input.radiusKm);
  const coverageMode = input.coverageMode;

  if (!name) throw new Error("Service area name is required.");
  if (name.length > 120) throw new Error("Service area name must be 120 characters or fewer.");
  if (description && description.length > 500)
    throw new Error("Description must be 500 characters or fewer.");
  if (centerLatitude < -90 || centerLatitude > 90)
    throw new Error("Latitude must be between -90 and 90.");
  if (centerLongitude < -180 || centerLongitude > 180)
    throw new Error("Longitude must be between -180 and 180.");
  if (radiusKm <= 0 || radiusKm > 1000)
    throw new Error("Radius must be greater than 0 and no more than 1000 km.");
  if (coverageMode !== "all_drivers" && coverageMode !== "selected_drivers")
    throw new Error("Choose all eligible drivers or selected drivers only.");

  return { name, description, centerLatitude, centerLongitude, radiusKm, coverageMode };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(parsed))
    throw new Error("Service area coordinates and radius are required.");
  return parsed;
}
