"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CommunityModerationReport } from "@esh-platform/supabase";
import { createAdminBrowserClient } from "@/lib/browser-client";
import { loadPrincipalTenantContext } from "@/lib/tenant-admin/context";
import { parseCommunityModerationSnapshot } from "@/lib/workspace-admin/moderation";

export function CommunityWorkspaceApp() {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createAdminBrowserClient()),
    [],
  );
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<CommunityModerationReport[]>([]);
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [feedback, setFeedback] = useState<PublicFeedback[]>([]);
  const [starterPosts, setStarterPosts] = useState<StarterPost[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(
    async (selectedTenantId: string) => {
      if (!supabase) return;
      const { data, error: snapshotError } = await supabase.rpc("community_moderation_snapshot", {
        target_tenant_id: selectedTenantId,
        result_limit: 100,
      });
      if (snapshotError) throw snapshotError;
      setReports(parseCommunityModerationSnapshot(data));
    },
    [supabase],
  );
  const loadListings = useCallback(async (selectedTenantId: string) => {
    if (!supabase) return;
    const { data, error: snapshotError } = await supabase.rpc("community_service_moderation_snapshot", {
      target_tenant_id: selectedTenantId, result_limit: 100,
    });
    if (snapshotError) throw snapshotError;
    setListings(parseServiceListings(data));
  }, [supabase]);
  const loadPublicQueue = useCallback(async (selectedTenantId: string) => {
    if (!supabase) return;
    const [joins, notes] = await Promise.all([
      supabase.rpc("community_join_review_snapshot", { target_tenant_id: selectedTenantId, result_limit: 100 }),
      supabase.rpc("community_feedback_review_snapshot", { target_tenant_id: selectedTenantId, result_limit: 100 }),
    ]);
    if (joins.error) throw joins.error; if (notes.error) throw notes.error;
    setJoinRequests(parseJoinRequests(joins.data)); setFeedback(parseFeedback(notes.data));
  }, [supabase]);
  const loadStarterContent = useCallback(async (selectedTenantId: string) => {
    if (!supabase) return;
    const { data, error: snapshotError } = await supabase.rpc("community_starter_content_snapshot", { target_tenant_id: selectedTenantId, result_limit: 100 });
    if (snapshotError) throw snapshotError;
    setStarterPosts(parseStarterPosts(data));
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      if (!data.session?.user) {
        setChecking(false);
        return;
      }
      try {
        const resolution = await loadPrincipalTenantContext(supabase, data.session.user);
        if (resolution.status !== "ready")
          throw new Error("Select an active tenant from Community Administration.");
        const selectedTenantId = resolution.selectedTenant.tenant.tenant_id;
        setTenantId(selectedTenantId);
        setTenantName(resolution.selectedTenant.configuration?.display_name ?? "Tenant");
        const [roleResult, moderationRoleResult, productSessionResult] = await Promise.all([
          supabase.rpc("has_workspace_role", {
            target_tenant_id: selectedTenantId,
            target_workspace_key: "community",
            required_roles: ["community_admin", "community_moderator", "emergency_publisher"],
          }),
          supabase.rpc("has_workspace_role", {
            target_tenant_id: selectedTenantId,
            target_workspace_key: "community",
            required_roles: ["community_admin", "community_moderator"],
          }),
          supabase.rpc("has_active_product_session", {
            target_tenant_id: selectedTenantId,
            target_workspace_key: "community",
          }),
        ]);
        if (roleResult.error) throw roleResult.error;
        if (moderationRoleResult.error) throw moderationRoleResult.error;
        if (productSessionResult.error) throw productSessionResult.error;
        const admitted = Boolean(roleResult.data && productSessionResult.data);
        setAllowed(admitted);
        setCanModerate(Boolean(moderationRoleResult.data));
        if (admitted && moderationRoleResult.data) await Promise.all([loadReports(selectedTenantId), loadListings(selectedTenantId), loadPublicQueue(selectedTenantId), loadStarterContent(selectedTenantId)]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to verify Community access.");
      } finally {
        setChecking(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadListings, loadPublicQueue, loadReports, loadStarterContent, supabase]);

  useEffect(() => {
    if (!supabase || !allowed || !tenantId) return;
    const interval = window.setInterval(() => {
      void supabase
        .rpc("refresh_my_product_session", {
          target_tenant_id: tenantId,
          target_workspace_key: "community",
        })
        .then(({ data, error: refreshError }) => {
          if (refreshError || !data) {
            setAllowed(false);
            setError(
              "This Community session ended because another product or governance context became active.",
            );
          }
        });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [allowed, supabase, tenantId]);

  async function moderate(event: FormEvent<HTMLFormElement>, reportId: string) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const decision = values.get("decision");
    const reason = values.get("reason");
    setBusy(true);
    setError(null);
    try {
      const { error: decisionError } = await supabase.rpc("moderate_community_report", {
        target_report_id: reportId,
        decision_value: typeof decision === "string" ? decision : "dismiss",
        reason_value: typeof reason === "string" ? reason : "",
      });
      if (decisionError) throw decisionError;
      await loadReports(tenantId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete moderation.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewListing(event: FormEvent<HTMLFormElement>, listingId: string) {
    event.preventDefault();
    if (!supabase) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const { error: reviewError } = await supabase.rpc("review_community_service_listing", {
        target_listing_id: listingId,
        decision_value: formValue(values.get("decision"), "rejected"),
        reason_value: formValue(values.get("reason"), ""),
      });
      if (reviewError) throw reviewError;
      await loadListings(tenantId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review service listing.");
    } finally { setBusy(false); }
  }
  async function createStarterContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return;
    const values = new FormData(event.currentTarget); setBusy(true); setError(null);
    try {
      const { error: createError } = await supabase.rpc("create_community_starter_post", {
        target_tenant_id: tenantId, title_value: formValue(values.get("title"), ""), body_value: formValue(values.get("body"), ""),
        expires_at_value: formValue(values.get("expires_at"), "") || null, label_value: "Starter information",
      });
      if (createError) throw createError;
      event.currentTarget.reset(); await loadStarterContent(tenantId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create starter information."); }
    finally { setBusy(false); }
  }
  async function updateStarterContent(event: FormEvent<HTMLFormElement>, contentId: string) {
    event.preventDefault(); if (!supabase) return;
    const values = new FormData(event.currentTarget); setBusy(true); setError(null);
    try {
      const { error: updateError } = await supabase.rpc("update_community_starter_post", {
        target_tenant_id: tenantId, target_content_id: contentId, title_value: formValue(values.get("title"), ""), body_value: formValue(values.get("body"), ""), expires_at_value: formValue(values.get("expires_at"), "") || null,
      });
      if (updateError) throw updateError;
      await loadStarterContent(tenantId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update starter information."); }
    finally { setBusy(false); }
  }
  async function archiveStarterContent(contentId: string) {
    if (!supabase) return; setBusy(true); setError(null);
    try {
      const { error: archiveError } = await supabase.rpc("archive_community_starter_post", { target_tenant_id: tenantId, target_content_id: contentId, reason_value: "Starter information retired by Community Administration." });
      if (archiveError) throw archiveError;
      await loadStarterContent(tenantId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to archive starter information."); }
    finally { setBusy(false); }
  }
  async function reviewPublic(kind: "join" | "feedback", id: string, decision: string) {
    if (!supabase) return; setBusy(true); setError(null);
    try {
      if (kind === "join" && decision === "approved") {
        const { data: auth } = await supabase.auth.getSession();
        const delivery = await fetch("https://admin.eshapp.com/api/tenant-admin/notifications/deliver", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${auth.session?.access_token ?? ""}` },
          body: JSON.stringify({ tenantId, requestId: id, decision }),
        });
        if (!delivery.ok) throw new Error("Membership approved, but its email could not be delivered.");
      } else if (kind === "join") {
        const { error: resultError } = await supabase.rpc("review_community_join_request", { target_request_id: id, decision_value: decision });
        if (resultError) throw resultError;
      } else {
        const { error: resultError } = await supabase.rpc("review_community_public_feedback", { target_feedback_id: id, decision_value: decision });
        if (resultError) throw resultError;
      }
      await loadPublicQueue(tenantId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete public review."); } finally { setBusy(false); }
  }

  async function exitCommunity() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { error: leaveError } = await supabase.rpc("leave_my_product_session", {
        reason_value: "Exited ESH Community Administration.",
      });
      if (leaveError) throw leaveError;
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to exit Community Administration.");
      setBusy(false);
    }
  }

  useEffect(() => {
    if (signedIn === false && !checking)
      window.location.replace(new URL("/", window.location.origin).href);
  }, [checking, signedIn]);
  useEffect(() => {
    if (signedIn && !checking && !allowed)
      window.location.replace(new URL("/?entry=community", window.location.origin).href);
  }, [allowed, checking, signedIn]);

  if (signedIn === false)
    return (
      <State
        title="Returning to Community Administration"
        message="Sign in from the Community Administration entry page before opening operations."
      />
    );
  if (signedIn === null || checking)
    return (
      <State
        title="Loading Community workspace"
        message="Verifying explicit workspace enrollment, role, and product session."
      />
    );
  if (error && !allowed)
    return (
      <State
        title="Returning to product entry"
        message="Community requires an explicit operational session."
      />
    );

  return (
    <main className="workspace-portal">
      <header className="workspace-portal-header">
        <div>
          <p className="eyebrow">ESH Community</p>
          <h1>{tenantName} Community Administration</h1>
          <p className="muted">
            A separate operational workspace for Community safety, trust, and moderation.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void exitCommunity()}
          type="button"
        >
          {busy ? "Working…" : "Exit Community Administration"}
        </button>
      </header>
      <section className="workspace-card moderation-workspace">
        <div className="workspace-portal-header">
          <div>
            <p className="eyebrow">Safety</p>
            <h2>Moderation queue</h2>
            <p className="muted">
              Reports are private. Every decision requires a reason and creates tenant audit
              evidence.
            </p>
          </div>
          <button
            className="secondary-button"
            disabled={busy || !canModerate}
            onClick={() => void loadReports(tenantId)}
            type="button"
          >
            Refresh
          </button>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
        {!canModerate ? (
          <div className="state-block">
            <h3>Moderation role required</h3>
            <p>
              Your Community role does not include report review. Emergency publishing authority
              remains separate from moderation.
            </p>
          </div>
        ) : reports.length ? (
          <div className="moderation-list">
            {reports.map((report) => (
              <article className="moderation-case" key={report.reportId}>
                <div>
                  <p className="eyebrow">
                    {report.category} · {report.targetType}
                  </p>
                  <h3>{report.targetAuthorName}</h3>
                  <blockquote>{report.targetExcerpt}</blockquote>
                  <p>
                    <strong>Reported by:</strong> {report.reporterName}
                  </p>
                  {report.details ? (
                    <p>
                      <strong>Details:</strong> {report.details}
                    </p>
                  ) : null}
                  <time>{new Date(report.createdAt).toLocaleString()}</time>
                </div>
                <form onSubmit={(event) => void moderate(event, report.reportId)}>
                  <label>
                    Decision
                    <select name="decision">
                      <option value="dismiss">Dismiss report and clear content</option>
                      <option value="restrict">Restrict content</option>
                      <option value="remove">Remove content</option>
                      <option value="restore">Restore content</option>
                    </select>
                  </label>
                  <label>
                    Moderator reason
                    <textarea
                      maxLength={1000}
                      minLength={3}
                      name="reason"
                      placeholder="Explain the evidence and decision…"
                      required
                      rows={3}
                    />
                  </label>
                  <button disabled={busy} type="submit">
                    Complete review
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-block">
            <h3>No reports awaiting review</h3>
            <p>New member reports will appear here without exposing them in the public feed.</p>
          </div>
        )}
      </section>
      <section className="workspace-card moderation-workspace">
        <div className="workspace-portal-header">
          <div><p className="eyebrow">Services</p><h2>Service listing review</h2><p className="muted">Approve or remove provider listings before they appear in the member directory.</p></div>
          <button className="secondary-button" disabled={busy || !canModerate} onClick={() => void loadListings(tenantId)} type="button">Refresh</button>
        </div>
        {!canModerate ? <div className="state-block"><h3>Moderation role required</h3><p>Service listing review is restricted to Community moderators and administrators.</p></div> : listings.length ? <div className="moderation-list">
          {listings.map((listing) => <article className="moderation-case" key={listing.listingId}>
            <div><p className="eyebrow">{listing.serviceCategory} · {listing.status}</p><h3>{listing.title}</h3><p>{listing.description}</p><p><strong>Provider:</strong> {listing.providerName}</p><p><strong>Contact:</strong> {listing.contactEmail ?? listing.contactPhone ?? listing.websiteUrl ?? "Not provided"}</p></div>
            <form onSubmit={(event) => void reviewListing(event, listing.listingId)}><label>Decision<select name="decision"><option value="active">Approve and publish</option><option value="rejected">Reject</option><option value="suspended">Suspend</option><option value="inactive">Deactivate</option></select></label><label>Moderator reason<textarea name="reason" minLength={3} maxLength={1000} required rows={3} placeholder="Explain the evidence and decision…" /></label><button disabled={busy} type="submit">Complete review</button></form>
          </article>)}
        </div> : <div className="state-block"><h3>No service listings awaiting review</h3><p>New provider submissions will appear here.</p></div>}
      </section>
      <section className="workspace-card moderation-workspace">
        <div className="workspace-portal-header"><div><p className="eyebrow">Starter information</p><h2>Public Community guidance</h2><p className="muted">Publish clearly labeled placeholder information while the Community grows. Admins can update, expire, or archive it at any time.</p></div><button className="secondary-button" disabled={busy || !canModerate} onClick={() => void loadStarterContent(tenantId)} type="button">Refresh</button></div>
        {!canModerate ? <div className="state-block"><h3>Moderation role required</h3></div> : <>
          <form className="moderation-case" onSubmit={(event) => void createStarterContent(event)}><div><h3>Create starter information</h3><p className="muted">Example: “School season is underway.” Keep information general, useful, and easy to replace.</p><label>Title<input name="title" maxLength={180} required /></label><label>Public message<textarea name="body" maxLength={10000} required rows={3} /></label><label>Optional expiration<input name="expires_at" type="datetime-local" /></label></div><button disabled={busy} type="submit">Publish starter information</button></form>
          {starterPosts.length ? <div className="moderation-list">{starterPosts.map((starter) => <form className="moderation-case" key={starter.contentId} onSubmit={(event) => void updateStarterContent(event, starter.contentId)}><div><p className="eyebrow">{starter.label} · {starter.publicationStatus}</p><label>Title<input defaultValue={starter.title ?? ""} name="title" maxLength={180} required /></label><label>Public message<textarea defaultValue={starter.body} name="body" maxLength={10000} required rows={3} /></label><label>Expiration<input defaultValue={starter.expiresAt ? starter.expiresAt.slice(0, 16) : ""} name="expires_at" type="datetime-local" /></label></div><div><button disabled={busy} type="submit">Save changes</button><button className="secondary-button" disabled={busy || starter.publicationStatus === "archived"} onClick={(event) => { event.preventDefault(); void archiveStarterContent(starter.contentId); }} type="button">Archive</button></div></form>)}</div> : <div className="state-block"><h3>No starter information yet</h3><p>Create the first clearly labeled public placeholder.</p></div>}
        </>}
      </section>
      <section className="workspace-card moderation-workspace"><div className="workspace-portal-header"><div><p className="eyebrow">Public entry</p><h2>Join requests and feedback</h2><p className="muted">Review resident access requests separately from published Community content.</p></div><button className="secondary-button" disabled={busy || !canModerate} onClick={() => void loadPublicQueue(tenantId)} type="button">Refresh</button></div>{!canModerate ? <div className="state-block"><h3>Moderation role required</h3></div> : <><h3>Membership requests</h3>{joinRequests.length ? joinRequests.map((request) => <article className="moderation-case" key={request.requestId}><div><p className="eyebrow">{request.status === "approved" ? "Approved · invitation recovery required" : "Pending review"}</p><h3>{request.displayName}</h3><p>{request.email}{request.locality ? ` · ${request.locality}` : ""}</p><p>{request.reason ?? "No reason provided"}</p></div><div><button disabled={busy} onClick={() => void reviewPublic("join", request.requestId, "approved")} type="button">{request.status === "approved" ? "Create missing invitation" : "Approve"}</button>{request.status === "pending" ? <button disabled={busy} onClick={() => void reviewPublic("join", request.requestId, "rejected")} type="button">Reject</button> : null}</div></article>) : <p>No membership requests awaiting action.</p>}<h3>Visitor feedback</h3>{feedback.length ? feedback.map((note) => <article className="moderation-case" key={note.feedbackId}><div><p className="eyebrow">{note.category}</p><p>{note.message}</p>{note.contactEmail ? <p>Follow-up: {note.contactEmail}</p> : null}</div><div><button disabled={busy} onClick={() => void reviewPublic("feedback", note.feedbackId, "reviewing")} type="button">Review</button><button disabled={busy} onClick={() => void reviewPublic("feedback", note.feedbackId, "resolved")} type="button">Resolve</button><button disabled={busy} onClick={() => void reviewPublic("feedback", note.feedbackId, "dismissed")} type="button">Dismiss</button></div></article>) : <p>No new visitor feedback.</p>}</>}</section>
    </main>
  );
}

type ServiceListing = { listingId: string; serviceCategory: string; title: string; description: string; providerName: string; status: string; contactEmail: string | null; contactPhone: string | null; websiteUrl: string | null };
type StarterPost = { contentId: string; title: string | null; body: string; publicationStatus: string; expiresAt: string | null; label: string };
type JoinRequest = { requestId: string; email: string; displayName: string; locality: string | null; reason: string | null; status: "pending" | "approved" };
type PublicFeedback = { feedbackId: string; category: string; message: string; contactEmail: string | null };
function formValue(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
function parseServiceListings(value: unknown): ServiceListing[] {
  return Array.isArray(value) ? value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.listing_id !== "string" || typeof row.title !== "string") return [];
    return [{ listingId: row.listing_id, serviceCategory: textValue(row.service_category, "Service"), title: row.title, description: textValue(row.description, ""), providerName: textValue(row.provider_name, "Provider"), status: textValue(row.status, "pending"), contactEmail: typeof row.contact_email === "string" ? row.contact_email : null, contactPhone: typeof row.contact_phone === "string" ? row.contact_phone : null, websiteUrl: typeof row.website_url === "string" ? row.website_url : null }];
  }) : [];
}
function parseStarterPosts(value: unknown): StarterPost[] {
  return Array.isArray(value) ? value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    return typeof row.content_id === "string" && typeof row.body === "string"
      ? [{ contentId: row.content_id, title: typeof row.title === "string" ? row.title : null, body: row.body, publicationStatus: textValue(row.publication_status, "published"), expiresAt: typeof row.expires_at === "string" ? row.expires_at : null, label: textValue(row.label, "Starter information") }]
      : [];
  }) : [];
}
function parseJoinRequests(value: unknown): JoinRequest[] { return Array.isArray(value) ? value.flatMap((entry) => { const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return typeof row.request_id === "string" && typeof row.email === "string" && typeof row.display_name === "string" && (row.status === "pending" || row.status === "approved") ? [{ requestId: row.request_id, email: row.email, displayName: row.display_name, locality: typeof row.locality === "string" ? row.locality : null, reason: typeof row.reason === "string" ? row.reason : null, status: row.status }] : []; }) : []; }
function parseFeedback(value: unknown): PublicFeedback[] { return Array.isArray(value) ? value.flatMap((entry) => { const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}; return typeof row.feedback_id === "string" && typeof row.category === "string" && typeof row.message === "string" ? [{ feedbackId: row.feedback_id, category: row.category, message: row.message, contactEmail: typeof row.contact_email === "string" ? row.contact_email : null }] : []; }) : []; }

function State({ title, message }: { title: string; message: string }) {
  return (
    <main className="workspace-portal">
      <section className="state-block">
        <h2>{title}</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}
