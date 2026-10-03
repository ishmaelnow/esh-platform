"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PlatformSupabaseClient, SupabaseAuthSession } from "@esh-platform/supabase";
import { applicationFiles, applicationStatusLabel, missingApplicationFiles, reduceApplicationImage,
  type DriverApplicationStatus } from "../lib/application";

type Company = { tenant_slug: string; display_name: string };

export function DriverApplication({ client, session, onApproved, activationMessage }: {
  client: PlatformSupabaseClient; session: SupabaseAuthSession; onApproved: () => Promise<void>; activationMessage: string;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [applications, setApplications] = useState<DriverApplicationStatus[]>([]);
  const [tenantSlug, setTenantSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const application = applications.find((item) => item.tenantSlug === tenantSlug);
  const terminal = application?.status === "rejected" || application?.status === "withdrawn";
  const missing = missingApplicationFiles(application);
  const canSubmit = !application || (application.status === "submitted" && missing.length > 0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [directory, response] = await Promise.all([
        client.rpc("list_transport_application_tenants"),
        fetch("/api/applications/driver", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }),
      ]);
      const result = await response.json() as { applications?: DriverApplicationStatus[]; message?: string };
      if (!response.ok || !Array.isArray(result.applications)) throw new Error(result.message ?? "Application status is unavailable.");
      // Status remains accessible if this company stops accepting new applications.
      const options = new Map<string, Company>();
      for (const company of directory.data ?? []) options.set(company.tenant_slug, company);
      for (const item of result.applications) if (!options.has(item.tenantSlug))
        options.set(item.tenantSlug, { tenant_slug: item.tenantSlug, display_name: item.companyName });
      if (directory.error && !result.applications.length) throw new Error("Company directory is unavailable. Please try again.");
      setCompanies([...options.values()]);
      setApplications(result.applications);
      setTenantSlug((current) => current || result.applications![0]?.tenantSlug || (options.size === 1 ? [...options.keys()][0] ?? "" : ""));
      setLoaded(true);
    } catch (error) { setLoaded(false); setMessage(error instanceof Error ? error.message : "Unable to load application status."); }
    finally { setLoading(false); }
  }, [client, session.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("tenantSlug", tenantSlug);
    if (application) { form.set("fullName", application.fullName); form.set("phone", application.phone ?? ""); }
    setBusy(true); setMessage(""); setStatusMessage("");
    try {
      for (const file of missing) {
        const original = form.get(file.field);
        if (!(original instanceof File) || !original.size) throw new Error(`Add your ${file.label.toLowerCase()}.`);
        const reduced = await reduceApplicationImage(original);
        if (reduced.size > 1_000_000) throw new Error(`Choose a ${file.label.toLowerCase()} smaller than 1 MB.`);
        form.set(file.field, reduced);
      }
      const response = await fetch("/api/applications/driver", {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form,
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Unable to submit application.");
      formElement.reset();
      await refresh();
      setStatusMessage("Your application and files were received. The company will review them.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit application. Refresh status before retrying."); }
    finally { setBusy(false); }
  }

  return <section className="driver-application" aria-busy={busy || loading}>
    <header><p className="eyebrow">Join ESH Driver</p><h2>{application ? "Your application" : "Apply to drive"}</h2></header>
    <p>Verified email: <strong>{session.user.email}</strong></p>
    <div className="application-actions">
      <button className="secondary" disabled={busy || loading} onClick={() => void refresh()} type="button">{loading ? "Checking status…" : "Refresh status"}</button>
      <button className="secondary" disabled={busy} onClick={() => void client.auth.signOut({ scope: "local" }).then(({ error }) => { if (error) setMessage("Unable to sign out. Please try again."); })} type="button">Use a different email</button>
    </div>
    {message ? <p className="application-error" role="alert">{message}</p> : null}
    {statusMessage ? <p role="status">{statusMessage}</p> : null}
    {loaded ? <>
      {companies.length ? <label>Transportation company<select disabled={busy || loading} value={tenantSlug} onChange={(event) => { setTenantSlug(event.target.value); setStatusMessage(""); }}>
        <option value="" disabled>Choose your company</option>
        {companies.map((company) => <option key={company.tenant_slug} value={company.tenant_slug}>{company.display_name}</option>)}
      </select></label> : <p>No transportation company is accepting applications right now. Please check again later.</p>}
      {application ? <div className="application-status" role="status">
        <h3>{applicationStatusLabel(application)}</h3>
        <p>{application.fullName} · {application.companyName}</p>
        {application.status === "approved" ? <>
          <p>Continue to your Driver account to complete the company’s onboarding requirements. Approval does not automatically make you eligible to go online.</p>
          <button type="button" disabled={busy || loading} onClick={() => void onApproved()}>Continue to Driver account</button>
          <p>{activationMessage}</p>
        </> : terminal ? <p>Contact the company about its decision and your next steps.</p> : <p>{canSubmit ? "Upload the missing files below to finish your application." : missing.length ? "Review has started. Contact the company about the missing files before continuing." : "The company is reviewing your application. Refresh here to check its progress."}</p>}
        {application.documents.length ? <ul>{applicationFiles.map((file) => {
          const document = application.documents.find((item) => item.type === file.type);
          return <li key={file.type}><strong>{file.label}</strong>: {document ? `${document.status === "pending" ? "Awaiting review" : document.status === "awaiting_vehicle" ? "Received; awaiting vehicle assignment and review" : document.status} — ${document.fileName}` : "Not uploaded"}
            {document?.reviewNotes ? <p>{document.reviewNotes}</p> : null}</li>;
        })}</ul> : null}
      </div> : null}
      {tenantSlug && canSubmit ? <form key={tenantSlug} onSubmit={(event) => void submit(event)}>
        {!application ? <><label>Full name<input autoComplete="name" name="fullName" required minLength={2} maxLength={120} disabled={busy} /></label>
          <label>Phone (optional)<input autoComplete="tel" type="tel" name="phone" maxLength={40} disabled={busy} /></label></> : null}
        <p className="application-help">Photos are resized securely in your browser. Vehicle registration and insurance documents must each be under 1 MB. Your files remain private to the company’s authorized reviewers.</p>
        {missing.map((file) => <label key={file.field}>{file.label}<input name={file.field} type="file" accept={file.accept} required disabled={busy} /></label>)}
        <button disabled={busy || loading} type="submit">{busy ? "Sending application…" : application ? "Complete application" : "Submit application"}</button>
        <p className="application-help">Submitting an application does not grant access to trips. Company approval and the existing onboarding checks are required.</p>
      </form> : null}
    </> : null}
  </section>;
}
