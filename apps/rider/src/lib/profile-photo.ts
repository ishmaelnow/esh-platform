export const PROFILE_PHOTO_LIMIT = 1_000_000;

export async function validateProfilePhoto(file: File) {
  if (!file.size || file.size > PROFILE_PHOTO_LIMIT) throw new Error("Choose a photo up to 1 MB.");
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = file.type === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (!jpeg && !png) throw new Error("Choose a JPEG or PNG photo.");
}

export async function prepareProfilePhoto(file: File) {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 20_000_000) {
    throw new Error("Choose a JPEG or PNG photo up to 20 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo preparation is unavailable. Try another browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PROFILE_PHOTO_LIMIT) return new File([blob], "profile.jpg", { type: "image/jpeg" });
    }
    throw new Error("Choose a smaller photo.");
  } finally { bitmap.close(); }
}
