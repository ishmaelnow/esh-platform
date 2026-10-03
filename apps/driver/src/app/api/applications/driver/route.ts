import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { applicationFiles, validateApplicationFile } from "../../../../lib/application";

class ApplicationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function verifiedApplicant(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim())
    throw new ApplicationError("Verify your email to continue.", 401);
  const client = createAuthenticatedSupabaseClient(authorization.slice(7));
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email || !user.email_confirmed_at)
    throw new ApplicationError("A verified email session is required.", 401);
  return { client, user };
}

function failure(error: unknown) {
  return NextResponse.json({ message: error instanceof ApplicationError ? error.message : "Application service is unavailable. Please try again." },
    { status: error instanceof ApplicationError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}

async function boundedForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError("Application files are required.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4_400_000) { await reader.cancel(); throw new ApplicationError("Application uploads must total less than 4.4 MB.", 413); }
      chunks.push(new Uint8Array(part.value));
    }
    return await new Response(new Blob(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError("Application form could not be read.");
  } finally { reader.releaseLock(); }
}

export async function GET(request: Request) {
  try {
    const { client } = await verifiedApplicant(request);
    const result = await client.rpc("my_driver_applications");
    if (result.error || !Array.isArray(result.data)) throw new Error("Application status unavailable");
    return NextResponse.json({ applications: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await verifiedApplicant(request);
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    if (declaredSize > 4_400_000) throw new ApplicationError("Application uploads must total less than 4.4 MB.", 413);
    const form = await boundedForm(request);
    const textField = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
    const tenantSlug = textField("tenantSlug").toLowerCase();
    const fullName = textField("fullName");
    const phone = textField("phone");
    if (!/^[a-z0-9-]{1,100}$/.test(tenantSlug) || fullName.length < 2 || fullName.length > 120 || phone.length > 40)
      throw new ApplicationError("Choose a company and enter your full name and a valid phone number.");
    // Neither email, application ID, tenant ID nor applicant identity is accepted from the form.
    const directory = await client.rpc("list_transport_application_tenants");
    if (directory.error) throw new Error("Company directory unavailable");
    if (!directory.data?.some((company) => company.tenant_slug === tenantSlug))
      throw new ApplicationError("This company is not accepting applications.");
    const files: Array<{ file: File; type: string }> = [];
    for (const entry of applicationFiles) {
      const file = form.get(entry.field);
      if (file instanceof File && file.size) {
        await validateApplicationFile(file, entry.type);
        files.push({ file, type: entry.type });
      }
    }
    if (!files.length) throw new ApplicationError("Add the required application files.");
    const service = createServiceSupabaseClient();
    const tenant = await service.from("tenant_configurations").select("tenant_id").eq("tenant_slug", tenantSlug).single();
    if (tenant.error || !tenant.data) throw new Error("Company unavailable");
    const bucket = service.storage.from("driver-application-files");
    const evidence: Array<{ evidence_type: string; storage_path: string; original_file_name: string; mime_type: string; size_bytes: number }> = [];
    try {
      for (const { file, type } of files) {
        const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
        const path = `${tenant.data.tenant_id}/${user.id}/${crypto.randomUUID()}/${type}.${extension}`;
        const upload = await bucket.upload(path, file, { upsert: false });
        if (upload.error) throw new Error("Upload failed");
        evidence.push({ evidence_type: type, storage_path: path, original_file_name: file.name, mime_type: file.type, size_bytes: file.size });
      }
    } catch {
      if (evidence.length) await bucket.remove(evidence.map((item) => item.storage_path));
      throw new ApplicationError("File upload failed. Your application was not changed; please try again.", 503);
    }
    // Do not remove objects if the RPC outcome is unknown: it may have committed before a network failure.
    const submitted = await service.rpc("submit_driver_application_with_evidence_internal", {
      applicant_user_id: user.id, application_tenant_slug: tenantSlug,
      applicant_name: fullName, applicant_phone: phone, uploaded_evidence: evidence,
    });
    if (submitted.error || !submitted.data) {
      // A Postgres exception is a confirmed transaction rollback; transport errors remain ambiguous.
      if (["P0001", "23514", "23505", "23503"].includes(submitted.error?.code ?? "")) {
        await bucket.remove(evidence.map((item) => item.storage_path));
        throw new ApplicationError("Application could not be submitted. Refresh its status before trying again.", 409);
      }
      throw new ApplicationError("Submission could not be confirmed. Refresh status before retrying.", 503);
    }
    const result = submitted.data as { applicationId?: string; acceptedPaths?: string[] };
    const unused = evidence.filter((item) => !result.acceptedPaths?.includes(item.storage_path));
    if (unused.length && Array.isArray(result.acceptedPaths)) await bucket.remove(unused.map((item) => item.storage_path));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /Choose a JPEG|Each file/.test(error.message)) return failure(new ApplicationError(error.message));
    return failure(error);
  }
}
