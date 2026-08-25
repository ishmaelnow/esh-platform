"use client";

import { useEffect, useMemo, useState } from "react";
import { createAdminBrowserClient } from "@/lib/browser-client";
import { loadPrincipalTenantContext } from "@/lib/tenant-admin/context";

export function CommunityWorkspaceApp() {
  const supabase = useMemo(
    () => (typeof window === "undefined" ? null : createAdminBrowserClient()),
    [],
  );
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      if (!data.session?.user) { setChecking(false); return; }
      try {
        const resolution = await loadPrincipalTenantContext(supabase, data.session.user);
        if (resolution.status !== "ready") throw new Error("Select an active tenant from the workspace launcher.");
        const selectedTenantId = resolution.selectedTenant.tenant.tenant_id;
        setTenantId(selectedTenantId);
        setTenantName(resolution.selectedTenant.configuration?.display_name ?? "Tenant");
        const [roleResult, productSessionResult] = await Promise.all([
          supabase.rpc("has_workspace_role", { target_tenant_id: selectedTenantId, target_workspace_key: "community", required_roles: ["community_admin", "community_moderator", "emergency_publisher"] }),
          supabase.rpc("has_active_product_session", { target_tenant_id: selectedTenantId, target_workspace_key: "community" }),
        ]);
        if (roleResult.error) throw roleResult.error;
        if (productSessionResult.error) throw productSessionResult.error;
        setAllowed(roleResult.data && productSessionResult.data);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify Community access."); }
      finally { setChecking(false); }
    });
    return () => { mounted = false; };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !allowed || !tenantId) return;
    const interval = window.setInterval(() => {
      void supabase.rpc("refresh_my_product_session", { target_tenant_id: tenantId, target_workspace_key: "community" }).then(({ data, error: refreshError }) => {
        if (refreshError || !data) {
          setAllowed(false);
          setError("This Community session ended because another product or governance context became active.");
        }
      });
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [allowed, supabase, tenantId]);

  async function exitCommunity() {
    if (!supabase) return;
    setExiting(true);
    setError(null);
    try {
      const { error } = await supabase.rpc("leave_my_product_session", {
        reason_value: "Exited ESH Community Administration.",
      });
      if (error) throw error;
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to exit Community Administration.");
      setExiting(false);
    }
  }

  useEffect(() => {
    if (signedIn === false && !checking) {
      window.location.replace(new URL("/", window.location.origin).href);
    }
  }, [checking, signedIn]);

  useEffect(() => {
    if (signedIn && !checking && (error || !allowed)) {
      window.location.replace(new URL("/?entry=community", window.location.origin).href);
    }
  }, [allowed, checking, error, signedIn]);

  if (signedIn === false) return <main className="workspace-portal"><section className="state-block"><h2>Returning to Community Administration</h2><p>Sign in from the Community Administration entry page before opening operations.</p></section></main>;
  if (signedIn === null || checking) return <main className="workspace-portal"><section className="state-block"><h2>Loading Community workspace</h2><p>Verifying explicit workspace enrollment, role, and product session.</p></section></main>;
  if (error || !allowed) return <main className="workspace-portal"><section className="state-block"><h2>Returning to product entry</h2><p>Community requires an explicit operational session. Redirecting you to the ESH control plane.</p></section></main>;

  return <main className="workspace-portal">
    <header className="workspace-portal-header"><div><p className="eyebrow">ESH Community</p><h1>{tenantName} Community Administration</h1><p className="muted">A separate operational workspace for publishing, services, groups, trust, and moderation.</p></div><button className="secondary-button" disabled={exiting} onClick={() => void exitCommunity()} type="button">{exiting ? "Exiting…" : "Exit Community Administration"}</button></header>
    <section className="workspace-card-grid">
      {[
        ["Foundation", "Workspace enrollment and authorization are active."],
        ["Community content", "The next vertical slice will add typed content and targeting."],
        ["Safety", "Emergency publishing remains a separately assigned role."],
      ].map(([title, description]) => <article className="workspace-card" key={title}><div><h2>{title}</h2><p>{description}</p></div></article>)}
    </section>
  </main>;
}
