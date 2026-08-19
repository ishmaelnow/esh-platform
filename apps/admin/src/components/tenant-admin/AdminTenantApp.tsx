"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient, type SupabaseAuthSession } from "@esh-platform/supabase";
import { LiveTripMap } from "@esh-platform/maps/client";
import { adminPublicConfig } from "@/lib/config";
import {
  adminAuthRefreshMode,
  loadPrincipalTenantContext,
  persistActiveTenantPreference,
  shouldRenderResolvedTenantWorkspace,
} from "@/lib/tenant-admin/context";
import {
  cancelTenantInvitation,
  createTenantInvitation,
  updateTenantMembershipStatus,
  updateTenantSettings,
} from "@/lib/tenant-admin/mutations";
import { createDriver, transitionDriver, updateDriver } from "@/lib/driver-management/mutations";
import { updateDriverOnboarding } from "@/lib/driver-management/onboarding";
import {
  countActiveMemberships,
  countPendingInvitations,
  loadTenantSummary,
} from "@/lib/tenant-admin/queries";
import { emptyServiceAreaDraft, restoreServiceAreaDraft } from "@/lib/tenant-admin/service-areas";
import {
  formatMinorUnits,
  missingFoundationAccountCodes,
  parseMoneyToMinorUnits,
} from "@/lib/tenant-admin/ledger";
import type {
  ActiveTenantOption,
  EditableTenantConfiguration,
  FoundationTenantRole,
  TenantContextResolution,
  TenantSummary,
} from "@/lib/tenant-admin/types";

type ViewKey =
  | "dashboard"
  | "settings"
  | "memberships"
  | "invitations"
  | "roles"
  | "capabilities"
  | "audit"
  | "drivers"
  | "vehicles"
  | "serviceAreas"
  | "dispatch"
  | "reputation"
  | "ledger"
  | "pricing"
  | "notifications"
  | "applications";

const views: { key: ViewKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "settings", label: "Settings" },
  { key: "memberships", label: "Memberships" },
  { key: "invitations", label: "Invitations" },
  { key: "roles", label: "Roles" },
  { key: "capabilities", label: "Capabilities" },
  { key: "audit", label: "Audit" },
  { key: "drivers", label: "Drivers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "serviceAreas", label: "Service Areas" },
  { key: "dispatch", label: "Dispatch" },
  { key: "reputation", label: "Reputation" },
  { key: "ledger", label: "Ledger" },
  { key: "pricing", label: "Pricing" },
  { key: "notifications", label: "Notifications" },
  { key: "applications", label: "Applications" },
];

