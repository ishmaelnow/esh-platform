"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type CommunityFeedItem,
  type CommunityReactionKind,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { eligibleCommunityRows } from "@/lib/admission";
import { parseCommunityFeed } from "@/lib/feed";
import { CommunityFeedCard } from "@/components/CommunityFeedCard";

type CommunityAccess = { tenantId: string; tenantName: string; roles: string[] };
type SafetyMember = { personId: string; displayName: string };

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
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [blockedMembers, setBlockedMembers] = useState<SafetyMember[]>([]);
  const [mutedMembers, setMutedMembers] = useState<SafetyMember[]>([]);
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
      const nextFeed = parseCommunityFeed(data);
      setFeed(nextFeed);
      const media = nextFeed.flatMap((item) => item.media);
      if (!media.length) {
        setMediaUrls({});
        return;
      }
      const signed = await Promise.all(
        media.map(async (asset) => {
          const result = await client.storage
            .from("community-media")
            .createSignedUrl(asset.storagePath, 600);
          return result.data?.signedUrl ? ([asset.mediaId, result.data.signedUrl] as const) : null;
        }),
      );
      setMediaUrls(
        Object.fromEntries(
          signed.filter((item): item is readonly [string, string] => item !== null),
        ),
      );
    },
    [client],
  );

  const loadSafety = useCallback(
    async (tenantId: string) => {
      if (!client) return;
      const { data, error } = await client.rpc("my_community_safety_snapshot", {
        target_tenant_id: tenantId,
      });
      if (error) throw error;
      const source =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      const parse = (value: unknown) =>
        Array.isArray(value)
          ? value.flatMap((entry) => {
              const row =
                entry && typeof entry === "object" && !Array.isArray(entry)
                  ? (entry as Record<string, unknown>)
                  : {};
              return typeof row.person_id === "string"
                ? [
                    {
                      personId: row.person_id,
                      displayName:
                        typeof row.display_name === "string"
                          ? row.display_name
                          : "Community member",
                    },
                  ]
                : [];
            })
          : [];
      setBlockedMembers(parse(source.blocked));
      setMutedMembers(parse(source.muted));
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
      await Promise.all([loadFeed(tenantId), loadSafety(tenantId)]);
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
      const mediaFiles = form
        .getAll("media")
        .filter((value): value is File => value instanceof File && value.size > 0);
      if (mediaFiles.length > 4) throw new Error("Attach no more than four photos per post.");
      if (
        mediaFiles.some(
          (file) =>
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_242_880,
        )
      )
        throw new Error("Photos must be JPEG, PNG, or WebP and no larger than 5 MB.");
      const { data: contentId, error } = await client.rpc("create_my_community_post", {
        target_tenant_id: activeTenantId,
        title_value: formText(form, "title"),
        body_value: formText(form, "body"),
        visibility_value: formText(form, "visibility") || "members",
      });
      if (error) throw error;
      if (!contentId) throw new Error("The post was created without an identifier.");
      for (const [index, file] of mediaFiles.entries()) {
        const extension =
          file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${activeTenantId}/${session?.user.id}/${crypto.randomUUID()}/photo.${extension}`;
        const upload = await client.storage
          .from("community-media")
          .upload(path, file, { upsert: false });
        if (upload.error) throw upload.error;
        const attachment = await client.rpc("attach_my_community_media", {
          target_tenant_id: activeTenantId,
          target_content_id: contentId,
          storage_path_value: path,
          mime_type_value: file.type,
          byte_size_value: file.size,
          alt_text_value: formText(form, "media_alt"),
          sort_order_value: index,
        });
        if (attachment.error) throw attachment.error;
      }
      formElement.reset();
      await loadFeed(activeTenantId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish your post.");
    } finally {
      setBusy(false);
    }
  }

  async function mutateFeed(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!activeTenantId) return false;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      await loadFeed(activeTenantId);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update Community.");
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function createComment(contentId: string, body: string) {
    if (!client || !activeTenantId) return;
    await mutateFeed(() =>
      client.rpc("create_my_community_comment", {
        target_tenant_id: activeTenantId,
        target_content_id: contentId,
        body_value: body,
        parent_comment_id_value: null,
      }),
    );
  }
  async function reactToContent(contentId: string, kind: CommunityReactionKind) {
    if (!client || !activeTenantId) return;
    await mutateFeed(() =>
      client.rpc("toggle_my_community_content_reaction", {
        target_tenant_id: activeTenantId,
        target_content_id: contentId,
        reaction_kind_value: kind,
      }),
    );
  }
  async function reactToComment(commentId: string, kind: CommunityReactionKind) {
    if (!client || !activeTenantId) return;
    await mutateFeed(() =>
      client.rpc("toggle_my_community_comment_reaction", {
        target_tenant_id: activeTenantId,
        target_comment_id: commentId,
        reaction_kind_value: kind,
      }),
    );
  }
  async function reportItem(
    targetType: "content" | "comment",
    targetId: string,
    category: string,
    details: string,
  ) {
    if (!client || !activeTenantId) return;
    if (
      await mutateFeed(() =>
        client.rpc("report_community_item", {
          target_tenant_id: activeTenantId,
          target_type_value: targetType,
          target_id_value: targetId,
          category_value: category,
          details_value: details || null,
        }),
      )
    )
      setMessage("Your report was submitted privately for moderator review.");
  }
  async function setRelationship(personId: string, type: "mute" | "block") {
    if (!client || !activeTenantId) return;
    if (
      await mutateFeed(() =>
        client.rpc("set_my_community_relationship", {
          target_tenant_id: activeTenantId,
          target_person_id: personId,
          relationship_type: type,
          active_value: true,
        }),
      )
    ) {
      await loadSafety(activeTenantId);
      setMessage(type === "block" ? "This member is blocked." : "This member is muted.");
    }
  }
  async function clearRelationship(personId: string, type: "mute" | "block") {
    if (!client || !activeTenantId) return;
    if (
      await mutateFeed(() =>
        client.rpc("set_my_community_relationship", {
          target_tenant_id: activeTenantId,
          target_person_id: personId,
          relationship_type: type,
          active_value: false,
        }),
      )
    ) {
      await loadSafety(activeTenantId);
      setMessage(type === "block" ? "This member is unblocked." : "This member is unmuted.");
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
        <a href="#safety">Safety</a>
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
          <label>
            Photos <span>(optional, up to 4 JPEG, PNG, or WebP files; 5 MB each)</span>
            <input accept="image/jpeg,image/png,image/webp" multiple name="media" type="file" />
          </label>
          <label>
            Photo description <span>(optional accessibility text)</span>
            <input
              maxLength={300}
              name="media_alt"
              placeholder="Example: Neighbors gathered at the park"
            />
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
              <CommunityFeedCard
                busy={busy}
                item={item}
                key={item.contentId}
                mediaUrls={mediaUrls}
                onComment={createComment}
                onCommentReaction={reactToComment}
                onReaction={reactToContent}
                onRelationship={setRelationship}
                onReport={reportItem}
              />
            ))
          ) : (
            <div className="community-card">
              <h3>Your Community starts here</h3>
              <p>No posts have been published yet. Share the first useful update.</p>
            </div>
          )}
        </section>
      </section>
      <section className="community-card safety-settings" id="safety">
        <p className="eyebrow">Privacy and safety</p>
        <h2>Muted and blocked members</h2>
        {!mutedMembers.length && !blockedMembers.length ? (
          <p>You have not muted or blocked anyone in this Community.</p>
        ) : null}
        {mutedMembers.map((member) => (
          <div key={`mute-${member.personId}`}>
            <span>{member.displayName} · muted</span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void clearRelationship(member.personId, "mute")}
              type="button"
            >
              Unmute
            </button>
          </div>
        ))}
        {blockedMembers.map((member) => (
          <div key={`block-${member.personId}`}>
            <span>{member.displayName} · blocked</span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void clearRelationship(member.personId, "block")}
              type="button"
            >
              Unblock
            </button>
          </div>
        ))}
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
