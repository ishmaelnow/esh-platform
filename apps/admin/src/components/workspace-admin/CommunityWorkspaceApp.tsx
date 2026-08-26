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
        if (admitted && moderationRoleResult.data) await loadReports(selectedTenantId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to verify Community access.");
      } finally {
        setChecking(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadReports, supabase]);

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
    </main>
  );
}

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
