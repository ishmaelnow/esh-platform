"use client";
import { useEffect, useState, type FormEvent } from "react";

export default function DriverApplicationPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tenantSlug, setTenantSlug] = useState("");
  useEffect(() => {
    void params.then(({ tenantSlug: slug }) => setTenantSlug(slug));
  }, [params]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage("Preparing files and submitting your application…");
    try {
      const form = new FormData(formElement);
      form.set("tenantSlug", tenantSlug);
      for (const field of ["personalPhoto", "vehiclePhoto", "document"]) {
        const file = form.get(field);
        if (file instanceof File && file.type.startsWith("image/")) {
          form.set(field, await reduceImage(file));
        }
      }
      const totalFileBytes = [...form.values()].reduce(
        (total, value) => total + (value instanceof File ? value.size : 0),
        0,
      );
      if (totalFileBytes > 4_000_000) {
        throw new Error(
          "The selected files are still too large. Use a reference document smaller than 1 MB.",
        );
      }
      const response = await fetch("/api/applications/driver", { method: "POST", body: form });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to submit application.");
      setMessage("Application submitted for review.");
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit application.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="panel">
        <h1>Apply to drive</h1>
        <p>Submit your details and required files.</p>
        <form className="settings-grid" onSubmit={(event) => void submit(event)}>
          <label>
            Full name
            <input name="fullName" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Phone
            <input name="phone" />
          </label>
          <label>
            Personal photo
            <input
              accept="image/jpeg,image/png"
              capture="user"
              name="personalPhoto"
              type="file"
              required
            />
          </label>
          <label>
            Vehicle photo
            <input
              accept="image/jpeg,image/png"
              capture="environment"
              name="vehiclePhoto"
              type="file"
              required
            />
          </label>
          <label>
            Reference document
            <input
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              name="document"
              type="file"
              required
            />
          </label>
          <button className="primary-button" disabled={submitting || !tenantSlug} type="submit">
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </form>
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
  );
}

async function reduceImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.58]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= 1_000_000) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    }
  }
  throw new Error(`${file.name} could not be reduced below 1 MB. Choose a smaller image.`);
}
