"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  MyWorkspaceAccess,
  SupabaseAuthSession,
  WorkspaceRoleKey,
} from "@esh-platform/supabase";
import { createAdminBrowserClient } from "@/lib/browser-client";
import {
  loadPrincipalTenantContext,
  persistActiveTenantPreference,
} from "@/lib/tenant-admin/context";
import { eligibleCommunityAdminRows } from "@/lib/workspace-admin/types";
import { PasswordInput } from "./PasswordInput";

type CommunityAdminAccess = MyWorkspaceAccess & { tenantName: string };

const roleLabels: Partial<Record<WorkspaceRoleKey, string>> = {
  community_admin: "Community administrator",
  community_moderator: "Community moderator",
  emergency_publisher: "Emergency publisher",
};

export function CommunityAdminEntryApp() {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createAdminBrowserClient()),
    [],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [access, setAccess] = useState<CommunityAdminAccess[]>([]);
  const [authResolved, setAuthResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolveAdmission = useCallback(
    async (nextSession: SupabaseAuthSession | null) => {
      if (!supabase || !nextSession?.user) {
        setSession(null);
        setAccess([]);
        setAuthResolved(true);
        return;
      }
      setAuthResolved(false);
      try {
        const { data, error } = await supabase.rpc("my_workspace_access");
        if (error) throw error;
        const rows = eligibleCommunityAdminRows((data ?? []) as MyWorkspaceAccess[]);
        if (!rows.length) {
          setSession(null);
          setAccess([]);
          setMessage("This account does not have access to ESH Community Administration.");
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
        const { data: configurations, error: configurationError } = await supabase
          .from("tenant_configurations")
          .select("tenant_id,display_name")
          .in(
            "tenant_id",
            rows.map((row) => row.tenant_id),
          );
        if (configurationError) throw configurationError;
        const names = new Map(
          (configurations ?? []).map((row) => [row.tenant_id, row.display_name]),
        );
        setAccess(
          rows.map((row) => ({
            ...row,
            tenantName: names.get(row.tenant_id) ?? "ESH Community",
          })),
        );
        setSession(nextSession);
        setMessage(null);
      } catch {
        setSession(null);
        setAccess([]);
        setMessage("ESH Community Administration could not verify access. Please try again.");
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        setAuthResolved(true);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      setAuthResolved(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => void resolveAdmission(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void resolveAdmission(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [resolveAdmission, supabase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: formText(form, "email").trim(),
      password: formText(form, "password"),
    });
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
      setBusy(false);
    }
  }

  async function enterCommunity(item: CommunityAdminAccess) {
    if (!supabase || !session?.user) return;
    setBusy(true);
    setMessage(null);
    try {
      const resolution = await loadPrincipalTenantContext(supabase, session.user);
      if (!("context" in resolution)) throw new Error("Tenant access could not be resolved.");
      const tenant = resolution.context.memberships.find(
        (option) =>
          option.tenant.tenant_id === item.tenant_id &&
          option.membership.membership_id === item.membership_id,
      );
      if (!tenant) throw new Error("Community tenant membership is unavailable.");
      await persistActiveTenantPreference(supabase, resolution.context.person.person_id, tenant);
      const { error } = await supabase.rpc("enter_my_product_session", {
        target_tenant_id: item.tenant_id,
        target_workspace_key: "community",
      });
      if (error) throw error;
      window.location.assign("/community");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to open Community Administration.",
      );
      setBusy(false);
    }
  }

  if (!authResolved) {
    return <State title="Opening Community Administration" message="Checking your ESH account." />;
  }
  if (!session) {
    return (
      <main className="signed-out-shell community-admin-entry">
        <section className="sign-in-panel panel">
          <p className="eyebrow">ESH Community</p>
          <h1>Community Administration</h1>
          <p className="muted">Sign in with an account assigned to Community operations.</p>
          <form className="form-grid" onSubmit={(event) => void signIn(event)}>
            <label>
              Email
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <label>
              Password
              <PasswordInput />
            </label>
            {message ? <p className="form-error">{message}</p> : null}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-portal community-admin-entry">
      <header className="workspace-portal-header">
        <div>
          <p className="eyebrow">ESH Community</p>
          <h1>Choose a Community operation</h1>
          <p className="muted">Open one Community tenant workspace.</p>
        </div>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void signOut()}
          type="button"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </header>
      {message ? <p className="form-error">{message}</p> : null}
      <section className="workspace-card-grid">
        {access.map((item) => (
          <article className="workspace-card" key={`${item.tenant_id}:${item.membership_id}`}>
            <div>
              <span className="status-pill enabled">enabled</span>
              <h2>{item.tenantName}</h2>
              <p>Publishing, services, groups, trust, and Community moderation.</p>
            </div>
            <p className="workspace-role-summary">{communityRoleSummary(item.role_keys)}</p>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void enterCommunity(item)}
              type="button"
            >
              Open Community Administration
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function State({ title, message }: { title: string; message: string }) {
  return (
    <main className="signed-out-shell">
      <section className="state-block">
        <h2>{title}</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}

function communityRoleSummary(roles: WorkspaceRoleKey[]) {
  return roles.flatMap((role) => roleLabels[role] ?? []).join(" · ");
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