export function AdminTenantApp() {
  const supabase = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : createBrowserSupabaseClient(adminPublicConfig.supabase),
    [],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [resolution, setResolution] = useState<TenantContextResolution | null>(null);
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [activeViewRestored, setActiveViewRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeAuthUserId = useRef<string | null>(null);
  const refreshRequestId = useRef(0);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("esh-admin-active-view");
    if (views.some(({ key }) => key === stored)) setActiveView(stored as ViewKey);
    setActiveViewRestored(true);
  }, []);

  useEffect(() => {
    if (activeViewRestored) window.sessionStorage.setItem("esh-admin-active-view", activeView);
  }, [activeView, activeViewRestored]);

  const refresh = useCallback(
    async (activeSession: SupabaseAuthSession | null, showLoading = true) => {
      if (!supabase) {
        return;
      }
      const requestId = ++refreshRequestId.current;

      if (!activeSession?.user) {
        setResolution(null);
        setSummary(null);
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const nextResolution = await loadPrincipalTenantContext(supabase, activeSession.user);
        const nextSummary =
          nextResolution.status === "ready"
            ? await loadTenantSummary(supabase, nextResolution.selectedTenant.tenant.tenant_id)
            : null;
        if (requestId !== refreshRequestId.current) return;
        setResolution(nextResolution);
        setSummary(nextSummary);
      } catch (cause) {
        if (requestId !== refreshRequestId.current) return;
        setError(cause instanceof Error ? cause.message : "Unable to load tenant administration.");
      } finally {
        if (showLoading && requestId === refreshRequestId.current) setLoading(false);
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
        activeAuthUserId.current = data.session?.user.id ?? null;
        void refresh(data.session);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to load the Supabase session.");
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const refreshMode = adminAuthRefreshMode(event, activeAuthUserId.current, nextUserId);
      const identityChanged = activeAuthUserId.current !== nextUserId;
      activeAuthUserId.current = nextUserId;
      setSession(nextSession);
      if (refreshMode === "blocking" && identityChanged) {
        setResolution(null);
        setSummary(null);
      }
      if (refreshMode !== "none") void refresh(nextSession, refreshMode === "blocking");
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refresh]);

  const selectedTenant = resolution?.status === "ready" ? resolution.selectedTenant : null;
  const tenantOptions = resolution?.status === "ready" ? resolution.context.memberships : [];
  const canManageTenant =
    selectedTenant?.roles.includes("tenant_owner") ||
    selectedTenant?.roles.includes("tenant_admin") ||
    false;
  const hasResolvedTenantContext = resolution !== null;

  async function handleTenantSelect(tenantId: string) {
    if (!supabase || !resolution || !("context" in resolution)) {
      return;
    }

    const tenant = resolution.context.memberships.find(
      (option) => option.tenant.tenant_id === tenantId,
    );

    if (!tenant) {
      return;
    }

    setLoading(true);

    try {
      await persistActiveTenantPreference(supabase, resolution.context.person.person_id, tenant);
      await refresh(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to select tenant.");
      setLoading(false);
    }
  }

  if (!session) {
    return <SignedOutState />;
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Tenant Administration</h1>
        </div>

        {selectedTenant ? (
          <TenantContextPanel
            tenant={selectedTenant}
            options={tenantOptions}
            onSelect={(tenantId) => void handleTenantSelect(tenantId)}
          />
        ) : null}

        <nav className="nav-list" aria-label="Administration">
          {views.map((view) => (
            <button
              className={view.key === activeView ? "nav-item active" : "nav-item"}
              key={view.key}
              onClick={() => setActiveView(view.key)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>

        <button
          className="secondary-button full-width"
          onClick={() => {
            if (supabase) {
              void supabase.auth.signOut();
            }
          }}
          type="button"
        >
          Sign out
        </button>
      </aside>

      <section className="workspace">
        {loading && !hasResolvedTenantContext ? (
          <StateBlock
            title="Loading tenant context"
            message="Resolving your profile, memberships, and tenant access."
          />
        ) : null}
        {error ? <StateBlock tone="danger" title="Unable to load" message={error} /> : null}
        {shouldRenderResolvedTenantWorkspace(loading, hasResolvedTenantContext, error !== null) ? (
          <ResolvedWorkspace
            activeView={activeView}
            canManageTenant={canManageTenant}
            onRefresh={() => void refresh(session, false)}
            resolution={resolution}
            selectedTenant={selectedTenant}
            session={session}
            summary={summary}
          />
        ) : null}
      </section>
    </main>
  );
}

function SignedOutState() {
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
      setMessage("Supabase client is not ready.");
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
        <p className="eyebrow">Admin</p>
        <h1>Sign in</h1>
        <p className="muted">
          Use an existing Supabase Auth account with an active tenant membership.
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

function ResolvedWorkspace({
  activeView,
  canManageTenant,
  onRefresh,
  resolution,
  selectedTenant,
  session,
  summary,
}: {
  activeView: ViewKey;
  canManageTenant: boolean;
  onRefresh: () => void;
  resolution: TenantContextResolution | null;
  selectedTenant: ActiveTenantOption | null;
  session: SupabaseAuthSession;
  summary: TenantSummary | null;
}) {
  if (!resolution) {
    return (
      <StateBlock
        title="No session context"
        message="Sign out and sign back in to refresh the Admin session."
      />
    );
  }

  if (resolution.status === "signed_in_without_profile") {
    return (
      <StateBlock
        title="No person profile"
        message="This Auth user does not have a PersonProfile yet."
      />
    );
  }

  if (resolution.status === "no_active_memberships") {
    return (
      <StateBlock
        title="No active tenant memberships"
        message="Authentication alone does not grant tenant access."
      />
    );
  }

  if (resolution.status === "tenant_selection_required") {
    return (
      <StateBlock
        title="Select a tenant"
        message="You have multiple active memberships. Use the tenant selector to choose the active workspace."
      />
    );
  }

  if (!selectedTenant || !summary) {
    return (
      <StateBlock
        title="Tenant data unavailable"
        message="The selected tenant could not be loaded."
      />
    );
  }

  return (
    <>
      <HeaderBlock resolution={resolution} selectedTenant={selectedTenant} summary={summary} />
      {activeView === "dashboard" ? (
        <Dashboard resolution={resolution} selectedTenant={selectedTenant} summary={summary} />
      ) : null}
      {activeView === "settings" ? (
        <SettingsPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "memberships" ? (
        <MembershipsPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          selectedMembershipId={selectedTenant.membership.membership_id}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "invitations" ? (
        <InvitationsPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "roles" ? <RolesPanel summary={summary} /> : null}
      {activeView === "capabilities" ? <CapabilitiesPanel summary={summary} /> : null}
      {activeView === "audit" ? <AuditPanel summary={summary} /> : null}
      {activeView === "drivers" ? (
        <DriversPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "vehicles" ? (
        <VehiclesPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "serviceAreas" ? (
        <ServiceAreasPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "dispatch" ? (
        <DispatchPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "notifications" ? (
        <NotificationsPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
      {activeView === "reputation" ? (
        <ReputationPanel canManageTenant={canManageTenant} onRefresh={onRefresh} summary={summary} />
      ) : null}
      {activeView === "ledger" ? (
        <LedgerPanel canManageTenant={canManageTenant} onRefresh={onRefresh} summary={summary} />
      ) : null}
      {activeView === "pricing" ? (
        <PricingPanel canManageTenant={canManageTenant} onRefresh={onRefresh} summary={summary} />
      ) : null}
      {activeView === "applications" ? (
        <DriverApplicationsPanel
          canManageTenant={canManageTenant}
          onRefresh={onRefresh}
          session={session}
          summary={summary}
        />
      ) : null}
    </>
  );
}

function HeaderBlock({
  resolution,
  selectedTenant,
  summary,
}: {
  resolution: Extract<TenantContextResolution, { status: "ready" }>;
  selectedTenant: ActiveTenantOption;
  summary: TenantSummary;
}) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">Active tenant</p>
        <h2>{summary.configuration?.display_name ?? selectedTenant.tenant.tenant_id}</h2>
        <p className="muted">{summary.configuration?.legal_name ?? "No legal name configured"}</p>
      </div>
      <div className="header-meta">
        <span className={`status-pill ${selectedTenant.tenant.status}`}>
          {selectedTenant.tenant.status}
        </span>
        <span>{resolution.context.person.primary_email}</span>
        <span>{selectedTenant.roles.join(", ") || "No tenant role"}</span>
      </div>
    </header>
  );
}

function TenantContextPanel({
  tenant,
  options,
  onSelect,
}: {
  tenant: ActiveTenantOption;
  options: readonly ActiveTenantOption[];
  onSelect: (tenantId: string) => void;
}) {
  return (
    <section className="tenant-context">
      <span>Tenant</span>
      <select
        onChange={(event) => void onSelect(event.target.value)}
        value={tenant.tenant.tenant_id}
      >
        {options.map((option) => (
          <option key={option.tenant.tenant_id} value={option.tenant.tenant_id}>
            {option.configuration?.display_name ?? option.tenant.tenant_id}
          </option>
        ))}
      </select>
    </section>
  );
}

function Dashboard({
  resolution,
  selectedTenant,
  summary,
}: {
  resolution: Extract<TenantContextResolution, { status: "ready" }>;
  selectedTenant: ActiveTenantOption;
  summary: TenantSummary;
}) {
  const enabledCapabilities = summary.capabilities.filter(({ enabled }) => enabled);
  const stats = [
    { label: "Memberships", value: countActiveMemberships(summary.memberships) },
    { label: "Pending invitations", value: countPendingInvitations(summary.invitations) },
    { label: "Enabled capabilities", value: enabledCapabilities.length },
    { label: "Recent audit events", value: summary.auditEvents.length },
  ];

  return (
    <section className="content-stack">
      <div className="metric-grid">
        {stats.map((stat) => (
          <article className="metric" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </div>
      <div className="two-column">
        <InfoPanel
          title="Current person"
          rows={[
            ["Email", resolution.context.person.primary_email],
            ["Profile status", resolution.context.person.status],
            ["Membership", selectedTenant.membership.status],
            ["Tenant role", selectedTenant.roles.join(", ") || "None"],
          ]}
        />
        <InfoPanel
          title="Enabled capabilities"
          rows={enabledCapabilities.map(({ capability_key }) => [capability_key, "Enabled"])}
          empty="No capabilities are enabled."
        />
      </div>
      <AuditPanel summary={summary} compact />
    </section>
  );
}

function SettingsPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const initial = useMemo<EditableTenantConfiguration>(
    () => ({
      display_name: summary.configuration?.display_name ?? "",
      legal_name: summary.configuration?.legal_name ?? "",
      default_time_zone: summary.configuration?.default_time_zone ?? "",
      support_contact_email: summary.configuration?.support_contact_email ?? "",
      branding_reference: summary.configuration?.branding_reference ?? "",
    }),
    [summary.configuration],
  );
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setForm(initial), [initial]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const result = await updateTenantSettings(session, summary.tenant.tenant_id, form);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    onRefresh();
  }

  return (
    <section className="panel">
      <PanelHeader
        title="Tenant settings"
        description="Platform-managed tenant configuration values."
      />
      {!canManageTenant ? (
        <p className="notice">
          You can view settings, but RLS does not permit this role to update them.
        </p>
      ) : null}
      <form className="settings-grid" onSubmit={(event) => void handleSubmit(event)}>
        <TextInput
          disabled={!canManageTenant}
          label="Display name"
          name="display_name"
          setForm={setForm}
          value={form.display_name}
        />
        <TextInput
          disabled={!canManageTenant}
          label="Legal name"
          name="legal_name"
          setForm={setForm}
          value={form.legal_name}
        />
        <TextInput
          disabled={!canManageTenant}
          label="Default time zone"
          name="default_time_zone"
          setForm={setForm}
          value={form.default_time_zone}
        />
        <TextInput
          disabled={!canManageTenant}
          label="Support contact email"
          name="support_contact_email"
          setForm={setForm}
          type="email"
          value={form.support_contact_email}
        />
        <TextInput
          disabled={!canManageTenant}
          label="Branding reference"
          name="branding_reference"
          setForm={setForm}
          value={form.branding_reference ?? ""}
        />
        {message ? <p className="form-error">{message}</p> : null}
        <button className="primary-button" disabled={!canManageTenant} type="submit">
          Save settings
        </button>
      </form>
    </section>
  );
}

function TextInput({
  disabled,
  label,
  name,
  setForm,
  type = "text",
  value,
}: {
  disabled: boolean;
  label: string;
  name: keyof EditableTenantConfiguration;
  setForm: (updater: (form: EditableTenantConfiguration) => EditableTenantConfiguration) => void;
  type?: string;
  value: string;
}) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        name={String(name)}
        onChange={(event) => setForm((form) => ({ ...form, [name]: event.target.value }))}
        type={type}
        value={value}
      />
    </label>
  );
}

function MembershipsPanel({
  canManageTenant,
  onRefresh,
  selectedMembershipId,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  selectedMembershipId: string;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  async function updateMembership(membershipId: string, status: "suspended" | "removed") {
    const result = await updateTenantMembershipStatus(
      session,
      summary.tenant.tenant_id,
      membershipId,
      status,
    );

    if (!result.ok) {
      window.alert(result.message);
      return;
    }

    onRefresh();
  }

  return (
    <section className="panel">
      <PanelHeader title="Memberships" description="Tenant-scoped access relationships." />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {summary.memberships.map((membership) => (
              <tr key={membership.membership_id}>
                <td>
                  <strong>
                    {membership.person?.display_name ??
                      membership.person?.primary_email ??
                      "Profile restricted"}
                  </strong>
                  <span>{membership.person?.primary_email ?? membership.person_id}</span>
                </td>
                <td>{membership.status}</td>
                <td>{membership.roles.map(({ role_key }) => role_key).join(", ") || "None"}</td>
                <td>{formatDate(membership.updated_at)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="secondary-button"
                      disabled={
                        !canManageTenant ||
                        membership.membership_id === selectedMembershipId ||
                        membership.status !== "active"
                      }
                      onClick={() => void updateMembership(membership.membership_id, "suspended")}
                      type="button"
                    >
                      Suspend
                    </button>
                    <button
                      className="danger-button"
                      disabled={
                        !canManageTenant ||
                        membership.membership_id === selectedMembershipId ||
                        membership.status === "removed"
                      }
                      onClick={() => void updateMembership(membership.membership_id, "removed")}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InvitationsPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FoundationTenantRole>("tenant_member");
  const [message, setMessage] = useState<string | null>(null);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const result = await createTenantInvitation(session, summary.tenant.tenant_id, email, role);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setEmail("");
    onRefresh();
  }

  async function cancelInvitation(invitationId: string) {
    const result = await cancelTenantInvitation(session, summary.tenant.tenant_id, invitationId);

    if (!result.ok) {
      window.alert(result.message);
      return;
    }

    onRefresh();
  }

  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Create invitation"
          description="Email-only tenant invitation for a foundation role."
        />
        <form className="inline-form" onSubmit={(event) => void submitInvitation(event)}>
          <input
            disabled={!canManageTenant}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            required
            type="email"
            value={email}
          />
          <select
            disabled={!canManageTenant}
            onChange={(event) => setRole(event.target.value as FoundationTenantRole)}
            value={role}
          >
            <option value="tenant_owner">tenant_owner</option>
            <option value="tenant_admin">tenant_admin</option>
            <option value="tenant_member">tenant_member</option>
          </select>
          <button className="primary-button" disabled={!canManageTenant} type="submit">
            Invite
          </button>
        </form>
        {message ? <p className="form-error">{message}</p> : null}
      </section>
      <section className="panel">
        <PanelHeader title="Invitations" description="Pending and historical tenant invitations." />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.invitations.map((invitation) => (
                <tr key={invitation.invitation_id}>
                  <td>{invitation.email}</td>
                  <td>{invitation.intended_role}</td>
                  <td>{invitation.status}</td>
                  <td>{formatDate(invitation.expires_at)}</td>
                  <td>
                    <button
                      className="secondary-button"
                      disabled={!canManageTenant || invitation.status !== "pending"}
                      onClick={() => void cancelInvitation(invitation.invitation_id)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function DriverApplicationsPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, "approved" | "rejected">>(
    {},
  );
  const [expirationOverrides, setExpirationOverrides] = useState<Record<string, string | null>>({});

  async function viewEvidence(evidenceId: string, title: string) {
    const response = await fetch(
      `/api/tenant-admin/drivers/evidence?tenantId=${summary.tenant.tenant_id}&evidenceId=${evidenceId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const result = (await response.json()) as { url?: string; message?: string };
    if (!response.ok) window.alert(result.message ?? "Unable to load files.");
    else if (result.url) setPreview({ title, url: result.url });
  }

  async function reviewEvidence(
    evidenceId: string,
    status: "approved" | "rejected",
    currentExpiration: string | null,
  ) {
    const notes =
      status === "rejected" ? window.prompt("Why is this evidence rejected?")?.trim() : null;
    if (status === "rejected" && !notes) {
      setReviewMessage("A rejection reason is required; no change was made.");
      return;
    }
    const expirationRequired = evidenceRequiresExpiration(summary, evidenceId);
    const expiresOn = status === "approved" ? currentExpiration : null;
    if (status === "approved" && expirationRequired && !expiresOn) {
      const message = "Enter a future expiration date before approving this evidence.";
      setReviewMessage(message);
      window.alert(message);
      return;
    }
    setActiveEvidenceId(evidenceId);
    setReviewMessage(`${status === "approved" ? "Approving" : "Rejecting"} evidence…`);
    try {
      const response = await fetch("/api/tenant-admin/drivers/evidence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: summary.tenant.tenant_id,
          evidenceId,
          status,
          notes: notes || null,
          expiresOn,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to review evidence.");
      setReviewOverrides((current) => ({ ...current, [evidenceId]: status }));
      setExpirationOverrides((current) => ({ ...current, [evidenceId]: expiresOn }));
      setReviewMessage(`Evidence ${status}.`);
      window.alert(`Evidence ${status} successfully.`);
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to review evidence.";
      setReviewMessage(message);
      window.alert(message);
    } finally {
      setActiveEvidenceId(null);
    }
  }
  async function approve(applicationId: string) {
    if (activeApplicationId) return;
    setActiveApplicationId(applicationId);
    setReviewMessage("Approving application and creating draft driver…");
    try {
      const response = await fetch("/api/tenant-admin/drivers", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "approve_application",
          tenantId: summary.tenant.tenant_id,
          applicationId,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to approve application.");
      setReviewMessage("Application approved and draft driver created.");
      onRefresh();
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "Unable to approve application.");
    } finally {
      setActiveApplicationId(null);
    }
  }
  return (
    <section className="panel">
      <PanelHeader
        title="Driver applications"
        description="Review applicants before creating draft driver profiles."
      />
      {reviewMessage ? <p className="notice">{reviewMessage}</p> : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {summary.driverApplications.map((application) => {
              const evidence = summary.driverEvidence.filter(
                ({ driver_application_id }) =>
                  driver_application_id === application.driver_application_id,
              );
              return (
                <tr key={application.driver_application_id}>
                  <td>{application.full_name}</td>
                  <td>
                    {application.email}
                    <span>{application.phone ?? "No phone"}</span>
                  </td>
                  <td>{application.application_status}</td>
                  <td>
                    <div className="row-actions">
                      {evidence.map((item) => {
                        const currentReviewStatus =
                          reviewOverrides[item.evidence_id] ?? item.review_status;
                        const currentExpiration =
                          (item.evidence_id in expirationOverrides
                            ? expirationOverrides[item.evidence_id]
                            : item.expires_on) ?? null;
                        const expirationChanged =
                          item.evidence_id in expirationOverrides &&
                          currentExpiration !== item.expires_on;
                        const required = summary.driverEvidenceRequirements.some(
                          ({ evidence_type, required_for_activation }) =>
                            evidence_type === item.evidence_type && required_for_activation,
                        );
                        const expirationRequired = summary.driverEvidenceRequirements.some(
                          ({ evidence_type, expiration_required }) =>
                            evidence_type === item.evidence_type && expiration_required,
                        );
                        const isLatestEvidence =
                          evidence.find(
                            (candidate) => candidate.evidence_type === item.evidence_type,
                          )?.evidence_id === item.evidence_id;
                        return (
                          <div className="onboarding-checklist" key={item.evidence_id}>
                            <strong>{item.evidence_type.replaceAll("_", " ")}</strong>
                            <span>
                              {currentReviewStatus}
                              {required ? " · required" : " · optional"}
                              {expirationRequired ? " · expiration required" : ""}
                              {isLatestEvidence ? " · current upload" : " · older upload"}
                              {currentExpiration ? ` · expires ${currentExpiration}` : ""}
                            </span>
                            <span>
                              {item.original_file_name} · submitted{" "}
                              {new Date(item.submitted_at).toLocaleDateString()}
                            </span>
                            {item.review_notes ? <span>{item.review_notes}</span> : null}
                            {expirationRequired && isLatestEvidence ? (
                              <label>
                                Expiration date
                                <input
                                  min={tomorrowDate()}
                                  onChange={(event) =>
                                    setExpirationOverrides((current) => ({
                                      ...current,
                                      [item.evidence_id]: event.target.value || null,
                                    }))
                                  }
                                  type="date"
                                  value={currentExpiration ?? ""}
                                />
                              </label>
                            ) : null}
                            <button
                              className="secondary-button"
                              onClick={() =>
                                void viewEvidence(
                                  item.evidence_id,
                                  item.evidence_type.replaceAll("_", " "),
                                )
                              }
                              type="button"
                            >
                              Open
                            </button>
                            <button
                              className="secondary-button"
                              disabled={
                                !canManageTenant ||
                                !isLatestEvidence ||
                                activeEvidenceId === item.evidence_id ||
                                (currentReviewStatus === "approved" &&
                                  (!expirationRequired || item.expires_on !== null) &&
                                  !expirationChanged)
                              }
                              onClick={() =>
                                void reviewEvidence(item.evidence_id, "approved", currentExpiration)
                              }
                              type="button"
                            >
                              {!isLatestEvidence
                                ? "Superseded"
                                : currentReviewStatus === "approved" &&
                                    (!expirationRequired || item.expires_on !== null) &&
                                    !expirationChanged
                                  ? "Approved"
                                  : currentReviewStatus === "approved" && expirationRequired
                                    ? "Save expiration date"
                                    : "Approve evidence"}
                            </button>
                            <button
                              className="danger-button"
                              disabled={
                                !canManageTenant ||
                                !isLatestEvidence ||
                                activeEvidenceId === item.evidence_id ||
                                currentReviewStatus === "rejected"
                              }
                              onClick={() =>
                                void reviewEvidence(item.evidence_id, "rejected", null)
                              }
                              type="button"
                            >
                              Reject evidence
                            </button>
                          </div>
                        );
                      })}
                      {evidence.length === 0 ? <span>No evidence submitted.</span> : null}
                      <button
                        className="primary-button"
                        disabled={
                          !canManageTenant ||
                          application.application_status === "approved" ||
                          activeApplicationId !== null
                        }
                        onClick={() => void approve(application.driver_application_id)}
                        type="button"
                      >
                        {application.application_status === "approved"
                          ? "Draft created"
                          : activeApplicationId === application.driver_application_id
                            ? "Approving…"
                            : "Approve and create draft"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview ? (
        <EvidencePreview onClose={() => setPreview(null)} title={preview.title} url={preview.url} />
      ) : null}
    </section>
  );
}

function DriversPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const enabled = summary.capabilities.some(
    ({ capability_key, enabled }) => capability_key === "driver.management" && enabled,
  );
  const [form, setForm] = useState({
    driverNumber: "",
    displayName: "",
    email: "",
    phone: "",
    onboardingDate: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [activeTransitionId, setActiveTransitionId] = useState<string | null>(null);
  const [checklists, setChecklists] = useState(summary.driverOnboarding);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [evidenceMessage, setEvidenceMessage] = useState<string | null>(null);
  const [evidenceReviewOverrides, setEvidenceReviewOverrides] = useState<
    Record<string, "approved" | "rejected">
  >({});
  const [evidenceExpirationOverrides, setEvidenceExpirationOverrides] = useState<
    Record<string, string | null>
  >({});
  const [evidenceUploadDriverId, setEvidenceUploadDriverId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => setChecklists(summary.driverOnboarding), [summary.driverOnboarding]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const input = {
      ...form,
      email: form.email || null,
      phone: form.phone || null,
      personId: null,
      onboardingDate: form.onboardingDate || null,
    };
    const result = editingId
      ? await updateDriver(session, summary.tenant.tenant_id, editingId, input)
      : await createDriver(session, summary.tenant.tenant_id, input);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setEditingId(null);
    setShowManualForm(false);
    setForm({ driverNumber: "", displayName: "", email: "", phone: "", onboardingDate: "" });
    setMessage(editingId ? "Driver saved." : "Manual driver created.");
    onRefresh();
  }

  async function changeStatus(
    driverProfileId: string,
    status: "draft" | "onboarding" | "active" | "suspended" | "inactive" | "archived",
  ) {
    const reason = ["suspended", "inactive", "archived"].includes(status)
      ? window.prompt("Reason required")
      : null;
    if (["suspended", "inactive", "archived"].includes(status) && !reason) return;
    setActiveTransitionId(driverProfileId);
    const result = await transitionDriver(session, summary.tenant.tenant_id, driverProfileId, {
      status,
      reason,
    });
    setActiveTransitionId(null);
    if (!result.ok) window.alert(result.message);
    else {
      onRefresh();
      window.setTimeout(
        () =>
          document
            .getElementById(`driver-${driverProfileId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        100,
      );
    }
  }

  async function updateChecklist(
    driverProfileId: string,
    field:
      | "personalDetailsComplete"
      | "personalPhotoComplete"
      | "vehicleDetailsComplete"
      | "vehiclePhotoComplete",
    value: boolean,
  ) {
    const result = await updateDriverOnboarding(
      session,
      summary.tenant.tenant_id,
      driverProfileId,
      { [field]: value },
    );
    if (!result.ok) window.alert(result.message);
    else
      setChecklists((current) =>
        current.map((item) =>
          item.driver_profile_id === driverProfileId
            ? {
                ...item,
                [{
                  personalDetailsComplete: "personal_details_complete",
                  personalPhotoComplete: "personal_photo_complete",
                  vehicleDetailsComplete: "vehicle_details_complete",
                  vehiclePhotoComplete: "vehicle_photo_complete",
                }[field]]: value,
              }
            : item,
        ),
      );
  }

  async function reviewChecklist(driverProfileId: string, reviewStatus: "approved" | "rejected") {
    const reviewNotes = reviewStatus === "rejected" ? window.prompt("Reason required") : null;
    if (reviewStatus === "rejected" && !reviewNotes) return;
    const result = await updateDriverOnboarding(
      session,
      summary.tenant.tenant_id,
      driverProfileId,
      { reviewStatus, reviewNotes },
    );
    if (!result.ok) window.alert(result.message);
    else
      setChecklists((current) =>
        current.map((item) =>
          item.driver_profile_id === driverProfileId
            ? { ...item, review_status: reviewStatus, review_notes: reviewNotes }
            : item,
        ),
      );
  }

  async function uploadEvidence(
    driverProfileId: string,
    evidenceType: "personal_photo" | "reference_document" | "vehicle_photo",
    file: File,
  ) {
    const form = new FormData();
    form.set("tenantId", summary.tenant.tenant_id);
    form.set("driverProfileId", driverProfileId);
    form.set("evidenceType", evidenceType);
    form.set("file", file);
    const response = await fetch("/api/tenant-admin/drivers/evidence", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) window.alert(result?.message ?? "Unable to upload evidence.");
    else {
      setEvidenceUploadDriverId(null);
      onRefresh();
    }
  }

  async function openDriverEvidence(evidenceId: string, title: string) {
    const response = await fetch(
      `/api/tenant-admin/drivers/evidence?tenantId=${summary.tenant.tenant_id}&evidenceId=${evidenceId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const result = (await response.json()) as { url?: string; message?: string };
    if (!response.ok) window.alert(result.message ?? "Unable to open evidence.");
    else if (result.url) setPreview({ title, url: result.url });
  }

  async function reviewDriverEvidence(
    evidenceId: string,
    status: "approved" | "rejected",
    currentExpiration: string | null,
  ) {
    const notes =
      status === "rejected" ? window.prompt("Why is this evidence rejected?")?.trim() : null;
    if (status === "rejected" && !notes) {
      setEvidenceMessage("A rejection reason is required; no change was made.");
      return;
    }
    const expirationRequired = evidenceRequiresExpiration(summary, evidenceId);
    const expiresOn = status === "approved" ? currentExpiration : null;
    if (status === "approved" && expirationRequired && !expiresOn) {
      const message = "Enter a future expiration date before approving this evidence.";
      setEvidenceMessage(message);
      window.alert(message);
      return;
    }
    setActiveEvidenceId(evidenceId);
    setEvidenceMessage(`${status === "approved" ? "Approving" : "Rejecting"} evidence…`);
    try {
      const response = await fetch("/api/tenant-admin/drivers/evidence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: summary.tenant.tenant_id,
          evidenceId,
          status,
          notes: notes || null,
          expiresOn,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to review evidence.");
      setEvidenceReviewOverrides((current) => ({ ...current, [evidenceId]: status }));
      setEvidenceExpirationOverrides((current) => ({ ...current, [evidenceId]: expiresOn }));
      setEvidenceMessage(`Evidence ${status}.`);
      window.alert(`Evidence ${status} successfully.`);
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to review evidence.";
      setEvidenceMessage(message);
      window.alert(message);
    } finally {
      setActiveEvidenceId(null);
    }
  }

  function activationBlockers(driverProfileId: string) {
    const checklist = checklists.find((item) => item.driver_profile_id === driverProfileId);
    if (!checklist) return ["onboarding checklist"];

    const blockers: string[] = [];
    if (!checklist.personal_details_complete) blockers.push("personal details");
    if (!checklist.personal_photo_complete) blockers.push("personal photo");
    if (!checklist.vehicle_details_complete) blockers.push("vehicle details");
    if (!checklist.vehicle_photo_complete) blockers.push("vehicle photo");
    if (!checklist.documents_reviewed) blockers.push("document compliance");
    if (checklist.review_status !== "approved") blockers.push("onboarding approval");
    return blockers;
  }

  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Drivers"
          description="Move approved applicants from draft through onboarding to active service."
        />
        <button
          aria-expanded={showManualForm}
          className="secondary-button"
          disabled={!enabled || !canManageTenant}
          onClick={() => {
            setEditingId(null);
            setMessage(null);
            setShowManualForm((current) => !current);
            setForm({
              driverNumber: "",
              displayName: "",
              email: "",
              phone: "",
              onboardingDate: "",
            });
          }}
          type="button"
        >
          {showManualForm ? "Close manual entry" : "Add driver manually"}
        </button>
        {!enabled ? (
          <p className="notice">Driver Management is not enabled for this tenant.</p>
        ) : null}
        {showManualForm ? (
          <form
            className="settings-grid"
            id="manual-driver-form"
            onSubmit={(event) => void submit(event)}
          >
            <DriverTextInput
              disabled={!enabled || !canManageTenant}
              label="Driver number"
              name="driverNumber"
              placeholder="001"
              setForm={(u) => setForm((current) => u(current))}
              value={form.driverNumber}
            />
            <DriverTextInput
              disabled={!enabled || !canManageTenant}
              label="Display name"
              name="displayName"
              setForm={(u) => setForm((current) => u(current))}
              value={form.displayName}
            />
            <DriverTextInput
              disabled={!enabled || !canManageTenant}
              label="Email"
              name="email"
              type="email"
              setForm={(u) => setForm((current) => u(current))}
              value={form.email}
            />
            <DriverTextInput
              disabled={!enabled || !canManageTenant}
              label="Phone"
              name="phone"
              setForm={(u) => setForm((current) => u(current))}
              value={form.phone}
            />
            <label>
              Onboarding date
              <input
                disabled={!enabled || !canManageTenant}
                type="date"
                value={form.onboardingDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, onboardingDate: event.target.value }))
                }
              />
            </label>
            <button
              className="primary-button"
              disabled={!enabled || !canManageTenant}
              type="submit"
            >
              {editingId ? "Save driver" : "Create manual driver"}
            </button>
            {editingId ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingId(null);
                  setShowManualForm(false);
                  setForm({
                    driverNumber: "",
                    displayName: "",
                    email: "",
                    phone: "",
                    onboardingDate: "",
                  });
                }}
                type="button"
              >
                Cancel edit
              </button>
            ) : null}
          </form>
        ) : null}
        {message ? <p className="form-error">{message}</p> : null}
      </section>
      <section className="panel">
        {evidenceMessage ? <p className="notice">{evidenceMessage}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Availability</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary.drivers.map((driver) => (
                <tr id={`driver-${driver.driver_profile_id}`} key={driver.driver_profile_id}>
                  <td>{driver.driver_number}</td>
                  <td>
                    <strong>{driver.display_name}</strong>
                    <span>{driver.email ?? "No email"}</span>
                  </td>
                  <td>{driver.status}</td>
                  <td className="availability-cell">
                    {(() => {
                      const availability = driverAvailabilityStatus(
                        summary,
                        driver.driver_profile_id,
                      );
                      const location = summary.driverLocations.find(
                        (item) => item.driver_profile_id === driver.driver_profile_id,
                      );
                      return (
                        <>
                          <strong>{availability.status}</strong>
                          {availability.note ? <span>{availability.note}</span> : null}
                          {location?.sharing_enabled && location.recorded_at ? (
                            <span>Location {locationFreshness(location.recorded_at)}</span>
                          ) : (
                            <span>Location not shared</span>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td>{driver.phone ?? "No phone"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        disabled={!canManageTenant || !enabled}
                        onClick={(event) => {
                          event.preventDefault();
                          setEditingId(driver.driver_profile_id);
                          setShowManualForm(true);
                          setForm({
                            driverNumber: driver.driver_number,
                            displayName: driver.display_name,
                            email: driver.email ?? "",
                            phone: driver.phone ?? "",
                            onboardingDate: driver.onboarding_date ?? "",
                          });
                          window.setTimeout(
                            () =>
                              document
                                .getElementById("manual-driver-form")
                                ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                            0,
                          );
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      {driver.status === "draft" ? (
                        <button
                          className="secondary-button"
                          disabled={
                            !canManageTenant ||
                            !enabled ||
                            activeTransitionId === driver.driver_profile_id
                          }
                          onClick={() => void changeStatus(driver.driver_profile_id, "onboarding")}
                          type="button"
                        >
                          {activeTransitionId === driver.driver_profile_id
                            ? "Starting…"
                            : "Start onboarding"}
                        </button>
                      ) : null}
                      {driver.status === "onboarding" ? (
                        <button
                          className="secondary-button"
                          disabled={
                            !canManageTenant ||
                            !enabled ||
                            activeTransitionId === driver.driver_profile_id ||
                            activationBlockers(driver.driver_profile_id).length > 0
                          }
                          onClick={() => void changeStatus(driver.driver_profile_id, "active")}
                          title={
                            activationBlockers(driver.driver_profile_id).length > 0
                              ? `Complete: ${activationBlockers(driver.driver_profile_id).join(", ")}`
                              : "Activate driver"
                          }
                          type="button"
                        >
                          Activate
                        </button>
                      ) : null}
                      {driver.status === "active" ? (
                        <button
                          className="danger-button"
                          disabled={!canManageTenant || !enabled}
                          onClick={() => void changeStatus(driver.driver_profile_id, "suspended")}
                          type="button"
                        >
                          Suspend
                        </button>
                      ) : null}
                      {driver.status === "suspended" ? (
                        <button
                          className="secondary-button"
                          disabled={!canManageTenant || !enabled}
                          onClick={() => void changeStatus(driver.driver_profile_id, "active")}
                          type="button"
                        >
                          Reactivate
                        </button>
                      ) : null}
                      {(() => {
                        const checklist = checklists.find(
                          (item) => item.driver_profile_id === driver.driver_profile_id,
                        );
                        if (!checklist) return null;
                        const complete =
                          checklist.personal_details_complete &&
                          checklist.personal_photo_complete &&
                          checklist.vehicle_details_complete &&
                          checklist.vehicle_photo_complete &&
                          checklist.documents_reviewed;
                        const blockers = activationBlockers(driver.driver_profile_id);
                        return (
                          <div className="onboarding-checklist">
                            <span>Onboarding: {checklist.review_status}</span>
                            {(
                              [
                                "personal_details_complete",
                                "personal_photo_complete",
                                "vehicle_details_complete",
                                "vehicle_photo_complete",
                              ] as const
                            ).map((field) => (
                              <label key={field}>
                                <input
                                  checked={checklist[field]}
                                  disabled={!canManageTenant || !enabled}
                                  onChange={(event) =>
                                    void updateChecklist(
                                      driver.driver_profile_id,
                                      (
                                        {
                                          personal_details_complete: "personalDetailsComplete",
                                          personal_photo_complete: "personalPhotoComplete",
                                          vehicle_details_complete: "vehicleDetailsComplete",
                                          vehicle_photo_complete: "vehiclePhotoComplete",
                                        } as const
                                      )[field],
                                      event.target.checked,
                                    )
                                  }
                                  type="checkbox"
                                />
                                {field.replaceAll("_", " ")}
                              </label>
                            ))}
                            <span>
                              Document compliance:{" "}
                              {checklist.documents_reviewed ? "satisfied" : "pending"}
                            </span>
                            {driver.status === "onboarding" && blockers.length > 0 ? (
                              <span className="form-error">
                                Activation requires: {blockers.join(", ")}.
                              </span>
                            ) : null}
                            {summary.driverEvidence
                              .filter(
                                ({ driver_profile_id }) =>
                                  driver_profile_id === driver.driver_profile_id,
                              )
                              .map((evidence) => {
                                const currentReviewStatus =
                                  evidenceReviewOverrides[evidence.evidence_id] ??
                                  evidence.review_status;
                                const currentExpiration =
                                  (evidence.evidence_id in evidenceExpirationOverrides
                                    ? evidenceExpirationOverrides[evidence.evidence_id]
                                    : evidence.expires_on) ?? null;
                                const expirationChanged =
                                  evidence.evidence_id in evidenceExpirationOverrides &&
                                  currentExpiration !== evidence.expires_on;
                                const isLatestEvidence =
                                  summary.driverEvidence.find(
                                    (candidate) =>
                                      candidate.driver_profile_id === evidence.driver_profile_id &&
                                      candidate.evidence_type === evidence.evidence_type,
                                  )?.evidence_id === evidence.evidence_id;
                                const expirationRequired = summary.driverEvidenceRequirements.some(
                                  ({ evidence_type, expiration_required }) =>
                                    evidence_type === evidence.evidence_type && expiration_required,
                                );
                                return (
                                  <div className="row-actions" key={evidence.evidence_id}>
                                    <span>
                                      {evidence.evidence_type.replaceAll("_", " ")} ·{" "}
                                      {currentReviewStatus}
                                      {isLatestEvidence ? " · current upload" : " · older upload"}
                                      {expirationRequired ? " · expiration required" : ""}
                                      {currentExpiration ? ` · expires ${currentExpiration}` : ""}
                                    </span>
                                    <span>
                                      {evidence.original_file_name} · submitted{" "}
                                      {new Date(evidence.submitted_at).toLocaleDateString()}
                                    </span>
                                    {expirationRequired && isLatestEvidence ? (
                                      <label>
                                        Expiration date
                                        <input
                                          min={tomorrowDate()}
                                          onChange={(event) =>
                                            setEvidenceExpirationOverrides((current) => ({
                                              ...current,
                                              [evidence.evidence_id]: event.target.value || null,
                                            }))
                                          }
                                          type="date"
                                          value={currentExpiration ?? ""}
                                        />
                                      </label>
                                    ) : null}
                                    <button
                                      className="secondary-button"
                                      onClick={() =>
                                        void openDriverEvidence(
                                          evidence.evidence_id,
                                          evidence.evidence_type.replaceAll("_", " "),
                                        )
                                      }
                                      type="button"
                                    >
                                      Open
                                    </button>
                                    <button
                                      className="secondary-button"
                                      disabled={
                                        !canManageTenant ||
                                        !isLatestEvidence ||
                                        activeEvidenceId === evidence.evidence_id ||
                                        (currentReviewStatus === "approved" &&
                                          (!expirationRequired || evidence.expires_on !== null) &&
                                          !expirationChanged)
                                      }
                                      onClick={() =>
                                        void reviewDriverEvidence(
                                          evidence.evidence_id,
                                          "approved",
                                          currentExpiration,
                                        )
                                      }
                                      type="button"
                                    >
                                      {!isLatestEvidence
                                        ? "Superseded"
                                        : currentReviewStatus === "approved" &&
                                            (!expirationRequired || evidence.expires_on !== null) &&
                                            !expirationChanged
                                          ? "Approved"
                                          : currentReviewStatus === "approved" && expirationRequired
                                            ? "Save expiration date"
                                            : "Approve"}
                                    </button>
                                    <button
                                      className="danger-button"
                                      disabled={
                                        !canManageTenant ||
                                        !isLatestEvidence ||
                                        activeEvidenceId === evidence.evidence_id ||
                                        currentReviewStatus === "rejected"
                                      }
                                      onClick={() =>
                                        void reviewDriverEvidence(
                                          evidence.evidence_id,
                                          "rejected",
                                          null,
                                        )
                                      }
                                      type="button"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                );
                              })}
                            <button
                              aria-expanded={evidenceUploadDriverId === driver.driver_profile_id}
                              className="secondary-button"
                              disabled={!canManageTenant || !enabled}
                              onClick={() =>
                                setEvidenceUploadDriverId((current) =>
                                  current === driver.driver_profile_id
                                    ? null
                                    : driver.driver_profile_id,
                                )
                              }
                              type="button"
                            >
                              {evidenceUploadDriverId === driver.driver_profile_id
                                ? "Close evidence upload"
                                : "Replace or add evidence"}
                            </button>
                            {evidenceUploadDriverId === driver.driver_profile_id
                              ? (
                                  [
                                    ["personal_photo", "Upload personal photo"],
                                    ["reference_document", "Upload reference document"],
                                    ["vehicle_photo", "Upload vehicle photo"],
                                  ] as const
                                ).map(([evidenceType, label]) => (
                                  <label key={evidenceType}>
                                    {label}
                                    <input
                                      accept="image/jpeg,image/png,application/pdf"
                                      disabled={!canManageTenant || !enabled}
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file)
                                          void uploadEvidence(
                                            driver.driver_profile_id,
                                            evidenceType,
                                            file,
                                          );
                                        event.target.value = "";
                                      }}
                                      type="file"
                                    />
                                  </label>
                                ))
                              : null}
                            <button
                              className="secondary-button"
                              disabled={
                                !canManageTenant ||
                                !enabled ||
                                !complete ||
                                checklist.review_status === "approved"
                              }
                              onClick={() =>
                                void reviewChecklist(driver.driver_profile_id, "approved")
                              }
                              type="button"
                            >
                              {checklist.review_status === "approved"
                                ? "Onboarding approved"
                                : "Approve onboarding"}
                            </button>
                            <button
                              className="danger-button"
                              disabled={!canManageTenant || !enabled}
                              onClick={() =>
                                void reviewChecklist(driver.driver_profile_id, "rejected")
                              }
                              type="button"
                            >
                              Reject
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.drivers.length === 0 ? (
          <EmptyState message="No drivers have been created." />
        ) : null}
      </section>
      {preview ? (
        <EvidencePreview onClose={() => setPreview(null)} title={preview.title} url={preview.url} />
      ) : null}
    </section>
  );
}

function NotificationsPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const deliverable = summary.notifications.filter(
    ({ attempt_count, delivery_status }) =>
      attempt_count < 5 && ["queued", "failed"].includes(delivery_status),
  );
  const batch = deliverable.slice(0, 10);
  const recipientCount = new Set(batch.map(({ recipient_email }) => recipient_email)).size;
  const visible =
    statusFilter === "all"
      ? summary.notifications
      : summary.notifications.filter(({ delivery_status }) => delivery_status === statusFilter);

  async function deliver(notificationId?: string) {
    const batchMessage = notificationId
      ? "Deliver this one notification?"
      : `Deliver ${batch.length} notification${batch.length === 1 ? "" : "s"} to ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}?`;
    if (!window.confirm(batchMessage)) return;
    const busyKey = notificationId ?? "batch";
    setBusyId(busyKey);
    setMessage(
      notificationId
        ? "Delivering one notification…"
        : `Delivering up to ${batch.length} notifications…`,
    );
    try {
      const response = await fetch("/api/tenant-admin/notifications/deliver", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: summary.tenant.tenant_id, notificationId }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to deliver notifications.");
      setMessage(result?.message ?? "Notification delivery completed.");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to deliver notifications.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Transactional notifications"
          description="Review and safely deliver tenant-wide email plus opted-in privacy-safe push and SMS. Bulk delivery is limited to 10 messages."
        />
        <div className="notification-metrics">
          <div>
            <strong>{deliverable.length}</strong>
            <span>Awaiting delivery or retry</span>
          </div>
          <div>
            <strong>
              {
                summary.notifications.filter(
                  ({ delivery_status }) => delivery_status === "delivered",
                ).length
              }
            </strong>
            <span>Recently delivered</span>
          </div>
          <div>
            <strong>
              {
                summary.notifications.filter(({ delivery_status }) => delivery_status === "failed")
                  .length
              }
            </strong>
            <span>Failed</span>
          </div>
        </div>
        <div className="row-actions">
          <button
            className="primary-button"
            disabled={!canManageTenant || busyId !== null || batch.length === 0}
            onClick={() => void deliver()}
            type="button"
          >
            {busyId === "batch" ? "Delivering…" : `Deliver next ${batch.length || 0}`}
          </button>
          <span className="muted">
            Next batch: {batch.length} messages to {recipientCount} recipients. You will confirm
            before sending.
          </span>
          <button className="secondary-button" onClick={onRefresh} type="button">
            Refresh
          </button>
        </div>
        {message ? <p className="notice">{message}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Delivery history</p>
            <h3>Recent notifications</h3>
          </div>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {["queued", "sending", "sent", "delivered", "failed", "canceled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <EmptyState message="No notifications match this filter." />
        ) : (
          <div className="notification-table">
            {visible.map((notification) => {
              const canDeliver =
                notification.attempt_count < 5 &&
                ["queued", "failed"].includes(notification.delivery_status);
              return (
                <article key={notification.notification_id}>
                  <div>
                    <strong>{notification.notification_type.replaceAll("_", " ")}</strong>
                    <span>{notification.recipient_email}</span>
                    <span className="muted">
                      Created {formatDate(notification.created_at)} · Attempts{" "}
                      {notification.attempt_count}/5
                    </span>
                  </div>
                  <span className={`status-pill ${notification.delivery_status}`}>
                    {notification.delivery_status}
                  </span>
                  {notification.delivery_error ? (
                    <span className="form-error">{notification.delivery_error}</span>
                  ) : null}
                  {canDeliver ? (
                    <button
                      className="secondary-button"
                      disabled={!canManageTenant || busyId !== null}
                      onClick={() => void deliver(notification.notification_id)}
                      type="button"
                    >
                      {notification.delivery_status === "failed" ? "Retry one" : "Deliver one"}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function DispatchPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
  const [completionReasons, setCompletionReasons] = useState<Record<string, string>>({});
  const [dispatchNow, setDispatchNow] = useState(() => Date.now());

  useEffect(() => {
    const refreshInterval = window.setInterval(onRefresh, 5_000);
    const clockInterval = window.setInterval(() => setDispatchNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [onRefresh]);

  async function request(
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    busyKey: string,
    successMessage: string,
  ) {
    setBusyId(busyKey);
    setMessage(null);
    try {
      const response = await fetch("/api/tenant-admin/settings", {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: summary.tenant.tenant_id, ...body }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Dispatch action failed.");
      setMessage(result?.message ?? successMessage);
      if (method === "POST") setShowForm(false);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dispatch action failed.");
    } finally {
      setBusyId(null);
    }
  }

  function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === "string" ? field : "";
    };
    void request(
      "POST",
      {
        kind: "dispatch_create",
        serviceAreaId: value("serviceAreaId"),
        customerName: value("customerName"),
        customerPhone: value("customerPhone"),
        pickupAddress: value("pickupAddress"),
        destinationAddress: value("destinationAddress"),
        notes: value("notes"),
      },
      "create",
      "Booking created.",
    );
  }

  async function cancelBooking(bookingId: string, paid: boolean) {
    if (!paid) return request("PATCH", { kind: "dispatch_cancel", bookingId }, bookingId, "Booking cancelled.");
    setBusyId(bookingId); setMessage(null);
    try {
      const response = await fetch("/api/tenant-admin/refunds", { method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }) });
      const result = await response.json() as { refunded?: boolean; message?: string };
      if (!response.ok || !result.refunded) throw new Error(result.message ?? "Trip refund failed.");
      setMessage("Booking cancelled and payment refunded."); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Trip refund failed."); }
    finally { setBusyId(null); }
  }

  function saveSchedulingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === "string" ? field : "";
    };
    void request(
      "PATCH",
      {
        kind: "scheduling_settings",
        minimumNoticeMinutes: value("minimumNoticeMinutes"),
        maximumAdvanceDays: value("maximumAdvanceDays"),
        dispatchLeadMinutes: value("dispatchLeadMinutes"),
        reminderLeadHours: value("reminderLeadHours"),
      },
      "scheduling-settings",
      "Scheduling settings saved.",
    );
  }

  function saveMatchingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === "string" ? field : "";
    };
    void request(
      "PATCH",
      {
        kind: "matching_settings",
        automaticMatchingEnabled: form.get("automaticMatchingEnabled") === "on",
        offerDurationSeconds: value("offerDurationSeconds"),
        maximumAttempts: value("maximumAttempts"),
      },
      "matching-settings",
      "Automatic matching settings saved.",
    );
  }

  const activeAreas = summary.serviceAreas.filter(({ status }) => status === "active");
  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Manual dispatch"
          description="Create bookings and offer them to eligible online drivers in the same operating area."
        />
        <div className="row-actions">
          <button
            className="primary-button"
            disabled={!canManageTenant || activeAreas.length === 0}
            onClick={() => setShowForm((current) => !current)}
            type="button"
          >
            {showForm ? "Close booking form" : "Create booking"}
          </button>
          <button className="secondary-button" onClick={onRefresh} type="button">
            Refresh dispatch
          </button>
        </div>
        {activeAreas.length === 0 ? (
          <p className="notice">Create and activate a service area before creating bookings.</p>
        ) : null}
        {message ? <p className="notice">{message}</p> : null}
        {showForm ? (
          <form className="settings-grid" onSubmit={createBooking}>
            <label>
              Service area
              <select name="serviceAreaId" required>
                <option value="">Select service area</option>
                {activeAreas.map((area) => (
                  <option key={area.service_area_id} value={area.service_area_id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer name
              <input name="customerName" placeholder="Example: Alex Johnson" required />
            </label>
            <label>
              Customer phone
              <input name="customerPhone" placeholder="Example: 469-555-0123" type="tel" />
            </label>
            <label>
              Pickup address
              <input name="pickupAddress" placeholder="Example: 100 Main St, Dallas, TX" required />
            </label>
            <label>
              Destination address
              <input
                name="destinationAddress"
                placeholder="Example: DFW Airport Terminal A"
                required
              />
            </label>
            <label>
              Notes
              <input name="notes" placeholder="Example: Customer is waiting at the east entrance" />
            </label>
            <button className="primary-button" disabled={busyId !== null} type="submit">
              Create booking
            </button>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <PanelHeader
          title="Automatic driver matching"
          description="Offer each requested trip to one eligible online Driver at a time. Unanswered and declined offers move to the next untried Driver; manual dispatch stays available at every stage."
        />
        <form className="settings-grid" onSubmit={saveMatchingSettings}>
          <label>
            <span>Automatic matching</span>
            <input
              defaultChecked={summary.matchingSettings?.automatic_matching_enabled ?? false}
              name="automaticMatchingEnabled"
              type="checkbox"
            />
            <span className="muted">Enable for new and currently waiting bookings</span>
          </label>
          <label>
            Driver response time (seconds)
            <input
              defaultValue={summary.matchingSettings?.offer_duration_seconds ?? 90}
              min="30"
              max="300"
              name="offerDurationSeconds"
              placeholder="Example: 90"
              type="number"
              required
            />
          </label>
          <label>
            Maximum automatic attempts
            <input
              defaultValue={summary.matchingSettings?.maximum_attempts ?? 3}
              min="1"
              max="10"
              name="maximumAttempts"
              placeholder="Example: 3"
              type="number"
              required
            />
          </label>
          <p className="muted">
            Eligible Drivers must be active, online in the trip area, compliant, assigned an active
            vehicle, and free of another active trip. Drivers with the oldest prior work are tried
            first; Driver number breaks ties.
          </p>
          <button
            className="primary-button"
            disabled={!canManageTenant || busyId !== null}
            type="submit"
          >
            Save matching settings
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelHeader
          title="Scheduled booking rules"
          description={`Times are interpreted in ${summary.configuration?.default_time_zone ?? "the tenant time zone"}. Drivers are assigned only when dispatch begins.`}
        />
        <form className="settings-grid" onSubmit={saveSchedulingSettings}>
          <label>
            Minimum notice (minutes)
            <input
              defaultValue={summary.schedulingSettings?.minimum_notice_minutes ?? 60}
              min="15"
              max="10080"
              name="minimumNoticeMinutes"
              type="number"
              required
            />
          </label>
          <label>
            Maximum advance window (days)
            <input
              defaultValue={summary.schedulingSettings?.maximum_advance_days ?? 90}
              min="1"
              max="365"
              name="maximumAdvanceDays"
              type="number"
              required
            />
          </label>
          <label>
            Begin dispatch before pickup (minutes)
            <input
              defaultValue={summary.schedulingSettings?.dispatch_lead_minutes ?? 30}
              min="5"
              max="1440"
              name="dispatchLeadMinutes"
              type="number"
              required
            />
          </label>
          <label>
            Reminder before pickup (hours)
            <input
              defaultValue={summary.schedulingSettings?.reminder_lead_hours ?? 24}
              min="1"
              max="168"
              name="reminderLeadHours"
              type="number"
              required
            />
          </label>
          <button
            className="primary-button"
            disabled={!canManageTenant || busyId !== null}
            type="submit"
          >
            Save scheduling rules
          </button>
        </form>
      </section>

      {summary.riderBookingSeries.length > 0 ? <section className="panel">
        <PanelHeader title="Recurring Rider schedules" description="Riders pay each occurrence separately before it enters the scheduled dispatch queue." />
        <div className="table-wrap"><table><thead><tr><th>Rider</th><th>Route</th><th>Pattern</th><th>Occurrences</th><th>Status</th></tr></thead><tbody>
          {summary.riderBookingSeries.map((series) => { const rider = summary.riderProfiles.find((item) => item.rider_profile_id === series.rider_profile_id); const occurrences = summary.riderBookingSeriesOccurrences.filter((item) => item.rider_booking_series_id === series.rider_booking_series_id); const awaiting = occurrences.filter((item) => item.status === "awaiting_payment").length; const pending = occurrences.filter((item) => item.status === "payment_pending" || item.autopay_status === "processing").length; const failures = occurrences.filter((item) => item.autopay_status === "failed" || item.autopay_status === "retryable").length; const booked = occurrences.filter((item) => item.status === "booked").length; return <tr key={series.rider_booking_series_id}><td><strong>{rider?.display_name ?? series.rider_profile_id.slice(0, 8)}</strong><br />Autopay: {series.autopay_enabled ? "on" : "off"}</td><td>{series.pickup_address}<br />to {series.destination_address}</td><td>{series.weekdays.map((day) => ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"][day]).join(", ")} · {series.local_pickup_time.slice(0, 5)}<br />{series.start_date} through {series.end_date}</td><td>{booked} booked · {pending} processing · {awaiting} awaiting{failures ? ` · ${failures} need attention` : ""} · {occurrences.length} total</td><td>{series.status}</td></tr>; })}
        </tbody></table></div>
      </section> : null}

      {summary.dispatchBookings.length === 0 ? (
        <section className="panel">
          <EmptyState message="No dispatch bookings have been created." />
        </section>
      ) : (
        summary.dispatchBookings.map((booking) => {
          const area = summary.serviceAreas.find(
            ({ service_area_id }) => service_area_id === booking.service_area_id,
          );
          const currentDriver = summary.drivers.find(
            ({ driver_profile_id }) => driver_profile_id === booking.current_driver_profile_id,
          );
          const pendingOffer = summary.dispatchOffers.find(
            (offer) => offer.booking_id === booking.booking_id && offer.status === "pending",
          );
          const bookingOffers = summary.dispatchOffers.filter(
            (offer) => offer.booking_id === booking.booking_id,
          );
          const automaticAttempts = bookingOffers.filter(
            (offer) => offer.offer_source === "automatic",
          );
          const offeredDriver = summary.drivers.find(
            ({ driver_profile_id }) => driver_profile_id === pendingOffer?.driver_profile_id,
          );
          const visibleDriverId =
            booking.current_driver_profile_id ?? pendingOffer?.driver_profile_id ?? null;
          const driverLocation = summary.driverLocations.find(
            (location) => location.driver_profile_id === visibleDriverId,
          );
          const eligibleDrivers = summary.drivers.filter((driver) => {
            const availability = summary.driverAvailability.find(
              (item) => item.driver_profile_id === driver.driver_profile_id,
            );
            return (
              driver.status === "active" &&
              availability?.requested_status === "online" &&
              availability.selected_service_area_id === booking.service_area_id &&
              driverAvailabilityStatus(summary, driver.driver_profile_id).status === "Online"
            );
          });
          const canOffer = booking.status === "requested" || booking.status === "offered";
          return (
            <section className="panel" key={booking.booking_id}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{area?.name ?? "Service area"}</p>
                  <h3>{booking.customer_name}</h3>
                  <p className="muted">
                    {booking.pickup_address} → {booking.destination_address}
                  </p>
                  {booking.fare_currency_code && booking.final_fare_minor != null ? <strong>Fare: {new Intl.NumberFormat(undefined, { style: "currency", currency: booking.fare_currency_code }).format(booking.final_fare_minor / 100)}</strong> : null}
                </div>
                <span className={`status-pill ${booking.status}`}>{booking.status}</span>
              </div>
              <dl className="details-grid">
                <div>
                  <dt>Pickup time</dt>
                  <dd>
                    {booking.scheduled_pickup_at
                      ? formatDate(booking.scheduled_pickup_at)
                      : "Ride now"}
                  </dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{booking.customer_phone ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Driver</dt>
                  <dd>
                    {currentDriver?.display_name ?? offeredDriver?.display_name ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt>Offer deadline</dt>
                  <dd>
                    {pendingOffer
                      ? Date.parse(pendingOffer.expires_at) <= dispatchNow
                        ? "Expiring now"
                        : `${Math.ceil(
                            (Date.parse(pendingOffer.expires_at) - dispatchNow) / 1000,
                          )} seconds`
                      : "No pending offer"}
                  </dd>
                </div>
                <div>
                  <dt>Matching</dt>
                  <dd>
                    {pendingOffer
                      ? `${pendingOffer.offer_source === "automatic" ? "Automatic" : "Manual"} offer`
                      : summary.matchingSettings?.automatic_matching_enabled
                        ? `${automaticAttempts.length} automatic attempt${automaticAttempts.length === 1 ? "" : "s"}`
                        : "Manual"}
                  </dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{booking.booking_notes ?? "None"}</dd>
                </div>
                <div>
                  <dt>Live location</dt>
                  <dd>
                    {driverLocation?.sharing_enabled &&
                    driverLocation.latitude !== null &&
                    driverLocation.longitude !== null &&
                    driverLocation.recorded_at ? (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${driverLocation.latitude}&mlon=${driverLocation.longitude}#map=16/${driverLocation.latitude}/${driverLocation.longitude}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View map · {locationFreshness(driverLocation.recorded_at)} · ±
                        {Math.round(driverLocation.accuracy_meters ?? 0)} m
                      </a>
                    ) : (
                      "Not shared"
                    )}
                  </dd>
                </div>
              </dl>
              {mapboxToken && booking.pickup_latitude != null && booking.pickup_longitude != null && booking.destination_latitude != null && booking.destination_longitude != null ? (
                <LiveTripMap
                  accessToken={mapboxToken}
                  pickup={{ latitude: booking.pickup_latitude, longitude: booking.pickup_longitude, label: `Pickup: ${booking.pickup_address}` }}
                  destination={{ latitude: booking.destination_latitude, longitude: booking.destination_longitude, label: `Destination: ${booking.destination_address}` }}
                  driver={driverLocation?.sharing_enabled && driverLocation.latitude != null && driverLocation.longitude != null ? { latitude: driverLocation.latitude, longitude: driverLocation.longitude, label: `${currentDriver?.display_name ?? offeredDriver?.display_name ?? "Driver"} live location` } : null}
                />
              ) : null}
              {bookingOffers.length > 0 ? (
                <details>
                  <summary>Offer history ({bookingOffers.length})</summary>
                  <div className="content-stack compact-stack">
                    {bookingOffers.map((offer, index) => {
                      const driver = summary.drivers.find(
                        (item) => item.driver_profile_id === offer.driver_profile_id,
                      );
                      return (
                        <p className="muted" key={offer.offer_id}>
                          {bookingOffers.length - index}. {driver?.display_name ?? "Driver"} ·{" "}
                          {offer.offer_source} · {offer.status} · {formatDate(offer.offered_at)}
                        </p>
                      );
                    })}
                  </div>
                </details>
              ) : null}
              {canOffer ? (
                <div className="row-actions">
                  <select
                    aria-label={`Eligible driver for ${booking.customer_name}`}
                    onChange={(event) =>
                      setSelectedDrivers((current) => ({
                        ...current,
                        [booking.booking_id]: event.target.value,
                      }))
                    }
                    value={selectedDrivers[booking.booking_id] ?? ""}
                  >
                    <option value="">Select online driver</option>
                    {eligibleDrivers.map((driver) => (
                      <option key={driver.driver_profile_id} value={driver.driver_profile_id}>
                        {driver.display_name} · #{driver.driver_number}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    disabled={
                      !canManageTenant || busyId !== null || !selectedDrivers[booking.booking_id]
                    }
                    onClick={() =>
                      void request(
                        "PATCH",
                        {
                          kind: "dispatch_offer",
                          bookingId: booking.booking_id,
                          driverProfileId: selectedDrivers[booking.booking_id] ?? "",
                        },
                        booking.booking_id,
                        "Trip offered to driver.",
                      )
                    }
                    type="button"
                  >
                    {pendingOffer ? "Reassign offer" : "Offer trip"}
                  </button>
                  {eligibleDrivers.length === 0 ? (
                    <span className="muted">No eligible online drivers in this area.</span>
                  ) : null}
                </div>
              ) : null}
              {booking.status === "in_progress" ? (
                <div className="row-actions">
                  <input aria-label={`Reason for ending ${booking.customer_name}`} maxLength={500} onChange={(event) => setCompletionReasons((current) => ({ ...current, [booking.booking_id]: event.target.value }))} placeholder="Reason for ending trip" value={completionReasons[booking.booking_id] ?? ""} />
                  <button className="danger-button" disabled={!canManageTenant || busyId !== null || (completionReasons[booking.booking_id] ?? "").trim().length < 3} onClick={() => void request("PATCH", { kind: "dispatch_complete", bookingId: booking.booking_id, completionReason: completionReasons[booking.booking_id] ?? "" }, booking.booking_id, "Trip ended by Admin and recorded as completed.")} type="button">
                    End trip as Admin
                  </button>
                </div>
              ) : null}
              {!['completed', 'cancelled'].includes(booking.status) ? (
                <button
                  className="danger-button"
                  disabled={!canManageTenant || busyId !== null}
                  onClick={() =>
                    void cancelBooking(booking.booking_id, summary.riderPaymentAttempts.some((payment) => payment.booking_id === booking.booking_id && payment.status === "paid"))
                  }
                  type="button"
                >
                  Cancel booking
                </button>
              ) : null}
            </section>
          );
        })
      )}
    </section>
  );
}

function ServiceAreasPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const draftStorageKey = `esh-service-area-draft:${summary.tenant.tenant_id}`;
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDraft, setFormDraft] = useState(emptyServiceAreaDraft);
  const [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});
  useEffect(() => {
    const restored = restoreServiceAreaDraft(window.sessionStorage.getItem(draftStorageKey));
    setFormDraft(restored.draft);
    setShowForm(restored.showForm);
    setRestoredDraftKey(draftStorageKey);
  }, [draftStorageKey]);

  useEffect(() => {
    if (restoredDraftKey !== draftStorageKey || editingAreaId) return;
    window.sessionStorage.setItem(draftStorageKey, JSON.stringify({ showForm, draft: formDraft }));
  }, [draftStorageKey, editingAreaId, formDraft, restoredDraftKey, showForm]);

  function clearCreateDraft() {
    setFormDraft(emptyServiceAreaDraft);
    window.sessionStorage.removeItem(draftStorageKey);
  }

  function updateDraft(field: keyof typeof emptyServiceAreaDraft, value: string) {
    setFormDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = form.get(name);
      return typeof field === "string" ? field : "";
    };
    const payload = {
      tenantId: summary.tenant.tenant_id,
      name: value("name"),
      description: value("description"),
      centerLatitude: value("centerLatitude"),
      centerLongitude: value("centerLongitude"),
      radiusKm: value("radiusKm"),
      coverageMode: value("coverageMode"),
      ...(editingAreaId ? { kind: "service_area_update", serviceAreaId: editingAreaId } : {}),
    };
    setBusyId(editingAreaId ?? "create");
    setMessage(editingAreaId ? "Saving service area…" : "Creating service area…");
    try {
      const response = await fetch("/api/tenant-admin/settings", {
        method: editingAreaId ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to save service area.");
      setMessage(editingAreaId ? "Service area updated." : "Service area created.");
      if (!editingAreaId) clearCreateDraft();
      setEditingAreaId(null);
      setShowForm(false);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save service area.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateArea(
    serviceAreaId: string,
    body: Record<string, string>,
    successMessage: string,
  ) {
    setBusyId(serviceAreaId);
    setMessage(null);
    try {
      const response = await fetch("/api/tenant-admin/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: summary.tenant.tenant_id,
          serviceAreaId,
          ...body,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to update service area.");
      setMessage(successMessage);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update service area.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Service areas"
          description="Define tenant operating boundaries for all active drivers or restrict coverage to selected drivers. Driver live coordinates are accepted only inside the selected boundary."
        />
        <button
          className="primary-button"
          disabled={!canManageTenant}
          onClick={() => {
            if (showForm && !editingAreaId) {
              setShowForm(false);
              clearCreateDraft();
            } else {
              setEditingAreaId(null);
              setFormDraft(emptyServiceAreaDraft);
              setShowForm(true);
            }
          }}
          type="button"
        >
          {showForm && !editingAreaId ? "Close form" : "Add service area"}
        </button>
        {message ? <p className="notice">{message}</p> : null}
        {showForm ? (
          <form className="settings-grid" onSubmit={(event) => void saveArea(event)}>
            <label>
              Name
              <input
                maxLength={120}
                name="name"
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Example: Dallas Core"
                required
                value={formDraft.name}
              />
            </label>
            <label>
              Description
              <input
                maxLength={500}
                name="description"
                onChange={(event) => updateDraft("description", event.target.value)}
                placeholder="Example: Primary service zone covering central Dallas"
                value={formDraft.description}
              />
            </label>
            <label>
              Center latitude
              <input
                max="90"
                min="-90"
                name="centerLatitude"
                onChange={(event) => updateDraft("centerLatitude", event.target.value)}
                placeholder="Example: 32.776700"
                required
                step="0.000001"
                type="number"
                value={formDraft.centerLatitude}
              />
            </label>
            <label>
              Center longitude
              <input
                max="180"
                min="-180"
                name="centerLongitude"
                onChange={(event) => updateDraft("centerLongitude", event.target.value)}
                placeholder="Example: -96.797000"
                required
                step="0.000001"
                type="number"
                value={formDraft.centerLongitude}
              />
            </label>
            <label>
              Radius (km)
              <input
                max="1000"
                min="0.01"
                name="radiusKm"
                onChange={(event) => updateDraft("radiusKm", event.target.value)}
                placeholder="Example: 25"
                required
                step="0.01"
                type="number"
                value={formDraft.radiusKm}
              />
            </label>
            <label>
              Driver coverage
              <select
                name="coverageMode"
                onChange={(event) => updateDraft("coverageMode", event.target.value)}
                value={formDraft.coverageMode}
              >
                <option value="all_drivers">All active tenant drivers</option>
                <option value="selected_drivers">Selected drivers only</option>
              </select>
            </label>
            <button className="primary-button" disabled={busyId !== null} type="submit">
              {editingAreaId ? "Save service area" : "Create service area"}
            </button>
            {editingAreaId ? (
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingAreaId(null);
                  setFormDraft(emptyServiceAreaDraft);
                  setShowForm(false);
                }}
                type="button"
              >
                Cancel edit
              </button>
            ) : null}
          </form>
        ) : null}
      </section>
      {summary.serviceAreas.length === 0 ? (
        <section className="panel">
          <p className="muted">No service areas are configured for this tenant.</p>
        </section>
      ) : (
        summary.serviceAreas.map((area) => {
          const activeAssignments = summary.driverServiceAreaAssignments.filter(
            (assignment) =>
              assignment.service_area_id === area.service_area_id && assignment.ended_at === null,
          );
          const assignedDriverIds = new Set(
            activeAssignments.map(({ driver_profile_id }) => driver_profile_id),
          );
          const availableDrivers = summary.drivers.filter(
            (driver) => !assignedDriverIds.has(driver.driver_profile_id),
          );
          return (
            <section className="panel" key={area.service_area_id}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Service area</p>
                  <h3>{area.name}</h3>
                  <p className="muted">{area.description ?? "No description"}</p>
                </div>
                <span className={`status-pill ${area.status}`}>{area.status}</span>
              </div>
              <dl className="details-grid">
                <div>
                  <dt>Center</dt>
                  <dd>
                    {area.center_latitude}, {area.center_longitude}
                  </dd>
                </div>
                <div>
                  <dt>Radius</dt>
                  <dd>{area.radius_km} km</dd>
                </div>
                <div>
                  <dt>Driver coverage</dt>
                  <dd>
                    {area.coverage_mode === "all_drivers"
                      ? "All active tenant drivers"
                      : `${activeAssignments.length} selected driver${
                          activeAssignments.length === 1 ? "" : "s"
                        }`}
                  </dd>
                </div>
              </dl>
              <div className="row-actions">
                <button
                  className="secondary-button"
                  disabled={!canManageTenant || busyId === area.service_area_id}
                  onClick={() => {
                    setEditingAreaId(area.service_area_id);
                    setFormDraft({
                      name: area.name,
                      description: area.description ?? "",
                      centerLatitude: String(area.center_latitude),
                      centerLongitude: String(area.center_longitude),
                      radiusKm: String(area.radius_km),
                      coverageMode: area.coverage_mode,
                    });
                    setShowForm(true);
                  }}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className={area.status === "active" ? "danger-button" : "secondary-button"}
                  disabled={!canManageTenant || busyId === area.service_area_id}
                  onClick={() =>
                    void updateArea(
                      area.service_area_id,
                      {
                        kind: "service_area_status",
                        status: area.status === "active" ? "inactive" : "active",
                      },
                      `Service area ${area.status === "active" ? "deactivated" : "activated"}.`,
                    )
                  }
                  type="button"
                >
                  {area.status === "active" ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!canManageTenant || busyId === area.service_area_id}
                  onClick={() =>
                    void updateArea(
                      area.service_area_id,
                      {
                        kind: "service_area_coverage",
                        coverageMode:
                          area.coverage_mode === "all_drivers" ? "selected_drivers" : "all_drivers",
                      },
                      area.coverage_mode === "all_drivers"
                        ? "Coverage restricted to selected drivers."
                        : "Coverage opened to all active tenant drivers.",
                    )
                  }
                  type="button"
                >
                  {area.coverage_mode === "all_drivers"
                    ? "Restrict to selected drivers"
                    : "Allow all active drivers"}
                </button>
              </div>
              {area.coverage_mode === "selected_drivers" ? (
                <div className="onboarding-checklist">
                  <strong>Selected drivers</strong>
                  {activeAssignments.map((assignment) => {
                    const driver = summary.drivers.find(
                      ({ driver_profile_id }) => driver_profile_id === assignment.driver_profile_id,
                    );
                    return (
                      <div className="row-actions" key={assignment.assignment_id}>
                        <span>{driver?.display_name ?? assignment.driver_profile_id}</span>
                        <button
                          className="danger-button"
                          disabled={!canManageTenant || busyId === area.service_area_id}
                          onClick={() =>
                            void updateArea(
                              area.service_area_id,
                              {
                                kind: "service_area_unassign",
                                assignmentId: assignment.assignment_id,
                              },
                              "Driver removed from service area.",
                            )
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  {area.status === "active" && availableDrivers.length > 0 ? (
                    <div className="row-actions">
                      <select
                        aria-label={`Driver for ${area.name}`}
                        onChange={(event) =>
                          setSelectedDrivers((current) => ({
                            ...current,
                            [area.service_area_id]: event.target.value,
                          }))
                        }
                        value={selectedDrivers[area.service_area_id] ?? ""}
                      >
                        <option value="">Select driver</option>
                        {availableDrivers.map((driver) => (
                          <option key={driver.driver_profile_id} value={driver.driver_profile_id}>
                            {driver.display_name} · #{driver.driver_number}
                          </option>
                        ))}
                      </select>
                      <button
                        className="primary-button"
                        disabled={
                          !canManageTenant ||
                          busyId === area.service_area_id ||
                          !selectedDrivers[area.service_area_id]
                        }
                        onClick={() =>
                          void updateArea(
                            area.service_area_id,
                            {
                              kind: "service_area_assign",
                              driverProfileId: selectedDrivers[area.service_area_id] ?? "",
                            },
                            "Driver assigned to service area.",
                          )
                        }
                        type="button"
                      >
                        Assign driver
                      </button>
                    </div>
                  ) : null}
                  {activeAssignments.length === 0 ? (
                    <p className="muted">
                      No drivers are selected. This area is currently unavailable to drivers.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="notice">
                  Every active driver in this tenant can operate in this service area. Saved driver
                  selections will be restored if coverage is restricted again.
                </p>
              )}
            </section>
          );
        })
      )}
    </section>
  );
}

function VehiclesPanel({
  canManageTenant,
  onRefresh,
  session,
  summary,
}: {
  canManageTenant: boolean;
  onRefresh: () => void;
  session: SupabaseAuthSession;
  summary: TenantSummary;
}) {
  const enabled = summary.capabilities.some(
    ({ capability_key, enabled }) => capability_key === "vehicle.management" && enabled,
  );
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);
  const [vehiclePhotoUrls, setVehiclePhotoUrls] = useState<Record<string, string>>({});

  const loadVehiclePhotos = useCallback(async () => {
    const results = await Promise.all(
      summary.vehicles.map(async (vehicle) => {
        const response = await fetch(
          `/api/tenant-admin/vehicles?tenantId=${summary.tenant.tenant_id}&vehicleId=${vehicle.vehicle_id}`,
          {
            cache: "no-store",
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        if (!response.ok) return [vehicle.vehicle_id, null] as const;
        const result = (await response.json()) as { url?: string };
        return [vehicle.vehicle_id, result.url ?? null] as const;
      }),
    );
    setVehiclePhotoUrls(
      Object.fromEntries(
        results.filter((result): result is readonly [string, string] => result[1] !== null),
      ),
    );
  }, [session.access_token, summary.tenant.tenant_id, summary.vehicles]);

  useEffect(() => {
    void loadVehiclePhotos();
    const interval = window.setInterval(() => void loadVehiclePhotos(), 15_000);
    return () => window.clearInterval(interval);
  }, [loadVehiclePhotos]);

  useEffect(() => {
    const interval = window.setInterval(onRefresh, 15_000);
    return () => window.clearInterval(interval);
  }, [onRefresh]);

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyId("create");
    setMessage("Creating vehicle and securing its photo…");
    try {
      const response = await fetch("/api/tenant-admin/vehicles", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: new FormData(form),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to create vehicle.");
      form.reset();
      setShowForm(false);
      setMessage("Vehicle created as draft. Activate and assign it before the driver can see it.");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create vehicle.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateVehicle(
    vehicleId: string,
    body: Record<string, string | null>,
    successMessage: string,
  ) {
    setBusyId(vehicleId);
    setMessage(null);
    try {
      const response = await fetch("/api/tenant-admin/vehicles", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenantId: summary.tenant.tenant_id, vehicleId, ...body }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to update vehicle.");
      setMessage(successMessage);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update vehicle.");
    } finally {
      setBusyId(null);
    }
  }

  async function openPhoto(vehicleId: string, title: string) {
    const response = await fetch(
      `/api/tenant-admin/vehicles?tenantId=${summary.tenant.tenant_id}&vehicleId=${vehicleId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    const result = (await response.json()) as { url?: string; message?: string };
    if (!response.ok || !result.url) window.alert(result.message ?? "Unable to open photo.");
    else setPreview({ title, url: result.url });
  }

  async function replacePhoto(vehicleId: string, photo: File) {
    const form = new FormData();
    form.set("tenantId", summary.tenant.tenant_id);
    form.set("vehicleId", vehicleId);
    form.set("photo", photo);
    setBusyId(vehicleId);
    setMessage("Replacing vehicle photo…");
    try {
      const response = await fetch("/api/tenant-admin/vehicles", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to replace vehicle photo.");
      setMessage("Vehicle photo replaced.");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to replace vehicle photo.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateVehicleRequirement(
    evidenceType: string,
    requiredForService: boolean,
    expirationRequired: boolean,
  ) {
    setBusyId(`requirement-${evidenceType}`);
    try {
      const response = await fetch("/api/tenant-admin/vehicle-evidence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "requirement",
          tenantId: summary.tenant.tenant_id,
          evidenceType,
          requiredForService,
          expirationRequired,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to update requirement.");
      setMessage("Vehicle compliance requirement updated.");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update requirement.");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadVehicleEvidence(vehicleId: string, evidenceType: string, file: File) {
    const form = new FormData();
    form.set("tenantId", summary.tenant.tenant_id);
    form.set("vehicleId", vehicleId);
    form.set("evidenceType", evidenceType);
    form.set("file", file);
    setBusyId(`evidence-${vehicleId}-${evidenceType}`);
    try {
      const response = await fetch("/api/tenant-admin/vehicle-evidence", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to upload vehicle evidence.");
      setMessage("Vehicle evidence submitted for review.");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload vehicle evidence.");
    } finally {
      setBusyId(null);
    }
  }

  async function openVehicleEvidence(evidenceId: string, title: string) {
    const response = await fetch(
      `/api/tenant-admin/vehicle-evidence?tenantId=${summary.tenant.tenant_id}&evidenceId=${evidenceId}`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );
    const result = (await response.json()) as { url?: string; message?: string };
    if (!response.ok || !result.url) window.alert(result.message ?? "Unable to open evidence.");
    else setPreview({ title, url: result.url });
  }

  async function reviewVehicleEvidence(
    evidenceId: string,
    evidenceType: string,
    status: "approved" | "rejected",
  ) {
    const notes =
      status === "rejected"
        ? window.prompt("Rejection reason required")?.trim()
        : window.prompt("Optional review note")?.trim();
    if (status === "rejected" && !notes) return;
    const expirationRequired =
      summary.vehicleEvidenceRequirements.find(
        (requirement) => requirement.evidence_type === evidenceType,
      )?.expiration_required ?? false;
    const expiresOn =
      status === "approved"
        ? window
            .prompt(
              expirationRequired
                ? "Required future expiration date (YYYY-MM-DD)"
                : "Optional expiration date (YYYY-MM-DD)",
            )
            ?.trim() || null
        : null;
    if (status === "approved" && expirationRequired && !expiresOn) {
      setMessage("A future expiration date is required.");
      return;
    }
    setBusyId(`review-${evidenceId}`);
    try {
      const response = await fetch("/api/tenant-admin/vehicle-evidence", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "review",
          tenantId: summary.tenant.tenant_id,
          evidenceId,
          status,
          notes: notes || null,
          expiresOn,
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message ?? "Unable to review vehicle evidence.");
      setMessage(`Vehicle evidence ${status}.`);
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review vehicle evidence.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="content-stack">
      <section className="panel">
        <PanelHeader
          title="Vehicles"
          description="Manage the tenant fleet, vehicle photos, lifecycle, and driver assignments."
        />
        {!enabled ? (
          <p className="notice">Vehicle Management is not enabled for this tenant.</p>
        ) : null}
        {message ? <p className="notice">{message}</p> : null}
        <section className="notification-summary">
          <div>
            <strong>Vehicle compliance requirements</strong>
            <span>Control which documents are required before future dispatch eligibility.</span>
          </div>
          <div className="notification-list">
            {summary.vehicleEvidenceRequirements.map((requirement) => (
              <div key={requirement.evidence_type}>
                <strong>{vehicleEvidenceLabel(requirement.evidence_type)}</strong>
                <label>
                  <input
                    checked={requirement.required_for_service}
                    disabled={!canManageTenant || busyId !== null}
                    onChange={(event) =>
                      void updateVehicleRequirement(
                        requirement.evidence_type,
                        event.target.checked,
                        requirement.expiration_required,
                      )
                    }
                    type="checkbox"
                  />
                  Required for service
                </label>
                <label>
                  <input
                    checked={requirement.expiration_required}
                    disabled={!canManageTenant || busyId !== null}
                    onChange={(event) =>
                      void updateVehicleRequirement(
                        requirement.evidence_type,
                        requirement.required_for_service,
                        event.target.checked,
                      )
                    }
                    type="checkbox"
                  />
                  Expiration required
                </label>
              </div>
            ))}
          </div>
        </section>
        <button
          aria-expanded={showForm}
          className="secondary-button"
          disabled={!enabled || !canManageTenant}
          onClick={() => setShowForm((current) => !current)}
          type="button"
        >
          {showForm ? "Close vehicle form" : "Add vehicle"}
        </button>
        {showForm ? (
          <form className="settings-grid" onSubmit={(event) => void createVehicle(event)}>
            <input name="tenantId" type="hidden" value={summary.tenant.tenant_id} />
            {[
              ["vehicleNumber", "Vehicle number", "VH-001"],
              ["make", "Make", "Toyota"],
              ["model", "Model", "Sienna"],
              ["color", "Color", "Silver"],
              ["licensePlate", "License plate", "ABC123"],
              ["vin", "VIN (17 characters)", "1HGBH41JXMN109186"],
            ].map(([name, label, placeholder]) => (
              <label key={name}>
                {label}
                <input disabled={busyId !== null} name={name} placeholder={placeholder} required />
              </label>
            ))}
            <label>
              Model year
              <input
                disabled={busyId !== null}
                max="2100"
                min="1900"
                name="modelYear"
                required
                type="number"
              />
            </label>
            <label>
              Service type
              <select disabled={busyId !== null} defaultValue="standard" name="serviceType">
                <option value="standard">Standard</option>
                <option value="larger">Larger</option>
                <option value="accessible">Accessible</option>
              </select>
            </label>
            <label>
              Vehicle photo
              <input
                accept="image/jpeg,image/png"
                disabled={busyId !== null}
                name="photo"
                type="file"
              />
              <span>Optional for Admin; the assigned driver can upload it later.</span>
            </label>
            <button className="primary-button" disabled={busyId !== null} type="submit">
              {busyId === "create" ? "Creating…" : "Create vehicle"}
            </button>
          </form>
        ) : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Identification</th>
                <th>Status</th>
                <th>Driver assignment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.vehicles.map((vehicle) => {
                const photoUrl = vehiclePhotoUrls[vehicle.vehicle_id];
                const assignment = summary.driverVehicleAssignments.find(
                  ({ vehicle_id, ended_at }) =>
                    vehicle_id === vehicle.vehicle_id && ended_at === null,
                );
                const driver = summary.drivers.find(
                  ({ driver_profile_id }) => driver_profile_id === assignment?.driver_profile_id,
                );
                const pastAssignments = summary.driverVehicleAssignments.filter(
                  ({ vehicle_id, ended_at }) =>
                    vehicle_id === vehicle.vehicle_id && ended_at !== null,
                );
                const latestEvidence = summary.vehicleEvidenceRequirements.map((requirement) => ({
                  requirement,
                  evidence: summary.vehicleEvidence.find(
                    (candidate) =>
                      candidate.vehicle_id === vehicle.vehicle_id &&
                      candidate.evidence_type === requirement.evidence_type,
                  ),
                }));
                const compliant = latestEvidence
                  .filter(({ requirement }) => requirement.required_for_service)
                  .every(
                    ({ requirement, evidence }) =>
                      evidence?.review_status === "approved" &&
                      (!requirement.expiration_required || Boolean(evidence.expires_on)) &&
                      (!evidence.expires_on ||
                        evidence.expires_on > new Date().toISOString().slice(0, 10)),
                  );
                const pendingReviewCount = latestEvidence.filter(
                  ({ evidence }) => evidence?.review_status === "pending",
                ).length;
                return (
                  <tr key={vehicle.vehicle_id}>
                    <td>
                      {photoUrl ? (
                        <Image
                          alt={`${vehicle.make} ${vehicle.model}`}
                          className="vehicle-thumbnail"
                          height={180}
                          src={photoUrl}
                          unoptimized
                          width={320}
                        />
                      ) : (
                        <span>No vehicle photo uploaded</span>
                      )}
                      <strong>
                        {vehicle.model_year} {vehicle.make} {vehicle.model}
                      </strong>
                      <span>
                        {vehicle.color} · #{vehicle.vehicle_number}
                      </span>
                    </td>
                    <td>
                      {vehicle.license_plate}
                      <span>VIN {vehicle.vin}</span>
                    </td>
                    <td>
                      {vehicle.status}
                      <label>
                        Service type
                        <select
                          disabled={busyId !== null || !canManageTenant}
                          value={vehicle.service_type}
                          onChange={(event) => void updateVehicle(vehicle.vehicle_id, { kind: "service_type", serviceType: event.target.value }, "Vehicle service type updated.")}
                        >
                          <option value="standard">Standard</option>
                          <option value="larger">Larger</option>
                          <option value="accessible">Accessible</option>
                        </select>
                      </label>
                      <span>Compliance: {compliant ? "satisfied" : "action required"}</span>
                    </td>
                    <td>
                      {driver ? (
                        <>
                          {driver.display_name}
                          <span>Driver #{driver.driver_number}</span>
                        </>
                      ) : (
                        "Unassigned"
                      )}
                      {pastAssignments.length > 0 ? (
                        <details>
                          <summary>{pastAssignments.length} previous assignment(s)</summary>
                          {pastAssignments.map((past) => {
                            const pastDriver = summary.drivers.find(
                              ({ driver_profile_id }) =>
                                driver_profile_id === past.driver_profile_id,
                            );
                            return (
                              <span key={past.assignment_id}>
                                {pastDriver?.display_name ?? "Unknown driver"} ·{" "}
                                {new Date(past.assigned_at).toLocaleDateString()}–{" "}
                                {past.ended_at
                                  ? new Date(past.ended_at).toLocaleDateString()
                                  : "present"}
                              </span>
                            );
                          })}
                        </details>
                      ) : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="secondary-button"
                          disabled={!vehicle.photo_storage_path}
                          onClick={() =>
                            void openPhoto(vehicle.vehicle_id, `${vehicle.make} ${vehicle.model}`)
                          }
                          type="button"
                        >
                          {vehicle.photo_storage_path ? "View photo" : "No photo yet"}
                        </button>
                        <label className="secondary-button">
                          Replace photo
                          <input
                            accept="image/jpeg,image/png"
                            disabled={!canManageTenant || busyId !== null}
                            hidden
                            onChange={(event) => {
                              const photo = event.target.files?.[0];
                              if (photo) void replacePhoto(vehicle.vehicle_id, photo);
                              event.target.value = "";
                            }}
                            type="file"
                          />
                        </label>
                        {vehicle.status === "draft" ? (
                          <button
                            className="secondary-button"
                            disabled={!canManageTenant || busyId !== null}
                            onClick={() =>
                              void updateVehicle(
                                vehicle.vehicle_id,
                                { kind: "status", status: "active", reason: null },
                                "Vehicle activated.",
                              )
                            }
                            type="button"
                          >
                            Activate
                          </button>
                        ) : null}
                        {vehicle.status === "active" && !assignment ? (
                          <label>
                            Assign driver
                            <select
                              defaultValue=""
                              disabled={!canManageTenant || busyId !== null}
                              onChange={(event) => {
                                if (event.target.value)
                                  void updateVehicle(
                                    vehicle.vehicle_id,
                                    {
                                      kind: "assign",
                                      driverProfileId: event.target.value,
                                      notes: null,
                                    },
                                    "Vehicle assigned.",
                                  );
                              }}
                            >
                              <option value="">Select driver</option>
                              {summary.drivers
                                .filter(
                                  (candidate) =>
                                    !["suspended", "inactive", "archived"].includes(
                                      candidate.status,
                                    ) &&
                                    !summary.driverVehicleAssignments.some(
                                      (existing) =>
                                        existing.driver_profile_id ===
                                          candidate.driver_profile_id && existing.ended_at === null,
                                    ),
                                )
                                .map((candidate) => (
                                  <option
                                    key={candidate.driver_profile_id}
                                    value={candidate.driver_profile_id}
                                  >
                                    {candidate.display_name} (#{candidate.driver_number})
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                        {assignment ? (
                          <button
                            className="secondary-button"
                            disabled={!canManageTenant || busyId !== null}
                            onClick={() =>
                              void updateVehicle(
                                vehicle.vehicle_id,
                                {
                                  kind: "unassign",
                                  assignmentId: assignment.assignment_id,
                                },
                                "Vehicle unassigned; history preserved.",
                              )
                            }
                            type="button"
                          >
                            Unassign
                          </button>
                        ) : null}
                        {vehicle.status === "active" ? (
                          <button
                            className="danger-button"
                            disabled={!canManageTenant || busyId !== null || Boolean(assignment)}
                            onClick={() => {
                              const reason = window.prompt("Suspension reason required")?.trim();
                              if (reason)
                                void updateVehicle(
                                  vehicle.vehicle_id,
                                  { kind: "status", status: "suspended", reason },
                                  "Vehicle suspended.",
                                );
                            }}
                            type="button"
                          >
                            Suspend
                          </button>
                        ) : null}
                        {vehicle.status === "suspended" ? (
                          <button
                            className="secondary-button"
                            disabled={!canManageTenant || busyId !== null}
                            onClick={() =>
                              void updateVehicle(
                                vehicle.vehicle_id,
                                { kind: "status", status: "active", reason: null },
                                "Vehicle reactivated.",
                              )
                            }
                            type="button"
                          >
                            Reactivate
                          </button>
                        ) : null}
                        {!assignment && vehicle.status !== "retired" ? (
                          <button
                            className="danger-button"
                            disabled={!canManageTenant || busyId !== null}
                            onClick={() => {
                              const reason = window.prompt("Retirement reason required")?.trim();
                              if (reason)
                                void updateVehicle(
                                  vehicle.vehicle_id,
                                  { kind: "status", status: "retired", reason },
                                  "Vehicle retired.",
                                );
                            }}
                            type="button"
                          >
                            Retire
                          </button>
                        ) : null}
                        <details open={pendingReviewCount > 0 ? true : undefined}>
                          <summary>
                            Compliance documents
                            {pendingReviewCount > 0
                              ? ` · ${pendingReviewCount} awaiting review`
                              : ""}
                          </summary>
                          {latestEvidence.map(({ requirement, evidence }) => {
                            const expired =
                              evidence?.expires_on &&
                              evidence.expires_on <= new Date().toISOString().slice(0, 10);
                            const displayStatus = expired
                              ? "expired"
                              : (evidence?.review_status ?? "missing");
                            return (
                              <div className="onboarding-checklist" key={requirement.evidence_type}>
                                <strong>{vehicleEvidenceLabel(requirement.evidence_type)}</strong>
                                <span>
                                  {displayStatus}
                                  {requirement.required_for_service ? " · required" : " · optional"}
                                  {requirement.expiration_required ? " · expiration required" : ""}
                                  {evidence?.expires_on ? ` · expires ${evidence.expires_on}` : ""}
                                </span>
                                {evidence ? (
                                  <>
                                    <span>
                                      {evidence.original_file_name} · submitted{" "}
                                      {new Date(evidence.submitted_at).toLocaleDateString()}
                                    </span>
                                    <button
                                      className="secondary-button"
                                      onClick={() =>
                                        void openVehicleEvidence(
                                          evidence.evidence_id,
                                          vehicleEvidenceLabel(evidence.evidence_type),
                                        )
                                      }
                                      type="button"
                                    >
                                      Open
                                    </button>
                                    <button
                                      className="secondary-button"
                                      disabled={
                                        !canManageTenant ||
                                        busyId !== null ||
                                        displayStatus === "approved"
                                      }
                                      onClick={() =>
                                        void reviewVehicleEvidence(
                                          evidence.evidence_id,
                                          evidence.evidence_type,
                                          "approved",
                                        )
                                      }
                                      type="button"
                                    >
                                      {displayStatus === "approved" ? "Approved" : "Approve"}
                                    </button>
                                    <button
                                      className="danger-button"
                                      disabled={!canManageTenant || busyId !== null}
                                      onClick={() =>
                                        void reviewVehicleEvidence(
                                          evidence.evidence_id,
                                          evidence.evidence_type,
                                          "rejected",
                                        )
                                      }
                                      type="button"
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                                <label className="secondary-button">
                                  {evidence ? "Replace document" : "Upload document"}
                                  <input
                                    accept="image/jpeg,image/png,application/pdf"
                                    disabled={!canManageTenant || busyId !== null}
                                    hidden
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file)
                                        void uploadVehicleEvidence(
                                          vehicle.vehicle_id,
                                          requirement.evidence_type,
                                          file,
                                        );
                                      event.target.value = "";
                                    }}
                                    type="file"
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {summary.vehicles.length === 0 ? (
          <EmptyState message="No vehicles have been created." />
        ) : null}
      </section>
      {preview ? (
        <EvidencePreview onClose={() => setPreview(null)} title={preview.title} url={preview.url} />
      ) : null}
    </section>
  );
}

function evidenceRequiresExpiration(summary: TenantSummary, evidenceId: string) {
  const evidence = summary.driverEvidence.find(({ evidence_id }) => evidence_id === evidenceId);
  return summary.driverEvidenceRequirements.some(
    ({ evidence_type, expiration_required }) =>
      evidence_type === evidence?.evidence_type && expiration_required,
  );
}

function tomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function driverAvailabilityStatus(summary: TenantSummary, driverProfileId: string) {
  const availability = summary.driverAvailability.find(
    (item) => item.driver_profile_id === driverProfileId,
  );
  const requested = availability?.requested_status ?? "offline";
  if (requested !== "online") return { status: "Offline", note: null };

  const driver = summary.drivers.find((item) => item.driver_profile_id === driverProfileId);
  const selectedArea = summary.serviceAreas.find(
    (area) => area.service_area_id === availability?.selected_service_area_id,
  );
  const selectedAreaAssignment = summary.driverServiceAreaAssignments.some(
    (assignment) =>
      assignment.driver_profile_id === driverProfileId &&
      assignment.service_area_id === selectedArea?.service_area_id &&
      assignment.ended_at === null,
  );
  const serviceAreaAvailable =
    selectedArea?.status === "active" &&
    (selectedArea.coverage_mode === "all_drivers" || selectedAreaAssignment);
  const checklist = summary.driverOnboarding.find(
    (item) => item.driver_profile_id === driverProfileId,
  );
  const assignment = summary.driverVehicleAssignments.find(
    (item) => item.driver_profile_id === driverProfileId && item.ended_at === null,
  );
  const vehicle = summary.vehicles.find((item) => item.vehicle_id === assignment?.vehicle_id);
  const today = new Date().toISOString().slice(0, 10);
  const vehicleCompliant =
    vehicle !== undefined &&
    !summary.vehicleEvidenceRequirements.some((requirement) => {
      if (!requirement.required_for_service) return false;
      const latest = summary.vehicleEvidence
        .filter(
          (evidence) =>
            evidence.vehicle_id === vehicle.vehicle_id &&
            evidence.evidence_type === requirement.evidence_type,
        )
        .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))[0];
      return (
        !latest ||
        latest.review_status !== "approved" ||
        (requirement.expiration_required && !latest.expires_on) ||
        (latest.expires_on !== null && latest.expires_on <= today)
      );
    });
  const eligible =
    driver?.status === "active" &&
    checklist?.documents_reviewed === true &&
    vehicle?.status === "active" &&
    vehicleCompliant &&
    serviceAreaAvailable;
  return eligible
    ? { status: "Online", note: selectedArea?.name ?? "Ready for service" }
    : { status: "Offline", note: "Eligibility changed" };
}

function locationFreshness(recordedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(recordedAt)) / 1000));
  if (seconds < 60) return `updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 5 ? `updated ${minutes}m ago` : `stale · updated ${minutes}m ago`;
}

function vehicleEvidenceLabel(evidenceType: string) {
  const labels: Record<string, string> = {
    registration: "Vehicle registration",
    insurance: "Vehicle insurance",
    inspection: "Safety inspection",
    operating_permit: "Operating permit",
  };
  return labels[evidenceType] ?? evidenceType.replaceAll("_", " ");
}

function EvidencePreview({
  onClose,
  title,
  url,
}: {
  onClose: () => void;
  title: string;
  url: string;
}) {
  const isPdf = new URL(url).pathname.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-label={`${title} preview`}
      aria-modal="true"
      className="evidence-preview-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <section className="evidence-preview">
        <header>
          <div>
            <p className="eyebrow">Private evidence</p>
            <h3>{title}</h3>
          </div>
          <button className="secondary-button" onClick={onClose} type="button">
            Close
          </button>
        </header>
        {isPdf ? (
          <iframe src={url} title={`${title} document`} />
        ) : (
          // The URL is short-lived and is never placed in the browser address bar.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={title} src={url} />
        )}
        <footer>
          <a className="secondary-button" download href={url}>
            Download
          </a>
          <span>Private link expires shortly.</span>
        </footer>
      </section>
    </div>
  );
}

type DriverForm = {
  driverNumber: string;
  displayName: string;
  email: string;
  phone: string;
  onboardingDate: string;
};

function DriverTextInput({
  disabled,
  label,
  name,
  placeholder,
  setForm,
  type = "text",
  value,
}: {
  disabled: boolean;
  label: string;
  name: keyof DriverForm;
  placeholder?: string;
  setForm: (updater: (form: DriverForm) => DriverForm) => void;
  type?: string;
  value: string;
}) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        inputMode={name === "driverNumber" ? "numeric" : undefined}
        maxLength={name === "driverNumber" ? 32 : undefined}
        name={name}
        placeholder={placeholder}
        onChange={(event) =>
          setForm((form) => ({
            ...form,
            [name]:
              name === "driverNumber" ? event.target.value.replace(/\D/g, "") : event.target.value,
          }))
        }
        type={type}
        value={value}
      />
    </label>
  );
}

function RolesPanel({ summary }: { summary: TenantSummary }) {
  return (
    <section className="panel">
      <PanelHeader title="Tenant roles" description="Foundation tenant role assignments only." />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Membership</th>
              <th>Role</th>
              <th>Status</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {summary.roleAssignments.map((assignment) => (
              <tr key={assignment.assignment_id}>
                <td>{assignment.membership_id}</td>
                <td>{assignment.role_key}</td>
                <td>{assignment.status}</td>
                <td>{formatDate(assignment.assigned_at ?? assignment.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CapabilitiesPanel({ summary }: { summary: TenantSummary }) {
  return (
    <section className="panel">
      <PanelHeader title="Capabilities" description="Tenant module and app capability state." />
      <div className="capability-grid">
        {summary.capabilities.map((capability) => (
          <article className="capability" key={capability.capability_key}>
            <strong>{capability.capability_key}</strong>
            <span className={capability.enabled ? "status-pill active" : "status-pill disabled"}>
              {capability.enabled ? "Enabled" : "Disabled"}
            </span>
          </article>
        ))}
      </div>
      <p className="notice">Capability management is platform-owned in V1.</p>
    </section>
  );
}

function AuditPanel({ compact = false, summary }: { compact?: boolean; summary: TenantSummary }) {
  return (
    <section className="panel">
      <PanelHeader
        title="Recent audit activity"
        description={compact ? undefined : "Authorized tenant audit events."}
      />
      {summary.auditEvents.length === 0 ? (
        <EmptyState message="No visible audit activity." />
      ) : (
        <div className="audit-list">
          {summary.auditEvents.slice(0, compact ? 5 : undefined).map((event) => (
            <article className="audit-event" key={event.audit_event_id}>
              <div>
                <strong>{event.event_name}</strong>
                <span>
                  {event.resource_type}:{event.resource_id}
                </span>
              </div>
              <p>{event.reason}</p>
              <time>{formatDate(event.occurred_at)}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoPanel({
  empty,
  rows,
  title,
}: {
  empty?: string;
  rows: readonly (readonly [string, string])[];
  title: string;
}) {
  return (
    <section className="panel">
      <PanelHeader title={title} />
      {rows.length === 0 ? <EmptyState message={empty ?? "No data available."} /> : null}
      {rows.length > 0 ? (
        <dl className="definition-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

type LedgerSummary = {
  settings: { operatingCurrency: string; fractionDigits: number } | null;
  accounts: Array<{ accountId: string; accountCode: string; accountName: string; accountType: string; normalBalance: "debit" | "credit"; status: string; balanceMinor: number }>;
  transactions: Array<{ transactionId: string; externalKey: string; description: string; effectiveAt: string; bookingId: string | null; createdAt: string; reversalTransactionId: string | null; reversesTransactionId: string | null; reversalReason: string | null; entries: Array<{ accountCode: string; side: "debit" | "credit"; amountMinor: number; memo: string | null }> }>;
};

function PricingPanel({ canManageTenant, onRefresh, summary }: { canManageTenant: boolean; onRefresh: () => void; summary: TenantSummary }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = summary.pricingSettings;
  const currency = settings?.currency_code ?? "USD";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const value = (name: string) => { const entry = form.get(name); return typeof entry === "string" ? entry : ""; };
    setBusy(true); setMessage(null);
    try {
      const result = await supabase.rpc("set_tenant_pricing_settings", {
        target_tenant_id: summary.tenant.tenant_id,
        pricing_enabled_value: form.get("pricingEnabled") === "on",
        base_fare_minor_value: parseMoneyToMinorUnits(value("baseFare"), 2, true),
        per_mile_minor_value: parseMoneyToMinorUnits(value("perMile"), 2, true),
        per_minute_minor_value: parseMoneyToMinorUnits(value("perMinute"), 2, true),
        minimum_fare_minor_value: parseMoneyToMinorUnits(value("minimumFare"), 2, true),
      });
      if (result.error) throw result.error;
      setMessage("Trip pricing settings saved."); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pricing settings could not be saved."); }
    setBusy(false);
  }
  async function saveEarnings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const raw = form.get("driverSharePercent"); const percent = typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) { setMessage("Driver share must be between 0 and 100 percent."); return; }
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("set_tenant_driver_earnings_settings", {
      target_tenant_id: summary.tenant.tenant_id,
      driver_share_basis_points_value: Math.round(percent * 100),
    });
    setMessage(result.error ? result.error.message : "Driver earnings share saved for future completed trips.");
    if (!result.error) onRefresh(); setBusy(false);
  }
  const display = (minor: number | undefined, fallback: string) => minor == null ? fallback : (minor / 100).toFixed(2);
  return <section className="panel-stack"><PanelHeader title="Trip pricing" description="Configure the route-based fare Riders review before booking. Card collection is not included yet." />
    {message ? <p className="feedback-message">{message}</p> : null}
    <form className="form-grid" onSubmit={(event) => void save(event)}>
      <label><span>Pricing enabled</span><input defaultChecked={settings?.pricing_enabled ?? false} name="pricingEnabled" type="checkbox" /><span className="muted">Require a valid fare quote before Rider booking</span></label>
      <label>Base fare ({currency})<input defaultValue={display(settings?.base_fare_minor, "5.00")} name="baseFare" inputMode="decimal" required /></label>
      <label>Per mile ({currency})<input defaultValue={display(settings?.per_mile_minor, "1.50")} name="perMile" inputMode="decimal" required /></label>
      <label>Per minute ({currency})<input defaultValue={display(settings?.per_minute_minor, "0.25")} name="perMinute" inputMode="decimal" required /></label>
      <label>Minimum fare ({currency})<input defaultValue={display(settings?.minimum_fare_minor, "10.00")} name="minimumFare" inputMode="decimal" required /></label>
      <p className="empty-state">Fare = base + road miles × per-mile rate + route minutes × per-minute rate, subject to the minimum fare. The quoted fare is locked for 15 minutes.</p>
      <button disabled={!canManageTenant || busy} type="submit">Save pricing settings</button>
    </form>
    <form className="form-grid" onSubmit={(event) => void saveEarnings(event)}>
      <h4>Driver earnings</h4>
      <label>Driver share of Rider fare (%)<input defaultValue={(summary.driverEarningsSettings?.driver_share_basis_points ?? 8000) / 100} min="0" max="100" step="0.01" name="driverSharePercent" type="number" required /></label>
      <p className="empty-state">The share is locked when a priced trip completes. For example, 80% of a $50 fare creates $40 Driver payable and leaves $10 platform fee. It does not pay money to a bank yet.</p>
      <button disabled={!canManageTenant || busy} type="submit">Save Driver share</button>
    </form>
  </section>;
}

function LedgerPanel({ canManageTenant, onRefresh, summary }: { canManageTenant: boolean; onRefresh: () => void; summary: TenantSummary }) {
  const supabase = useMemo(() => createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<"overview" | "drivers" | "payments" | "wallets" | "disputes" | "payouts" | "journal" | "manual">("overview");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [journalType, setJournalType] = useState("all");
  const [ledgerPage, setLedgerPage] = useState(1);
  const formValue = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const loadLedger = useCallback(async () => {
    const result = await supabase.rpc("tenant_ledger_summary", { target_tenant_id: summary.tenant.tenant_id });
    if (result.error) { setMessage(result.error.message); return; }
    setLedger(result.data as unknown as LedgerSummary); setMessage(null);
  }, [summary.tenant.tenant_id, supabase]);
  useEffect(() => { void loadLedger(); }, [loadLedger]);

  async function initialize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const result = await supabase.rpc("initialize_tenant_ledger", {
      target_tenant_id: summary.tenant.tenant_id,
      target_currency_code: formValue(form, "currency") || "USD",
    });
    setMessage(result.error ? result.error.message : "Ledger initialized. Operating currency is now permanent.");
    if (!result.error) await loadLedger(); setBusy(false);
  }

  async function postJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ledger?.settings) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement); setBusy(true); setMessage(null);
    try {
      const amountMinor = parseMoneyToMinorUnits(formValue(form, "amount"), ledger.settings.fractionDigits);
      const debit = formValue(form, "debitAccount"); const credit = formValue(form, "creditAccount");
      if (!debit || !credit || debit === credit) throw new Error("Choose two different ledger accounts.");
      const result = await supabase.rpc("post_tenant_ledger_transaction", {
        target_tenant_id: summary.tenant.tenant_id,
        external_key_value: `manual:${crypto.randomUUID()}`,
        description_value: formValue(form, "description"), effective_at_value: new Date().toISOString(),
        entries_value: [{ accountCode: debit, side: "debit", amountMinor }, { accountCode: credit, side: "credit", amountMinor }],
      });
      if (result.error) throw result.error;
      setMessage("Balanced journal transaction posted."); formElement.reset(); await loadLedger();
    } catch (value) { setMessage(value instanceof Error ? value.message : "Transaction could not be posted."); }
    setBusy(false);
  }

  async function issueWalletCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ledger?.settings) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setMessage(null);
    try {
      const riderProfileId = formValue(form, "riderProfileId");
      const amountMinor = parseMoneyToMinorUnits(formValue(form, "amount"), ledger.settings.fractionDigits);
      const reason = formValue(form, "reason").trim();
      if (!riderProfileId) throw new Error("Choose a Rider.");
      if (reason.length < 5) throw new Error("Provide a credit reason of at least five characters.");
      const result = await supabase.rpc("issue_rider_wallet_credit", {
        target_tenant_id: summary.tenant.tenant_id, target_rider_profile_id: riderProfileId,
        amount_minor_value: amountMinor, reason_value: reason, request_key_value: crypto.randomUUID(),
      });
      if (result.error) throw result.error;
      setMessage("Rider wallet credit issued and posted to the ledger."); formElement.reset(); await loadLedger(); onRefresh();
    } catch (value) { setMessage(value instanceof Error ? value.message : "Wallet credit could not be issued."); }
    setBusy(false);
  }

  async function reverseManualJournal(transactionId: string) {
    const reason = window.prompt("Explain why this manual journal must be reversed (at least 5 characters).")?.trim();
    if (!reason) return;
    if (!window.confirm("Post an immutable reversing transaction? The original journal will remain visible.")) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("reverse_tenant_manual_ledger_transaction", {
      target_tenant_id: summary.tenant.tenant_id, target_transaction_id: transactionId, reason_value: reason,
    });
    setMessage(result.error ? result.error.message : "Manual journal reversed with a linked balanced transaction.");
    if (!result.error) await loadLedger();
    setBusy(false);
  }

  async function refundCompletedTrip(bookingId: string) {
    const reason = window.prompt("Why is this completed trip being fully refunded? (at least 5 characters)")?.trim();
    if (!reason) return;
    if (!window.confirm("Fully refund the Rider and reverse the Driver earning? Any eligible Stripe transfer will be recovered first. This creates permanent accounting entries.")) return;
    setBusy(true); setMessage(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token;
      if (!accessToken) throw new Error("Authentication is required.");
      const response = await fetch("/api/tenant-admin/refunds/completed", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, reason }),
      });
      const result = await response.json() as { refunded?: boolean; message?: string };
      if (!response.ok || !result.refunded) throw new Error(result.message ?? "Completed-trip refund failed.");
      setMessage("Completed trip refunded and Driver earnings recovered with balanced entries.");
      await loadLedger(); onRefresh();
    } catch (value) { setMessage(value instanceof Error ? value.message : "Completed-trip refund failed."); }
    setBusy(false);
  }

  if (!ledger) return <section className="panel-stack"><PanelHeader title="Ledger" description="Loading tenant financial foundation…" />{message ? <p className="feedback-message">{message}</p> : null}</section>;
  if (!ledger.settings) return <section className="panel-stack"><PanelHeader title="Initialize ledger" description="Choose the tenant operating currency. It cannot change after the first posting." />
    <form className="form-grid" onSubmit={(event) => void initialize(event)}><label>Operating currency<select name="currency" defaultValue="USD"><option value="USD">USD</option><option value="CAD">CAD</option><option value="MXN">MXN</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AUD">AUD</option></select></label><button disabled={!canManageTenant || busy} type="submit">Initialize ledger</button></form>{message ? <p className="feedback-message">{message}</p> : null}</section>;
  const { operatingCurrency, fractionDigits } = ledger.settings;
  const pageSize = 10;
  const search = ledgerSearch.trim().toLowerCase();
  const driverName = (driverProfileId: string) => summary.drivers.find((driver) => driver.driver_profile_id === driverProfileId)?.display_name ?? "Driver";
  const filteredPayments = summary.riderPaymentAttempts.filter((payment) => !search || [payment.status, payment.quote_id, payment.booking_id, payment.provider_payment_intent_id].some((value) => value?.toLowerCase().includes(search)));
  const filteredDisputes = summary.riderPaymentDisputes.filter((dispute) => !search || [dispute.status, dispute.reason, dispute.booking_id, dispute.provider_dispute_id].some((value) => value?.toLowerCase().includes(search)));
  const filteredPayoutAccounts = summary.driverPayoutAccounts.filter((payout) => !search || [driverName(payout.driver_profile_id), payout.onboarding_status, payout.transfers_capability_status].some((value) => value?.toLowerCase().includes(search)));
  const filteredBankPayouts = summary.driverBankPayouts.filter((payout) => !search || [driverName(payout.driver_profile_id), payout.status, payout.method, payout.provider_payout_id].some((value) => value?.toLowerCase().includes(search)));
  const filteredTransactions = ledger.transactions.filter((transaction) => {
    const kind = transaction.externalKey.split(":", 1)[0];
    return (journalType === "all" || kind === journalType) && (!search || [transaction.description, transaction.externalKey, transaction.bookingId, ...transaction.entries.map((entry) => entry.accountCode)].some((value) => value?.toLowerCase().includes(search)));
  });
  const page = <T,>(items: T[]) => items.slice((ledgerPage - 1) * pageSize, ledgerPage * pageSize);
  const activeCount = workspace === "payments" ? filteredPayments.length : workspace === "wallets" ? summary.riderWalletEntries.length : workspace === "disputes" ? filteredDisputes.length : workspace === "drivers" ? filteredPayoutAccounts.length : workspace === "payouts" ? filteredBankPayouts.length : workspace === "journal" ? filteredTransactions.length : 0;
  const pageCount = Math.max(1, Math.ceil(activeCount / pageSize));
  const changeWorkspace = (next: typeof workspace) => { setWorkspace(next); setLedgerPage(1); setLedgerSearch(""); };
  return <section className="panel-stack"><PanelHeader title="Ledger" description={`${operatingCurrency} · immutable balanced postings`} />
    {message ? <p className="feedback-message">{message}</p> : null}
    {missingFoundationAccountCodes(ledger.accounts).length > 0 ? <p className="feedback-message">Ledger setup is incomplete: missing required accounts {missingFoundationAccountCodes(ledger.accounts).join(", ")}.</p> : null}
    <nav aria-label="Ledger workspace" className="ledger-workspace-nav">{([['overview','Overview'],['drivers','Driver balances'],['payments','Rider payments'],['wallets','Rider wallets'],['disputes','Disputes'],['payouts','Bank payouts'],['journal','Journal'],['manual','Manual journal']] as const).map(([key, label]) => <button className={workspace === key ? "primary-button" : "secondary-button"} key={key} onClick={() => changeWorkspace(key)} type="button">{label}</button>)}</nav>
    {workspace !== "overview" && workspace !== "manual" ? <div className="toolbar-row"><label className="ledger-search">Search<input onChange={(event) => { setLedgerSearch(event.target.value); setLedgerPage(1); }} placeholder="Driver, status, booking, or reference" value={ledgerSearch} /></label>{workspace === "journal" ? <label>Transaction type<select onChange={(event) => { setJournalType(event.target.value); setLedgerPage(1); }} value={journalType}><option value="all">All types</option><option value="payment_collection">Payment collection</option><option value="payment_settlement">Payment settlement</option><option value="trip_fare">Trip fare</option><option value="driver_earnings">Driver earnings</option><option value="driver_transfer">Driver transfer</option><option value="manual">Manual</option><option value="reversal">Reversal</option></select></label> : null}</div> : null}
    {workspace === "overview" ? <><div className="card-grid">{ledger.accounts.filter((account) => !account.accountCode.startsWith("driver_payable_")).map((account) => <article className="data-card" key={account.accountId}><strong>{account.accountName}</strong><p>{account.accountCode} · {account.accountType}</p><strong>{formatMinorUnits(account.balanceMinor * (account.normalBalance === "credit" ? -1 : 1), operatingCurrency, fractionDigits)}</strong></article>)}</div><div className="card-grid"><article className="data-card"><strong>{summary.driverPayoutAccounts.length}</strong><p>Driver payout accounts</p></article><article className="data-card"><strong>{summary.riderPaymentAttempts.length}</strong><p>Rider payment attempts</p></article><article className="data-card"><strong>{summary.driverBankPayouts.length}</strong><p>Bank payouts reported</p></article><article className="data-card"><strong>{ledger.transactions.length}</strong><p>Recent journal entries</p></article></div></> : null}
    {workspace === "drivers" ? <div className="table-wrap"><table><thead><tr><th>Driver</th><th>Pending</th><th>Collected</th><th>Transferred to Stripe</th><th>Amount owed</th><th>Onboarding</th><th>Transfer capability</th></tr></thead><tbody>{page(filteredPayoutAccounts).map((payout) => { const payable = ledger.accounts.find((account) => account.accountCode === `driver_payable_${payout.driver_profile_id.replaceAll("-", "")}`); const trips = summary.dispatchBookings.filter((booking) => booking.current_driver_profile_id === payout.driver_profile_id && booking.status === "completed" && booking.driver_earnings_minor != null && !booking.driver_earnings_reversed_at); const stripeFundedBookingIds = new Set(trips.filter((booking) => summary.riderPaymentAttempts.some((payment) => payment.status === "paid" && payment.booking_id === booking.booking_id && payment.amount_minor >= (booking.driver_earnings_minor ?? 0))).map((booking) => booking.booking_id)); const succeededTransfers = summary.driverEarningTransfers.filter((transfer) => transfer.driver_profile_id === payout.driver_profile_id && transfer.status === "succeeded"); const transferredBookingIds = new Set(succeededTransfers.map((transfer) => transfer.booking_id)); const pending = trips.filter((booking) => !stripeFundedBookingIds.has(booking.booking_id)).reduce((total, booking) => total + (booking.driver_earnings_minor ?? 0), 0); const collected = trips.filter((booking) => stripeFundedBookingIds.has(booking.booking_id) && !transferredBookingIds.has(booking.booking_id)).reduce((total, booking) => total + (booking.driver_earnings_minor ?? 0), 0); const transferred = succeededTransfers.filter((transfer) => trips.some((booking) => booking.booking_id === transfer.booking_id)).reduce((total, transfer) => total + transfer.amount_minor, 0); return <tr key={payout.driver_payout_account_id}><td><strong>{driverName(payout.driver_profile_id)}</strong></td><td>{formatMinorUnits(pending, operatingCurrency, fractionDigits)}</td><td>{formatMinorUnits(collected, operatingCurrency, fractionDigits)}</td><td>{formatMinorUnits(transferred, operatingCurrency, fractionDigits)}</td><td><strong>{payable ? formatMinorUnits(payable.balanceMinor * -1, operatingCurrency, fractionDigits) : "—"}</strong></td><td>{payout.onboarding_status.replaceAll("_", " ")}</td><td>{payout.transfers_capability_status ?? "not requested"}</td></tr>; })}</tbody></table>{filteredPayoutAccounts.length === 0 ? <EmptyState message="No matching Driver payout accounts." /> : null}</div> : null}
    {workspace === "payments" ? <div className="table-wrap"><table><thead><tr><th>Amount</th><th>Status</th><th>Paid/created</th><th>Booking</th><th>Refund</th><th>Recovery</th><th>Processor reference</th></tr></thead><tbody>{page(filteredPayments).map((payment) => { const refund = summary.riderPaymentRefunds.find((item) => item.payment_attempt_id === payment.payment_attempt_id); const booking = summary.dispatchBookings.find((item) => item.booking_id === payment.booking_id); const canRefundCompleted = payment.status === "paid" && booking?.status === "completed" && (!refund || (refund.refund_scope === "completed_trip" && refund.status === "failed")); return <tr key={payment.payment_attempt_id}><td><strong>{formatMinorUnits(payment.amount_minor, payment.currency_code, fractionDigits)}</strong></td><td>{payment.status}</td><td>{formatDate(payment.paid_at ?? payment.created_at)}</td><td>{payment.booking_id ? payment.booking_id.slice(0, 8) : "Not finalized"}</td><td>{refund ? `${formatMinorUnits(refund.amount_minor, refund.currency_code, fractionDigits)} · ${refund.status}` : "—"}</td><td>{canRefundCompleted && payment.booking_id ? <button className="secondary-button" disabled={!canManageTenant || busy} onClick={() => void refundCompletedTrip(payment.booking_id!)} type="button">{refund ? "Retry completed refund" : "Refund completed trip"}</button> : refund?.refund_scope === "completed_trip" ? "Completed-trip recovery" : "—"}</td><td><details><summary>View reference</summary><small>{payment.provider_payment_intent_id ?? payment.provider_checkout_session_id}</small></details></td></tr>; })}</tbody></table>{filteredPayments.length === 0 ? <EmptyState message="No matching Rider payments." /> : null}</div> : null}
    {workspace === "wallets" ? <div className="panel-stack"><form className="form-grid" onSubmit={(event) => void issueWalletCredit(event)}><h4>Issue Rider trip credit</h4><p className="empty-state">Credits are permanent, audited financial adjustments. They have no cash value and are automatically applied to future Rider fares.</p><label>Rider<select name="riderProfileId" required defaultValue=""><option value="" disabled>Select a Rider</option>{summary.riderProfiles.map((rider) => <option key={rider.rider_profile_id} value={rider.rider_profile_id}>{rider.display_name} · {rider.email}</option>)}</select></label><label>Amount ({operatingCurrency})<input name="amount" required inputMode="decimal" placeholder="10.00" /></label><label>Reason<input name="reason" required minLength={5} maxLength={500} placeholder="Service recovery credit" /></label><button disabled={!canManageTenant || busy || summary.riderProfiles.length === 0} type="submit">Issue immutable wallet credit</button></form><div className="table-wrap"><table><thead><tr><th>Rider</th><th>Activity</th><th>Amount</th><th>Description</th><th>Date</th><th>Trip</th></tr></thead><tbody>{page(summary.riderWalletEntries).map((entry) => { const rider = summary.riderProfiles.find((item) => item.rider_profile_id === entry.rider_profile_id); return <tr key={entry.rider_wallet_entry_id}><td>{rider?.display_name ?? entry.rider_profile_id.slice(0, 8)}</td><td>{entry.entry_type.replaceAll("_", " ")}</td><td><strong>{entry.direction === "credit" ? "+" : "−"}{formatMinorUnits(entry.amount_minor, entry.currency_code, fractionDigits)}</strong></td><td>{entry.description}</td><td>{formatDate(entry.created_at)}</td><td>{entry.booking_id?.slice(0, 8) ?? "—"}</td></tr>; })}</tbody></table>{summary.riderWalletEntries.length === 0 ? <EmptyState message="No Rider wallet activity." /> : null}</div></div> : null}
    {workspace === "disputes" ? <div className="table-wrap"><table><thead><tr><th>Principal</th><th>Fee</th><th>Status</th><th>Reason</th><th>Booking</th><th>Funds</th><th>Evidence due</th><th>Processor reference</th></tr></thead><tbody>{page(filteredDisputes).map((dispute) => { const transfer = summary.driverEarningTransfers.find((item) => item.booking_id === dispute.booking_id && item.status === "succeeded"); return <tr key={dispute.rider_payment_dispute_id}><td><strong>{formatMinorUnits(dispute.amount_minor, dispute.currency_code, fractionDigits)}</strong></td><td>{formatMinorUnits(dispute.fee_minor, dispute.currency_code, fractionDigits)}</td><td>{dispute.status.replaceAll("_", " ")}</td><td>{dispute.reason.replaceAll("_", " ")}</td><td>{dispute.booking_id?.slice(0, 8) ?? "Not finalized"}</td><td>{dispute.funds_reinstated_at ? `${formatMinorUnits(dispute.funds_reinstated_minor, dispute.currency_code, fractionDigits)} reinstated ${formatDate(dispute.funds_reinstated_at)}` : dispute.funds_withdrawn_at ? `${formatMinorUnits(dispute.funds_withdrawn_minor, dispute.currency_code, fractionDigits)} withdrawn ${formatDate(dispute.funds_withdrawn_at)}${transfer ? " · Driver transfer requires reviewed recovery" : ""}` : "Not withdrawn"}</td><td>{dispute.evidence_due_at ? formatDate(dispute.evidence_due_at) : "—"}</td><td><details><summary>View reference</summary><small>{dispute.provider_dispute_id}</small></details></td></tr>; })}</tbody></table>{filteredDisputes.length === 0 ? <EmptyState message="No matching Stripe disputes." /> : null}</div> : null}
    {workspace === "payouts" ? <div className="table-wrap"><table><thead><tr><th>Driver</th><th>Amount</th><th>Status</th><th>Method</th><th>Reconciliation</th><th>Created</th><th>Arrival/failure</th></tr></thead><tbody>{page(filteredBankPayouts).map((payout) => { const allocationCount = summary.driverPayoutTransferAllocations.filter((allocation) => allocation.driver_bank_payout_id === payout.driver_bank_payout_id).length; return <tr key={payout.driver_bank_payout_id}><td>{driverName(payout.driver_profile_id)}</td><td><strong>{formatMinorUnits(payout.amount_minor, payout.currency_code, fractionDigits)}</strong></td><td>{payout.status.replaceAll("_", " ")}</td><td>{payout.automatic ? "Automatic" : "Manual"} · {payout.method ?? "standard"}</td><td><strong>{payout.reconciliation_status.replaceAll("_", " ")}</strong><br />{formatMinorUnits(payout.matched_amount_minor, payout.currency_code, fractionDigits)} matched · {allocationCount} transfer(s){payout.unmatched_amount_minor ? <><br />{formatMinorUnits(payout.unmatched_amount_minor, payout.currency_code, fractionDigits)} unmatched</> : null}</td><td>{formatDate(payout.provider_created_at)}</td><td>{payout.reconciliation_error ?? payout.failure_message ?? payout.failure_code ?? (payout.expected_arrival_at ? formatDate(payout.expected_arrival_at) : "—")}</td></tr>; })}</tbody></table>{filteredBankPayouts.length === 0 ? <EmptyState message="No matching connected-account bank payouts." /> : null}</div> : null}
    {workspace === "journal" ? <div>{page(filteredTransactions).map((transaction) => <article className="data-card" key={transaction.transactionId}><div><strong>{transaction.description}</strong><p>{formatDate(transaction.effectiveAt)} · {(transaction.externalKey.split(":", 1)[0] ?? "transaction").replaceAll("_", " ")}{transaction.reversalTransactionId ? " · reversed" : transaction.reversesTransactionId ? " · reversing entry" : ""}</p>{transaction.reversalReason ? <p>Correction reason: {transaction.reversalReason}</p> : null}<details><summary>View balanced entries and references</summary>{transaction.entries.map((entry) => <small key={`${transaction.transactionId}-${entry.accountCode}-${entry.side}`}>{entry.side.toUpperCase()} {entry.accountCode}: {formatMinorUnits(entry.amountMinor, operatingCurrency, fractionDigits)}<br /></small>)}<small>{transaction.externalKey}{transaction.bookingId ? ` · Booking ${transaction.bookingId}` : ""}{transaction.reversalTransactionId ? ` · Reversal ${transaction.reversalTransactionId}` : transaction.reversesTransactionId ? ` · Reverses ${transaction.reversesTransactionId}` : ""}</small></details>{transaction.externalKey.startsWith("manual:") && !transaction.reversalTransactionId && !transaction.reversesTransactionId ? <button className="secondary-button" disabled={!canManageTenant || busy} onClick={() => void reverseManualJournal(transaction.transactionId)} type="button">Reverse manual journal</button> : null}</div></article>)}{filteredTransactions.length === 0 ? <EmptyState message="No matching journal transactions." /> : null}</div> : null}
    {workspace === "manual" ? <form className="form-grid" onSubmit={(event) => void postJournal(event)}><h4>Post manual journal</h4><p className="empty-state">Manual entries are permanent. Use them only for authorized corrections or operating adjustments. If a manual journal is wrong, reverse it from Journal; system-generated payment, trip, earnings, transfer, and refund entries require their own operational recovery workflow.</p><label>Description<input name="description" required maxLength={240} placeholder="Reason for this journal" /></label><label>Amount ({operatingCurrency})<input name="amount" required inputMode="decimal" placeholder="10.00" /></label><label>Debit account<select name="debitAccount" required defaultValue="cash_clearing">{ledger.accounts.map((account) => <option key={account.accountId} value={account.accountCode}>{account.accountName}</option>)}</select></label><label>Credit account<select name="creditAccount" required defaultValue="platform_fees">{ledger.accounts.map((account) => <option key={account.accountId} value={account.accountCode}>{account.accountName}</option>)}</select></label><button disabled={!canManageTenant || busy} type="submit">Post immutable balanced transaction</button></form> : null}
    {activeCount > pageSize ? <div className="ledger-pagination"><button className="secondary-button" disabled={ledgerPage === 1} onClick={() => setLedgerPage((value) => Math.max(1, value - 1))} type="button">Previous</button><span>Page {ledgerPage} of {pageCount} · {activeCount} records</span><button className="secondary-button" disabled={ledgerPage >= pageCount} onClick={() => setLedgerPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button></div> : null}
  </section>;
}

function ReputationPanel({ canManageTenant, onRefresh, summary }: { canManageTenant: boolean; onRefresh: () => void; summary: TenantSummary }) {
  const [message, setMessage] = useState<string | null>(null);
  const supabase = useMemo(() => createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const average = summary.tripRatings.length
    ? (summary.tripRatings.reduce((sum, rating) => sum + rating.overall_rating, 0) / summary.tripRatings.length).toFixed(1)
    : "—";
  async function moderate(ratingId: string, status: "visible" | "hidden") {
    const reason = status === "hidden" ? window.prompt("Why should this rating be hidden?") : "";
    if (status === "hidden" && !reason?.trim()) return;
    const result = await supabase.rpc("moderate_trip_rating", { target_rating_id: ratingId, target_status: status, reason_value: reason ?? "" });
    setMessage(result.error ? result.error.message : `Rating ${status === "hidden" ? "hidden" : "restored"}.`);
    if (!result.error) onRefresh();
  }
  return <section className="panel-stack">
    <PanelHeader title="Reputation" description={`${summary.tripRatings.length} ratings · ${average} average`} />
    {message ? <p className="feedback-message">{message}</p> : null}
    {summary.tripRatings.length === 0 ? <EmptyState message="Submitted Rider and Driver ratings will appear here." /> : summary.tripRatings.map((rating) => {
      const booking = summary.dispatchBookings.find((item) => item.booking_id === rating.booking_id);
      return <article className="data-card" key={rating.rating_id}>
        <div><strong>{rating.reviewer_type === "rider" ? "Rider rated Driver" : "Driver rated Rider"} · {rating.overall_rating}/5</strong><p>{booking ? `${booking.pickup_address} to ${booking.destination_address}` : `Booking ${rating.booking_id}`}</p>{rating.comment ? <p>{rating.comment}</p> : null}<small>{formatDate(rating.submitted_at)} · {rating.moderation_status}</small></div>
        {canManageTenant ? <button className="secondary-button" type="button" onClick={() => void moderate(rating.rating_id, rating.moderation_status === "visible" ? "hidden" : "visible")}>{rating.moderation_status === "visible" ? "Hide" : "Restore"}</button> : null}
      </article>;
    })}
  </section>;
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
