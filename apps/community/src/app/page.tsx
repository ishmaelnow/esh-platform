"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type CommunityFeedItem,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { eligibleCommunityRows } from "@/lib/admission";
import { parseCommunityFeed } from "@/lib/feed";

type CommunityAccess = { tenantId: string; tenantName: string; roles: string[] };

export default function CommunityHome() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = useMemo(
    () =>
      url && key
        ? createIsolatedBrowserSupabaseClient("esh-community-auth", { url, anonKey: key })
        : null,
    [key, url],
  );
  const [session, setSession] = useState<SupabaseAuthSession | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [access, setAccess] = useState<CommunityAccess[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [feed, setFeed] = useState<CommunityFeedItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const admissionAttempt = useRef(0);

  const loadAccess = useCallback(async () => {
    if (!client) return [];
    const { data, error } = await client.rpc("my_workspace_access");
    if (error) throw error;
    const communityRows = eligibleCommunityRows(data ?? []);
    const tenantIds = communityRows.map((row) => row.tenant_id);
    const configurationResult = tenantIds.length
      ? await client
          .from("tenant_configurations")
          .select("tenant_id,display_name")
          .in("tenant_id", tenantIds)
      : { data: [], error: null };
    if (configurationResult.error) throw configurationResult.error;
    const tenantNames = new Map(
      (configurationResult.data ?? []).map((row) => [row.tenant_id, row.display_name]),
    );
    return communityRows.map((row) => ({
      tenantId: row.tenant_id,
      tenantName: tenantNames.get(row.tenant_id) ?? "ESH Community",
      roles: row.role_keys,
    }));
  }, [client]);

  const resolveCommunityAdmission = useCallback(
    async (nextSession: SupabaseAuthSession | null) => {
      const attempt = ++admissionAttempt.current;
      if (!client || !nextSession?.user) {
        setSession(null);
        setAccess([]);
        setActiveTenantId(null);
        setFeed([]);
        setAuthResolved(true);
        return;
      }

      setAuthResolved(false);
      try {
        const nextAccess = await loadAccess();
        if (attempt !== admissionAttempt.current) return;
        if (!nextAccess.length) {
          setSession(null);
          setAccess([]);
          setActiveTenantId(null);
          setFeed([]);
          setMessage("This account does not have access to ESH Community.");
          await client.auth.signOut({ scope: "local" });
          return;
        }
        setAccess(nextAccess);
        setSession(nextSession);
        setMessage(null);
      } catch {
        if (attempt !== admissionAttempt.current) return;
        setSession(null);
        setAccess([]);
        setMessage("ESH Community could not verify access. Please try again.");
        await client.auth.signOut({ scope: "local" });
      } finally {
        if (attempt === admissionAttempt.current) setAuthResolved(true);
      }
    },
    [client, loadAccess],
  );

  const loadFeed = useCallback(
    async (tenantId: string) => {
      if (!client) return;
      const { data, error } = await client.rpc("community_feed_snapshot", {
        target_tenant_id: tenantId,
        result_limit: 50,
      });
      if (error) throw error;
      setFeed(parseCommunityFeed(data));
    },
    [client],
  );

  useEffect(() => {
    if (!client) {
      setAuthResolved(true);
      return;
    }
    void client.auth.getSession().then(({ data }) => void resolveCommunityAdmission(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      void resolveCommunityAdmission(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [client, resolveCommunityAdmission]);

  useEffect(() => {
    if (!client || !activeTenantId) return;
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const { data, error } = await client.rpc("refresh_my_product_session", {
            target_tenant_id: activeTenantId,
            target_workspace_key: "community",
          });
          if (error || !data) {
            setActiveTenantId(null);
            setFeed([]);
            setMessage("Your Community session ended because another product became active.");
          }
        } catch {
          setActiveTenantId(null);
          setFeed([]);
          setMessage("Unable to refresh your Community session. Please enter Community again.");
        }
      })();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [activeTenantId, client]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setAuthResolved(false);
    setMessage(null);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: formText(form, "email").trim(),
        password: formText(form, "password"),
      });
      if (error) {
        setMessage(error.message);
        setAuthResolved(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
      setAuthResolved(true);
    } finally {
      setBusy(false);
    }
  }

  async function enterCommunity(tenantId: string) {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.rpc("enter_my_product_session", {
        target_tenant_id: tenantId,
        target_workspace_key: "community",
      });
      if (error) throw error;
      setActiveTenantId(tenantId);
      await loadFeed(tenantId);
    } catch (error) {
      setActiveTenantId(null);
      setMessage(error instanceof Error ? error.message : "Unable to enter Community.");
    } finally {
      setBusy(false);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !activeTenantId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.rpc("create_my_community_post", {
        target_tenant_id: activeTenantId,
        title_value: formText(form, "title"),
        body_value: formText(form, "body"),
        visibility_value: formText(form, "visibility") || "members",
      });
      if (error) throw error;
      formElement.reset();
      await loadFeed(activeTenantId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish your post.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveCommunity(signOut = false) {
    if (!client) return;
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await client.rpc("leave_my_product_session", {
        reason_value: "Exited ESH Community.",
      });
      if (error && !signOut) throw error;
      setActiveTenantId(null);
      setFeed([]);
      if (signOut) {
        const { error: signOutError } = await client.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        window.location.replace("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to exit Community.");
    } finally {
      setBusy(false);
    }
  }

  if (!url || !key)
    return (
      <State title="Community unavailable" message="ESH Community configuration is incomplete." />
    );
  if (!authResolved)
    return <State title="Opening Community" message="Checking your ESH account." />;
  if (!session)
    return (
      <main className="community-shell">
        <header>
          <div>
            <p className="eyebrow">ESH Community</p>
            <h1>Neighbors. Information. Local help.</h1>
            <p>Sign in to your ESH Community account.</p>
          </div>
        </header>
        <form className="community-card form-grid" onSubmit={(event) => void signIn(event)}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {message ? <p className="error">{message}</p> : null}
          <button disabled={busy} type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  if (!activeTenantId)
    return (
      <main className="community-shell">
        <Header onSignOut={() => void leaveCommunity(true)} />
        <section>
          <h2>Your Communities</h2>
          {access.length ? (
            <div className="community-grid">
              {access.map((item) => (
                <article className="community-card" key={item.tenantId}>
                  <p className="eyebrow">Enabled Community</p>
                  <h3>{item.tenantName}</h3>
                  <p>{item.roles.join(" · ")}</p>
                  <button
                    disabled={busy}
                    onClick={() => void enterCommunity(item.tenantId)}
                    type="button"
                  >
                    Enter Community
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </section>
        {message ? <p className="error">{message}</p> : null}
      </main>
    );

  return (
    <main className="community-shell">
      <Header onExit={() => void leaveCommunity()} onSignOut={() => void leaveCommunity(true)} />
      <nav aria-label="Community">
        <a href="#home">Home</a>
        <a href="#discover">Discover</a>
        <a href="#services">Services</a>
        <a href="#groups">Groups</a>
      </nav>
      <section className="community-layout" id="home">
        <form className="community-card form-grid" onSubmit={(event) => void createPost(event)}>
          <h2>Share with your community</h2>
          <label>
            Title <span>(optional)</span>
            <input maxLength={180} name="title" placeholder="What should neighbors know?" />
          </label>
          <label>
            Message
            <textarea
              maxLength={10000}
              name="body"
              placeholder="Share useful local information…"
              required
              rows={5}
            />
          </label>
          <label>
            Audience
            <select name="visibility">
              <option value="members">Community members</option>
              <option value="public">Public</option>
            </select>
          </label>
          <button disabled={busy} type="submit">
            Publish post
          </button>
        </form>
        <section className="feed" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Home</p>
              <h2>Community feed</h2>
            </div>
            <button
              className="secondary"
              onClick={() => void loadFeed(activeTenantId)}
              type="button"
            >
              Refresh
            </button>
          </div>
          {message ? <p className="error">{message}</p> : null}
          {feed.length ? (
            feed.map((item) => (
              <article className="community-card feed-item" key={item.contentId}>
                <div className="feed-meta">
                  <strong>{item.authorName}</strong>
                  <time>{new Date(item.publishedAt).toLocaleString()}</time>
                </div>
                {item.title ? <h3>{item.title}</h3> : null}
                <p>{item.body}</p>
                <span className="tag">{item.contentKind.replaceAll("_", " ")}</span>
              </article>
            ))
          ) : (
            <div className="community-card">
              <h3>Your Community starts here</h3>
              <p>No posts have been published yet. Share the first useful update.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function Header({ onExit, onSignOut }: { onExit?: () => void; onSignOut: () => void }) {
  return (
    <header className="community-header">
      <div>
        <p className="eyebrow">ESH Community</p>
        <h1>Community</h1>
        <p>Useful information and real local connections.</p>
      </div>
      <div className="header-actions">
        {onExit ? (
          <button className="secondary" onClick={onExit} type="button">
            Exit Community
          </button>
        ) : null}
        <button className="secondary" onClick={onSignOut} type="button">
          Sign out
        </button>
      </div>
    </header>
  );
}
function State({ title, message }: { title: string; message: string }) {
  return (
    <main className="community-shell">
      <section className="community-card state">
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}
