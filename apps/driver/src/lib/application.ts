export const applicationFiles = [
  { field: "personalPhoto", type: "personal_photo", label: "Personal photo", accept: "image/jpeg,image/png" },
  { field: "vehiclePhoto", type: "vehicle_photo", label: "Vehicle photo", accept: "image/jpeg,image/png" },
  { field: "document", type: "reference_document", label: "Vehicle registration document", accept: "image/jpeg,image/png,application/pdf" },
  { field: "insurance", type: "insurance", label: "Vehicle insurance document", accept: "image/jpeg,image/png,application/pdf" },
] as const;

export type DriverApplicationStatus = {
  applicationId: string;
  tenantSlug: string;
  companyName: string;
  fullName: string;
  phone: string | null;
  status: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  submittedAt: string;
  documents: Array<{ type: string; status: string; fileName: string; reviewNotes: string | null }>;
};

export function missingApplicationFiles(application?: DriverApplicationStatus) {
  return applicationFiles.filter((file) => !application?.documents.some((document) => document.type === file.type));
}

export function applicationStatusLabel(application: DriverApplicationStatus) {
  if (application.status === "submitted") return missingApplicationFiles(application).length ? "Finish your application" : "Application received";
  return { under_review: "Under review", approved: "Application approved", rejected: "Application declined", withdrawn: "Application withdrawn" }[application.status];
}

export async function validateApplicationFile(file: File, type: string) {
  if (!file.size || file.size > 1_000_000 || file.name.length > 200) throw new Error("Each file must be 1 MB or smaller with a short file name.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = file.type === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const pdf = ["reference_document", "insurance"].includes(type) && file.type === "application/pdf" && new TextDecoder().decode(bytes).startsWith("%PDF-");
  if (!jpeg && !png && !pdf) throw new Error("Choose a JPEG or PNG photo, or a PDF registration/insurance document.");
}

export async function reduceApplicationImage(file: File) {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable. Choose a smaller photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 1_000_000) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    throw new Error("Choose a smaller photo; it could not be reduced below 1 MB.");
  } finally { bitmap.close(); }
}
