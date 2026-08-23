"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";
import { loadPrincipalTenantContext } from "@/lib/tenant-admin/context";
import { AdminSignIn } from "@/components/auth/AdminSignIn";

export function CommunityWorkspaceApp() {
  const supabase = useMemo(() => typeof window === "undefined" ? null : createBrowserSupabaseClient(adminPublicConfig.supabase), []);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      if (!data.session?.user) return;
      try {
        const resolution = await loadPrincipalTenantContext(supabase, data.session.user);
        if (resolution.status !== "ready") throw new Error("Select an active tenant from the workspace launcher.");
        setTenantName(resolution.selectedTenant.configuration?.display_name ?? "Tenant");
        const { data: access, error: accessError } = await supabase.rpc("has_workspace_role", { target_tenant_id: resolution.selectedTenant.tenant.tenant_id, target_workspace_key: "community", required_roles: ["community_admin", "community_moderator", "emergency_publisher"] });
        if (accessError) throw accessError;
        setAllowed(access);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify Community access."); }
    });
    return () => { mounted = false; };
  }, [supabase]);

  if (signedIn === false) return <AdminSignIn />;
  if (signedIn === null) return <main className="workspace-portal"><section className="state-block"><h2>Loading Community workspace</h2><p>Verifying explicit workspace enrollment and role.</p></section></main>;
  if (error || !allowed) return <main className="workspace-portal"><section className="state-block danger"><h2>Community workspace access required</h2><p>{error ?? "Your tenant relationship does not include an active Community operating role."}</p><Link className="secondary-button" href="/">Return to workspaces</Link></section></main>;

  return <main className="workspace-portal">
    <header className="workspace-portal-header"><div><p className="eyebrow">Community</p><h1>{tenantName} Community Administration</h1><p className="muted">A separate operational workspace for publishing, services, groups, trust, and moderation.</p></div><Link className="secondary-button" href="/">All workspaces</Link></header>
    <section className="workspace-card-grid">
      {[
        ["Foundation", "Workspace enrollment and authorization are active."],
        ["Community content", "The next vertical slice will add typed content and targeting."],
        ["Safety", "Emergency publishing remains a separately assigned role."],
      ].map(([title, description]) => <article className="workspace-card" key={title}><div><h2>{title}</h2><p>{description}</p></div></article>)}
    </section>
  </main>;
}
