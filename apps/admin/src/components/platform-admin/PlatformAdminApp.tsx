"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  createBrowserSupabaseClient,
  type PersonProfileRow,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";
import {
  closeProvisioningTenant,
  provisionTenant,
  resendTenantInvitation,
  setTenantProductEntitlement,
} from "@/lib/platform-admin/mutations";
import { setTenantCapability } from "@/lib/platform-admin/mutations";
import { loadPlatformAdminSummary } from "@/lib/platform-admin/queries";
import type { PlatformAdminSummary, TenantProvisioningPayload } from "@/lib/platform-admin/types";

const platformProvisioningDraftKey = "esh-platform:platform-provisioning-draft";
const platformProducts = [
  { workspaceKey: "transportation", displayName: "Transportation" },
  { workspaceKey: "community", displayName: "Community" },
] as const;

const defaultTenantProvisioningPayload: TenantProvisioningPayload = {
  displayName: "",
  legalName: "",
  defaultTimeZone: "America/Chicago",
  supportContactEmail: "",
  brandingReference: "",
  firstOwnerEmail: "",
  reason: "Initial tenant provisioning",
};

export function PlatformAdminApp() {
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [person, setPerson] = useState<PersonProfileRow | null>(null);
  const [summary, setSummary] = useState<PlatformAdminSummary | null>(null);
  const [form, setForm] = useState<TenantProvisioningPayload>(readProvisioningDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
      setLoading(false);
    }
  }

  const refresh = useCallback(
    async (activeSession: SupabaseAuthSession | null) => {
      if (!supabase) {
        return;
      }

      if (!activeSession?.user) {
        setPerson(null);
        setSummary(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: profile, error: profileError } = await supabase
          .from("person_profiles")
          .select("*")
          .eq("auth_user_id", activeSession.user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setPerson(profile ?? null);
        setSummary(await loadPlatformAdminSummary(supabase, profile?.person_id ?? null));
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load platform administration.",
        );
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        void refresh(data.session);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to load your ESH session.");
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refresh(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  if (!session) {
    return <PlatformSignedOutState />;
  }

  const hasResolvedPlatformContext = person !== null || summary !== null;

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Platform</p>
          <h1>Platform Administration</h1>
        </div>

        <nav className="nav-list" aria-label="Platform administration">
          <button className="nav-item active" type="button">
            Tenant Provisioning
          </button>
        </nav>

        <Link className="sidebar-link" href="/">
          Tenant Administration
        </Link>

        <button
          className="secondary-button full-width"
          disabled={loading}
          onClick={() => void signOut()}
          type="button"
        >
          {loading ? "Signing out…" : "Sign out"}
        </button>
      </aside>

      <section className="workspace">
        {loading && !hasResolvedPlatformContext ? (
          <StateBlock
            title="Loading platform context"
            message="Resolving your profile and platform administration roles."
          />
        ) : null}
        {error ? <StateBlock tone="danger" title="Unable to load" message={error} /> : null}
        {!error && (!loading || hasResolvedPlatformContext) ? (
          <ResolvedPlatformWorkspace
            form={form}
            onRefresh={() => void refresh(session)}
            person={person}
            session={session}
            setForm={setForm}
            summary={summary}
          />
        ) : null}
      </section>
    </main>
  );
}

function PlatformSignedOutState() {
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!supabase) {
      setMessage("Sign-in service is not ready. Please try again.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="signed-out-shell">
      <section className="sign-in-panel">
        <p className="eyebrow">Platform</p>
        <h1>Sign in</h1>
        <p className="muted">
          Use an ESH account with Platform Owner or Platform Administrator access.
        </p>
        <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {message ? <p className="form-error">{message}</p> : null}
          <button className="primary-button" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function ResolvedPlatformWorkspace({
  form,
  onRefresh,
  person,
  session,
  setForm,
  summary,
}: {
  form: TenantProvisioningPayload;
  onRefresh: () => void;
  person: PersonProfileRow | null;
  session: SupabaseAuthSession;
  setForm: (updater: (form: TenantProvisioningPayload) => TenantProvisioningPayload) => void;
  summary: PlatformAdminSummary | null;
}) {
  if (!person) {
    return (
      <StateBlock
        title="No person profile"
        message="This Auth user does not have a PersonProfile yet."
      />
    );
  }

  if (!summary || summary.roles.length === 0) {
    return (
      <StateBlock
        title="Platform access required"
        message="Only platform_owner and platform_admin can provision tenants."
      />
    );
  }

  return (
    <PlatformProvisioningPanel
      form={form}
      onRefresh={onRefresh}
      session={session}
      setForm={setForm}
      summary={summary}
    />
  );
}

function PlatformProvisioningPanel({
  form,
  onRefresh,
  session,
  setForm,
  summary,
}: {
  form: TenantProvisioningPayload;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  setForm: (updater: (form: TenantProvisioningPayload) => TenantProvisioningPayload) => void;
  summary: PlatformAdminSummary;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [showClosedTenants, setShowClosedTenants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const visibleTenants = showClosedTenants
    ? summary.tenants
    : summary.tenants.filter(({ tenant }) => tenant.status !== "closed");
  const closedTenantCount = summary.tenants.length - visibleTenants.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);

    const result = await provisionTenant(session, form);
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    clearProvisioningDraft();
    setForm(() => defaultTenantProvisioningPayload);
    setMessage(result.message ?? "Tenant provisioned and invitation email sent.");
    onRefresh();
  }

  async function handleCapability(tenantId: string, capabilityKey: string, enabled: boolean) {
    const result = await setTenantCapability(session, tenantId, capabilityKey, enabled);
    if (!result.ok) window.alert(result.message);
    else onRefresh();
  }

  async function handleResendInvitation(tenantId: string, invitationId: string) {
    const actionKey = `resend:${invitationId}`;
    setActionMessage(null);
    setActiveAction(actionKey);

    const result = await resendTenantInvitation(session, tenantId, invitationId);

    setActiveAction(null);
    setActionMessage(result.ok ? (result.message ?? "Invitation email resent.") : result.message);
    onRefresh();
  }

  async function handleCloseProvisioningTenant(tenantId: string) {
    const reason = window.prompt("Reason for closing this provisioning tenant");

    if (!reason?.trim()) {
      return;
    }

    const actionKey = `close:${tenantId}`;
    setActionMessage(null);
    setActiveAction(actionKey);

    const result = await closeProvisioningTenant(session, tenantId, reason.trim());

    setActiveAction(null);
    setActionMessage(
      result.ok ? (result.message ?? "Provisioning tenant closed.") : result.message,
    );
    onRefresh();
  }

  async function handleEntitlement(
    tenantId: string,
    workspaceKey: "transportation" | "community",
    status: "granted" | "suspended" | "revoked",
  ) {
    const reason = window
      .prompt(`Reason to set ${workspaceKey} product entitlement to ${status}`)
      ?.trim();
    if (!reason) return;

    const actionKey = `entitlement:${tenantId}:${workspaceKey}:${status}`;
    setActionMessage(null);
    setActiveAction(actionKey);
    const result = await setTenantProductEntitlement(session, {
      tenantId,
      workspaceKey,
      status,
      reason,
    });
    setActiveAction(null);
    setActionMessage(
      result.ok
        ? (result.message ?? `${workspaceKey} entitlement is now ${status}.`)
        : result.message,
    );
    onRefresh();
  }

  return (
    <section className="content-stack">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Platform administration</p>
          <h2>Tenant Provisioning</h2>
          <p className="muted">
            Create a tenant workspace and issue the first tenant_owner invitation.
          </p>
        </div>
        <div className="header-meta">
          <span>{summary.roles.map(({ role_key }) => role_key).join(", ")}</span>
          <span>{visibleTenants.length} visible tenants</span>
        </div>
      </header>

      <section className="panel">
        <PanelHeader
          title="Create tenant"
          description="Creates a neutral tenant and first-owner invitation. Grant products separately after provisioning."
        />
        <form className="settings-grid" onSubmit={(event) => void handleSubmit(event)}>
          <PlatformTextInput
            label="Display name"
            name="displayName"
            setForm={setForm}
            value={form.displayName}
          />
          <PlatformTextInput
            label="Legal name"
            name="legalName"
            setForm={setForm}
            value={form.legalName}
          />
          <PlatformTextInput
            label="Default time zone"
            name="defaultTimeZone"
            setForm={setForm}
            value={form.defaultTimeZone}
          />
          <PlatformTextInput
            label="Support contact email"
            name="supportContactEmail"
            setForm={setForm}
            type="email"
            value={form.supportContactEmail}
          />
          <PlatformTextInput
            label="Branding reference"
            name="brandingReference"
            required={false}
            setForm={setForm}
            value={form.brandingReference ?? ""}
          />
          <PlatformTextInput
            label="First tenant owner email"
            name="firstOwnerEmail"
            setForm={setForm}
            type="email"
            value={form.firstOwnerEmail}
          />
          <PlatformTextInput
            label="Provisioning reason"
            name="reason"
            setForm={setForm}
            value={form.reason}
          />
          {message ? <p className="form-error">{message}</p> : null}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Creating tenant" : "Create tenant"}
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelHeader
          title="Tenants"
          description="Platform-owned customer workspaces visible to platform administrators."
        />
        <div className="toolbar-row">
          <p className="muted">
            {closedTenantCount > 0 && !showClosedTenants
              ? `${closedTenantCount} closed tenants hidden.`
              : "Closed tenants are retained for audit history."}
          </p>
          <button
            className="secondary-button"
            onClick={() => setShowClosedTenants((current) => !current)}
            type="button"
          >
            {showClosedTenants ? "Hide closed" : "Show closed"}
          </button>
        </div>
        {visibleTenants.length === 0 ? (
          <EmptyState
            message={
              summary.tenants.length === 0
                ? "No tenants have been provisioned."
                : "Only closed tenants exist. Use Show closed to review archived provisioning history."
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Product entitlements</th>
                  <th>Capabilities</th>
                  <th>Pending owner invitation</th>
                  <th>Email delivery</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTenants.map((item) => {
                  const pendingOwnerInvitation = item.invitations.find(
                    ({ intended_role, status }) =>
                      intended_role === "tenant_owner" && status === "pending",
                  );

                  return (
                    <tr key={item.tenant.tenant_id}>
                      <td>
                        <strong>{item.configuration?.display_name ?? item.tenant.tenant_id}</strong>
                        <span>{item.configuration?.legal_name ?? item.tenant.tenant_id}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${item.tenant.status}`}>
                          {item.tenant.status}
                        </span>
                      </td>
                      <td>
                        <div className="content-stack compact-stack">
                          {platformProducts.map((product) => {
                            const entitlement = item.entitlements.find(
                              ({ workspace_key }) => workspace_key === product.workspaceKey,
                            );
                            const status = entitlement?.status ?? "not granted";
                            return (
                              <div className="row-actions" key={product.workspaceKey}>
                                <span>
                                  {product.displayName}: {status}
                                </span>
                                {status !== "granted" ? (
                                  <button
                                    className="secondary-button"
                                    disabled={activeAction?.startsWith(
                                      `entitlement:${item.tenant.tenant_id}:${product.workspaceKey}:`,
                                    )}
                                    onClick={() =>
                                      void handleEntitlement(
                                        item.tenant.tenant_id,
                                        product.workspaceKey,
                                        "granted",
                                      )
                                    }
                                    type="button"
                                  >
                                    {status === "suspended" ? "Restore" : "Grant"}
                                  </button>
                                ) : (
                                  <button
                                    className="secondary-button"
                                    disabled={activeAction?.startsWith(
                                      `entitlement:${item.tenant.tenant_id}:${product.workspaceKey}:`,
                                    )}
                                    onClick={() =>
                                      void handleEntitlement(
                                        item.tenant.tenant_id,
                                        product.workspaceKey,
                                        "suspended",
                                      )
                                    }
                                    type="button"
                                  >
                                    Suspend
                                  </button>
                                )}
                                {entitlement && status !== "revoked" ? (
                                  <button
                                    className="secondary-button"
                                    disabled={activeAction?.startsWith(
                                      `entitlement:${item.tenant.tenant_id}:${product.workspaceKey}:`,
                                    )}
                                    onClick={() =>
                                      void handleEntitlement(
                                        item.tenant.tenant_id,
                                        product.workspaceKey,
                                        "revoked",
                                      )
                                    }
                                    type="button"
                                  >
                                    Revoke
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        {item.capabilities.filter(({ enabled }) => enabled).length} enabled
                        <span>
                          rider/driver{" "}
                          {item.capabilities.some(
                            ({ capability_key, enabled }) =>
                              capability_key === "app.rider" && enabled,
                          ) ||
                          item.capabilities.some(
                            ({ capability_key, enabled }) =>
                              capability_key === "app.driver" && enabled,
                          )
                            ? "partially enabled"
                            : "disabled"}
                          {item.capabilities.some(
                            ({ capability_key }) => capability_key === "driver.management",
                          ) ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                void handleCapability(
                                  item.tenant.tenant_id,
                                  "driver.management",
                                  !item.capabilities.find(
                                    ({ capability_key }) => capability_key === "driver.management",
                                  )?.enabled,
                                )
                              }
                            >
                              {item.capabilities.find(
                                ({ capability_key }) => capability_key === "driver.management",
                              )?.enabled
                                ? "Disable drivers"
                                : "Enable drivers"}
                            </button>
                          ) : null}
                          {item.capabilities.some(
                            ({ capability_key }) => capability_key === "vehicle.management",
                          ) ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() =>
                                void handleCapability(
                                  item.tenant.tenant_id,
                                  "vehicle.management",
                                  !item.capabilities.find(
                                    ({ capability_key }) => capability_key === "vehicle.management",
                                  )?.enabled,
                                )
                              }
                            >
                              {item.capabilities.find(
                                ({ capability_key }) => capability_key === "vehicle.management",
                              )?.enabled
                                ? "Disable vehicles"
                                : "Enable vehicles"}
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        {pendingOwnerInvitation?.email ?? "None"}
                        {pendingOwnerInvitation?.email_delivery_error ? (
                          <span>{pendingOwnerInvitation.email_delivery_error}</span>
                        ) : null}
                      </td>
                      <td>{pendingOwnerInvitation?.email_delivery_status ?? "none"}</td>
                      <td>{formatDate(item.tenant.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          {pendingOwnerInvitation ? (
                            <button
                              className="secondary-button"
                              disabled={
                                activeAction === `resend:${pendingOwnerInvitation.invitation_id}`
                              }
                              onClick={() =>
                                void handleResendInvitation(
                                  item.tenant.tenant_id,
                                  pendingOwnerInvitation.invitation_id,
                                )
                              }
                              type="button"
                            >
                              {activeAction === `resend:${pendingOwnerInvitation.invitation_id}`
                                ? "Resending"
                                : "Resend"}
                            </button>
                          ) : null}
                          {item.tenant.status === "provisioning" ? (
                            <button
                              className="secondary-button"
                              disabled={activeAction === `close:${item.tenant.tenant_id}`}
                              onClick={() =>
                                void handleCloseProvisioningTenant(item.tenant.tenant_id)
                              }
                              type="button"
                            >
                              {activeAction === `close:${item.tenant.tenant_id}`
                                ? "Closing"
                                : "Close"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {actionMessage ? <p className="muted">{actionMessage}</p> : null}
      </section>
    </section>
  );
}

function PlatformTextInput({
  label,
  name,
  required = true,
  setForm,
  type = "text",
  value,
}: {
  label: string;
  name: keyof TenantProvisioningPayload;
  required?: boolean;
  setForm: (updater: (form: TenantProvisioningPayload) => TenantProvisioningPayload) => void;
  type?: string;
  value: string;
}) {
  function handleChange(value: string) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      writeProvisioningDraft(next);

      return next;
    });
  }

  return (
    <label>
      {label}
      <input
        name={String(name)}
        onChange={(event) => handleChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function readProvisioningDraft(): TenantProvisioningPayload {
  if (typeof window === "undefined") {
    return defaultTenantProvisioningPayload;
  }

  const stored = window.sessionStorage.getItem(platformProvisioningDraftKey);

  if (!stored) {
    return defaultTenantProvisioningPayload;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<TenantProvisioningPayload>;

    return {
      ...defaultTenantProvisioningPayload,
      ...parsed,
    };
  } catch {
    return defaultTenantProvisioningPayload;
  }
}

function writeProvisioningDraft(payload: TenantProvisioningPayload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(platformProvisioningDraftKey, JSON.stringify(payload));
}

function clearProvisioningDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(platformProvisioningDraftKey);
}

function PanelHeader({ description, title }: { description?: string | undefined; title: string }) {
  return (
    <header className="panel-header">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function StateBlock({ message, title, tone }: { message: string; title: string; tone?: "danger" }) {
  return (
    <section className={tone === "danger" ? "state-block danger" : "state-block"}>
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
