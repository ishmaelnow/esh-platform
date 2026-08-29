"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createBrowserSupabaseClient,
  type ProductWorkspaceKey,
  type SupabaseAuthSession,
  type WorkspaceRoleKey,
} from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";
import {
  loadPrincipalTenantContext,
  persistActiveTenantPreference,
} from "@/lib/tenant-admin/context";
import type { ActiveTenantOption, TenantContextResolution } from "@/lib/tenant-admin/types";
import {
  availableOperationalWorkspaces,
  enrollmentsForWorkspace,
  parseWorkspaceAdminSnapshot,
  rolesForWorkspace,
  type WorkspaceAdminSnapshot,
} from "@/lib/workspace-admin/types";
import { AdminSignIn } from "@/components/auth/AdminSignIn";

const roleLabels: Record<WorkspaceRoleKey, string> = {
  transportation_admin: "Transportation administrator",
  community_member: "Community member",
  community_admin: "Community administrator",
  community_moderator: "Community moderator",
  emergency_publisher: "Emergency publisher",
};

export function WorkspaceAdminApp({ mode = "entry" }: { mode?: "entry" | "governance" }) {
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [resolution, setResolution] = useState<TenantContextResolution | null>(null);
  const [snapshot, setSnapshot] = useState<WorkspaceAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [entryWorkspace, setEntryWorkspace] = useState<ProductWorkspaceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const requestedWorkspace = new URLSearchParams(window.location.search).get("entry");
    if (requestedWorkspace === "transportation" || requestedWorkspace === "community") {
      setEntryWorkspace(requestedWorkspace);
    }
  }, []);

  const load = useCallback(
    async (activeSession: SupabaseAuthSession | null) => {
      if (!supabase || !activeSession?.user) {
        setResolution(null);
        setSnapshot(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { error: leaveError } = await supabase.rpc("leave_my_product_session", {
          reason_value: "Entered ESH governance control plane.",
        });
        if (leaveError) throw leaveError;
        const nextResolution = await loadPrincipalTenantContext(supabase, activeSession.user);
        setResolution(nextResolution);
        if (nextResolution.status === "ready") {
          const { data, error: snapshotError } = await supabase.rpc("workspace_admin_snapshot", {
            target_tenant_id: nextResolution.selectedTenant.tenant.tenant_id,
          });
          if (snapshotError) throw snapshotError;
          setSnapshot(parseWorkspaceAdminSnapshot(data));
        } else setSnapshot(null);
      } catch (cause) {
        setError(messageFrom(cause));
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void load(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
        void load(nextSession);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [load, supabase]);

  const selectedTenant = resolution?.status === "ready" ? resolution.selectedTenant : null;
  const tenantOptions = resolution && "context" in resolution ? resolution.context.memberships : [];
  const operationalWorkspaces = snapshot ? availableOperationalWorkspaces(snapshot.workspaces) : [];

  async function chooseTenant(tenant: ActiveTenantOption) {
    if (!supabase || !resolution || !("context" in resolution)) return;
    await persistActiveTenantPreference(supabase, resolution.context.person.person_id, tenant);
    await load(session);
  }

  async function mutate(
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setNotice(success);
      await load(session);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  function openWorkspace(workspaceKey: ProductWorkspaceKey) {
    if (!supabase) return;
    if (workspaceKey === "community") {
      window.location.assign("/community");
      return;
    }
    window.location.assign(adminPublicConfig.transportationAdminUrl);
  }

  if (!session) return <AdminSignIn />;

  return (
    <main className="workspace-portal">
      <header className="workspace-portal-header">
        {mode === "entry" ? (
          <div>
            <p className="eyebrow">ESH Platform</p>
            <h1>Your products</h1>
            <p className="muted">
              Choose one operational product. Opening it creates an exclusive product session.
            </p>
          </div>
        ) : (
          <div>
            <p className="eyebrow">ESH Control Plane</p>
            <h1>Tenant governance</h1>
            <p className="muted">
              Manage product availability and member access outside daily operations.
            </p>
          </div>
        )}
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void signOut()}
          type="button"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </header>

      {tenantOptions.length > 1 ? (
        <label className="workspace-tenant-select">
          Tenant
          <select
            value={selectedTenant?.tenant.tenant_id ?? ""}
            onChange={(event) => {
              const option = tenantOptions.find(
                ({ tenant }) => tenant.tenant_id === event.target.value,
              );
              if (option) void chooseTenant(option);
            }}
          >
            {tenantOptions.map((option) => (
              <option key={option.tenant.tenant_id} value={option.tenant.tenant_id}>
                {option.configuration?.display_name ?? option.tenant.tenant_id}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {loading ? (
        <State title="Loading workspaces" message="Resolving explicit product access." />
      ) : null}
      {error ? <State title="Unable to load workspaces" message={error} danger /> : null}
      {notice ? <p className="workspace-notice">{notice}</p> : null}
      {mode === "entry" && entryWorkspace ? (
        <p className="workspace-entry-guidance">
          <strong>
            Your {entryWorkspace === "transportation" ? "Transportation" : "Community"} session is
            not active.
          </strong>{" "}
          Returning you to product entry. Select an available product below to start a new session.
        </p>
      ) : null}
      {!loading && selectedTenant && snapshot ? (
        <>
          {mode === "entry" && operationalWorkspaces.length > 0 ? (
            <section className="workspace-card-grid">
              {operationalWorkspaces.map((workspace) => {
                return (
                  <article className="workspace-card" key={workspace.workspaceKey}>
                    <div>
                      <span className={`status-pill ${workspace.status}`}>{workspace.status}</span>
                      <h2>{workspace.displayName}</h2>
                      <p>
                        {workspace.description ||
                          (workspace.workspaceKey === "community"
                            ? "Community publishing, services, groups, and moderation."
                            : "Dispatch, drivers, vehicles, fares, and operations.")}
                      </p>
                    </div>
                    <p className="workspace-role-summary">
                      {workspace.roles.map((role) => roleLabels[role]).join(", ")}
                    </p>
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void openWorkspace(workspace.workspaceKey)}
                      type="button"
                    >
                      Open {workspace.displayName}
                    </button>
                  </article>
                );
              })}
            </section>
          ) : null}
          {mode === "entry" && operationalWorkspaces.length === 0 ? (
            <State
              title="No operational products available"
              message="You do not currently have an enabled product and assigned operational role for this tenant."
            />
          ) : null}
          {mode === "governance" && snapshot.canManage ? (
            <WorkspaceGovernance
              busy={busy}
              snapshot={snapshot}
              onMutate={mutate}
              tenantId={selectedTenant.tenant.tenant_id}
              tenantName={
                selectedTenant.configuration?.display_name ?? selectedTenant.tenant.tenant_id
              }
            />
          ) : null}
          {mode === "governance" && !snapshot.canManage ? (
            <State
              title="Tenant governance unavailable"
              message="An active tenant owner or platform administrator role is required."
              danger
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function WorkspaceGovernance({
  busy,
  snapshot,
  onMutate,
  tenantId,
  tenantName,
}: {
  busy: boolean;
  snapshot: WorkspaceAdminSnapshot;
  onMutate: (
    action: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) => Promise<void>;
  tenantId: string;
  tenantName: string;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const [workspaceKey, setWorkspaceKey] = useState<ProductWorkspaceKey>(
    snapshot.workspaces[0]?.workspaceKey ?? "community",
  );
  const [membershipId, setMembershipId] = useState(snapshot.memberships[0]?.membershipId ?? "");
  const [roleKey, setRoleKey] = useState<WorkspaceRoleKey>("community_member");
  const [reason, setReason] = useState("");
  const workspace = snapshot.workspaces.find((item) => item.workspaceKey === workspaceKey);
  const workspaceEnrollments = enrollmentsForWorkspace(snapshot.enrollments, workspaceKey);
  const existingMembershipIds = new Set(workspaceEnrollments.map((item) => item.membershipId));
  const candidates = snapshot.memberships.filter(
    (item) => !existingMembershipIds.has(item.membershipId),
  );
  const firstCandidateMembershipId = candidates[0]?.membershipId ?? "";

  useEffect(() => {
    if (!snapshot.workspaces.some((item) => item.workspaceKey === workspaceKey)) {
      setWorkspaceKey(snapshot.workspaces[0]?.workspaceKey ?? "community");
      return;
    }
    const roles = rolesForWorkspace(workspaceKey);
    setRoleKey(roles[0]);
    setMembershipId(firstCandidateMembershipId);
  }, [firstCandidateMembershipId, tenantId, workspaceKey, snapshot.workspaces]);

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onMutate(
      () =>
        supabase.rpc("enroll_tenant_workspace_member", {
          target_tenant_id: tenantId,
          target_membership_id: membershipId,
          target_workspace_key: workspaceKey,
          initial_role_key: roleKey,
          reason_value: reason,
        }),
      "Workspace enrollment created.",
    );
    setReason("");
  }

  return (
    <section className="panel workspace-governance">
      <div className="governance-tenant-scope">
        <div>
          <p className="eyebrow">Governance tenant</p>
          <h2>{tenantName}</h2>
          <p>Every change on this page applies only to this tenant.</p>
        </div>
        <span className="scope-lock">Tenant scope locked</span>
      </div>
      {snapshot.workspaces.length === 0 ? (
        <State
          title="No products granted"
          message="ESH Platform Administration has not granted an operational product to this tenant."
        />
      ) : null}
      {snapshot.workspaces.length > 0 ? (
        <>
          <div className="product-governance-selector" aria-label="Product governance scope">
            {snapshot.workspaces.map((item) => (
              <button
                aria-pressed={workspaceKey === item.workspaceKey}
                className={`product-governance-option${workspaceKey === item.workspaceKey ? " active" : ""}`}
                key={item.workspaceKey}
                onClick={() => setWorkspaceKey(item.workspaceKey)}
                type="button"
              >
                <span>{item.displayName}</span>
                <span className={`status-pill ${item.status}`}>{item.status}</span>
              </button>
            ))}
          </div>
          {workspace ? (
            <div className="product-governance-scope">
              <div>
                <p className="eyebrow">Managing product</p>
                <h2>{workspace.displayName} access governance</h2>
                <p>
                  Roles and actions below affect only {workspace.displayName} in {tenantName}.
                </p>
              </div>
              <div className="product-governance-state">
                <span className={`status-pill ${workspace.status}`}>{workspace.status}</span>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    const nextStatus = workspace.status === "enabled" ? "suspended" : "enabled";
                    const reasonValue = window
                      .prompt(`Reason to ${nextStatus} ${workspace.displayName} for ${tenantName}`)
                      ?.trim();
                    if (reasonValue)
                      void onMutate(
                        () =>
                          supabase.rpc("set_tenant_workspace_status", {
                            target_tenant_id: tenantId,
                            target_workspace_key: workspace.workspaceKey,
                            target_status: nextStatus,
                            reason_value: reasonValue,
                          }),
                        `${workspace.displayName} is now ${nextStatus} for ${tenantName}.`,
                      );
                  }}
                  type="button"
                >
                  {workspace.status === "enabled"
                    ? `Suspend ${workspace.displayName}`
                    : `Enable ${workspace.displayName}`}
                </button>
              </div>
            </div>
          ) : null}
          {workspace?.workspaceKey === "community" && workspace.status !== "enabled" ? (
            <p className="workspace-entry-guidance">
              Community must have its Platform-granted capabilities before this workspace can be
              enabled.
            </p>
          ) : null}
          <form
            className="form-grid governance-enrollment-form"
            onSubmit={(event) => void submitEnrollment(event)}
          >
            <div className="panel-header">
              <p className="eyebrow">Grant product access</p>
              <h3>Enroll a member in {workspace?.displayName ?? "this product"}</h3>
            </div>
            <label>
              Tenant member
              <select
                required
                value={membershipId}
                onChange={(event) => setMembershipId(event.target.value)}
              >
                <option value="">Select a member</option>
                {candidates.map((member) => (
                  <option key={member.membershipId} value={member.membershipId}>
                    {member.displayName} — {member.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {workspace?.displayName ?? "Product"} role
              {rolesForWorkspace(workspaceKey).length === 1 ? (
                <span className="governance-fixed-role">
                  {roleLabels[rolesForWorkspace(workspaceKey)[0]]}
                </span>
              ) : (
                <select
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.target.value as WorkspaceRoleKey)}
                >
                  {rolesForWorkspace(workspaceKey).map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              Reason
              <input
                required
                placeholder={`Why should this member receive ${workspace?.displayName ?? "product"} access?`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || workspace?.status !== "enabled" || !membershipId}
              type="submit"
            >
              Enroll in {workspace?.displayName ?? "product"}
            </button>
          </form>
          <div className="governance-enrollment-heading">
            <div>
              <p className="eyebrow">Current product access</p>
              <h3>{workspace?.displayName} enrollments</h3>
            </div>
            <span>{workspaceEnrollments.length} enrolled</span>
          </div>
          <div className="workspace-enrollment-list">
            {workspaceEnrollments.map((enrollment) => (
              <article key={enrollment.enrollmentId}>
                <div>
                  <strong>{enrollment.displayName}</strong>
                  <span>{enrollment.email}</span>
                  <span>
                    {workspace?.displayName} ·{" "}
                    {enrollment.roles.map((role) => roleLabels[role]).join(", ")}
                  </span>
                </div>
                <button
                  className="danger-button"
                  disabled={busy}
                  onClick={() => {
                    const reasonValue = window
                      .prompt(
                        `Reason to remove ${enrollment.displayName} from ${workspace?.displayName} in ${tenantName}`,
                      )
                      ?.trim();
                    if (reasonValue)
                      void onMutate(
                        () =>
                          supabase.rpc("remove_tenant_workspace_enrollment", {
                            target_enrollment_id: enrollment.enrollmentId,
                            reason_value: reasonValue,
                          }),
                        `${workspace?.displayName} access removed from ${enrollment.displayName}.`,
                      );
                  }}
                  type="button"
                >
                  Remove {workspace?.displayName} access
                </button>
              </article>
            ))}
            {workspaceEnrollments.length === 0 ? (
              <p className="empty-state">
                No members are enrolled in {workspace?.displayName} for {tenantName}.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function State({
  title,
  message,
  danger = false,
}: {
  title: string;
  message: string;
  danger?: boolean;
}) {
  return (
    <section className={`state-block${danger ? " danger" : ""}`}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}
function messageFrom(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : typeof cause === "object" && cause && "message" in cause
      ? String(cause.message)
      : "Unexpected workspace error.";
}
