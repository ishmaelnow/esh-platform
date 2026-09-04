"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createIsolatedBrowserSupabaseClient,
  type CommunityFeedItem,
  type CommunityReactionKind,
  type CommunityServiceListing,
  type SupabaseAuthSession,
} from "@esh-platform/supabase";
import { eligibleCommunityRows } from "@/lib/admission";
import { parseCommunityFeed } from "@/lib/feed";
import { CommunityFeedCard } from "@/components/CommunityFeedCard";

type CommunityAccess = { tenantId: string; tenantName: string; roles: string[] };
type PublicCommunity = { tenant_id: string; display_name: string };
type SafetyMember = { personId: string; displayName: string };
type CommunityProfile = {
  profile_id: string;
  display_name: string;
  bio: string | null;
  locality: string | null;
  profile_visibility: "members" | "public";
  avatar_media_id: string | null;
};
type CommunityProfileItem = {
  item_id: string;
  item_kind: "interest" | "skill" | "link" | "service";
  label: string;
  value: string;
  item_visibility: "members" | "public";
};

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
  const [services, setServices] = useState<CommunityServiceListing[]>([]);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [profileItems, setProfileItems] = useState<CommunityProfileItem[]>([]);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [publicCommunities, setPublicCommunities] = useState<PublicCommunity[]>([]);
  const [publicSurface, setPublicSurface] = useState(false);
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

  const loadServices = useCallback(async (tenantId: string) => {
    if (!client) return;
    const { data, error } = await client.rpc("community_service_directory_snapshot", {
      target_tenant_id: tenantId, result_limit: 50,
    });
    if (error) throw error;
    setServices(Array.isArray(data) ? data as unknown as CommunityServiceListing[] : []);
  }, [client]);

  const loadProfile = useCallback(async (tenantId: string) => {
    if (!client) return;
    const { data, error } = await client.rpc("community_profile_snapshot", { target_tenant_id: tenantId });
    if (error) throw error;
    const source = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const nextProfile = source.profile && typeof source.profile === "object" && !Array.isArray(source.profile)
      ? source.profile as CommunityProfile : null;
    setProfile(nextProfile);
    setProfileItems(Array.isArray(source.items) ? source.items as CommunityProfileItem[] : []);
    if (nextProfile?.avatar_media_id) {
      const { data: media } = await client.from("community_media_assets").select("storage_path").eq("media_id", nextProfile.avatar_media_id).maybeSingle();
      if (media?.storage_path) {
        const signed = await client.storage.from("community-media").createSignedUrl(media.storage_path, 600);
        setProfileAvatarUrl(signed.data?.signedUrl ?? null);
      }
    } else setProfileAvatarUrl(null);
  }, [client]);

  useEffect(() => { setPublicSurface(window.location.hostname === "community.eshapp.com"); }, []);

  useEffect(() => {
    if (publicSurface) { setAuthResolved(true); return; }
    if (!client) {
      setAuthResolved(true);
      return;
    }
    void client.auth.getSession().then(({ data }) => void resolveCommunityAdmission(data.session));
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      void resolveCommunityAdmission(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [client, publicSurface, resolveCommunityAdmission]);

  useEffect(() => {
    if (!client || session || !publicSurface) return;
    void client.rpc("community_public_directory_snapshot").then(({ data }) => {
      setPublicCommunities(Array.isArray(data) ? data as unknown as PublicCommunity[] : []);
    });
  }, [client, publicSurface, session]);

  useEffect(() => {
    if (!client || !publicSurface || !publicCommunities.length) return;
    const firstCommunity = publicCommunities[0];
    if (!firstCommunity) return;
    void loadFeed(firstCommunity.tenant_id).catch(() => setMessage("Public Community information is temporarily unavailable."));
  }, [client, loadFeed, publicCommunities, publicSurface]);

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

  async function requestSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage(null);
    try {
      const { error } = await client.auth.signInWithOtp({
        email: formText(form, "email").trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
      });
      if (error) throw error;
      setMessage("Check your email and open the newest secure sign-in link once.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send a sign-in link."); }
    finally { setBusy(false); }
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
      await Promise.all([loadFeed(tenantId), loadSafety(tenantId), loadServices(tenantId), loadProfile(tenantId)]);
    } catch (error) {
      setActiveTenantId(null);
      setMessage(error instanceof Error ? error.message : "Unable to enter Community.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !activeTenantId) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage(null);
    try {
      const { error } = await client.rpc("upsert_my_community_profile", {
        target_tenant_id: activeTenantId, display_name_value: formText(form, "profile_name"),
        bio_value: formText(form, "profile_bio") || null, locality_value: formText(form, "profile_locality") || null,
        visibility_value: formText(form, "profile_visibility") || "members",
      });
      if (error) throw error;
      await loadProfile(activeTenantId); setMessage("Your Community profile was saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save your profile."); }
    finally { setBusy(false); }
  }

  async function addProfileItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !activeTenantId) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setMessage(null);
    try {
      const { error } = await client.rpc("add_my_community_profile_item", {
        target_tenant_id: activeTenantId, item_kind_value: formText(form, "item_kind"), label_value: formText(form, "item_label"),
        value_value: formText(form, "item_value"), visibility_value: formText(form, "item_visibility") || "members",
      });
      if (error) throw error; formElement.reset(); await loadProfile(activeTenantId); setMessage("Profile item added.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add profile item."); }
    finally { setBusy(false); }
  }

  async function removeProfileItem(itemId: string) {
    if (!client || !activeTenantId) return; setBusy(true); setMessage(null);
    try { const { error } = await client.rpc("remove_my_community_profile_item", { target_tenant_id: activeTenantId, item_id_value: itemId }); if (error) throw error; await loadProfile(activeTenantId); setMessage("Profile item removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to remove profile item."); } finally { setBusy(false); }
  }

  async function updateProfileItem(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); if (!client || !activeTenantId) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage(null);
    try {
      const { error } = await client.rpc("update_my_community_profile_item", {
        target_tenant_id: activeTenantId, item_id_value: itemId, item_kind_value: formText(form, "item_kind"),
        label_value: formText(form, "item_label"), value_value: formText(form, "item_value"), visibility_value: formText(form, "item_visibility"),
      });
      if (error) throw error; await loadProfile(activeTenantId); setMessage("Profile item updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update profile item."); }
    finally { setBusy(false); }
  }

  async function updateProfilePhoto(event: FormEvent<HTMLInputElement>) {
    if (!client || !activeTenantId || !session?.user.id) {
      setMessage("Community is not ready for a profile photo. Please re-enter Community and try again.");
      event.currentTarget.value = "";
      return;
    }
    if (!profile) {
      setMessage("Save your Community profile before adding a photo.");
      event.currentTarget.value = "";
      return;
    }
    const file = event.currentTarget.files?.[0]; if (!file) return; setBusy(true); setMessage(null);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_242_880) throw new Error("Profile photos must be JPEG, PNG, or WebP and no larger than 5 MB.");
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${activeTenantId}/${session.user.id}/profile/${crypto.randomUUID()}.${extension}`;
      let previousPath: string | null = null;
      if (profile.avatar_media_id) {
        const previous = await client.from("community_media_assets").select("storage_path").eq("media_id", profile.avatar_media_id).maybeSingle();
        previousPath = previous.data?.storage_path ?? null;
      }
      const upload = await client.storage.from("community-media").upload(path, file, { upsert: false }); if (upload.error) throw upload.error;
      const attached = await client.rpc("attach_my_community_profile_avatar", { target_tenant_id: activeTenantId, storage_path_value: path, mime_type_value: file.type, byte_size_value: file.size, alt_text_value: "Community member profile photo" });
      if (attached.error) throw attached.error; await loadProfile(activeTenantId); setMessage("Profile photo updated.");
      if (previousPath) await client.storage.from("community-media").remove([previousPath]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update profile photo."); } finally { setBusy(false); event.currentTarget.value = ""; }
  }

  async function removeProfilePhoto() {
    if (!client || !activeTenantId) return; setBusy(true); setMessage(null);
    try { const { data, error } = await client.rpc("remove_my_community_profile_avatar", { target_tenant_id: activeTenantId }); if (error) throw error; if (data) await client.storage.from("community-media").remove([data]); await loadProfile(activeTenantId); setMessage("Profile photo removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to remove profile photo."); } finally { setBusy(false); }
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
            <p>{publicSurface ? "Browse public information, request membership, or send private feedback." : "Sign in to your ESH Community account."}</p>
          </div>
        </header>
        {message ? <p className={message.includes("submitted") || message.includes("Thank you") ? "notice" : "error"}>{message}</p> : null}
        <section className="community-card">
          <h2>Explore Community</h2>
          <p>Browse public information without signing in. Actions require approved Community membership.</p>
          {publicCommunities.length ? publicCommunities.map((community) => <article key={community.tenant_id}><h3>{community.display_name}</h3><p>Public Community information and local services.</p></article>) : <p>No public Communities are currently available.</p>}
        </section>
        <section className="community-card" aria-live="polite"><p className="eyebrow">Public updates</p><h2>Community information</h2>{feed.length ? feed.map((item) => <article className="feed-item" key={item.contentId}><div className="feed-meta"><strong>{item.authorName}</strong><time>{new Date(item.publishedAt).toLocaleString()}</time></div>{item.title ? <h3>{item.title}</h3> : null}<p>{item.body}</p></article>) : <p>No public updates have been published yet.</p>}</section>
        {!publicSurface ? <form className="community-card form-grid" onSubmit={(event) => void requestSignInLink(event)}>
          <h2>Member sign in</h2>
          <p>Enter your email and we’ll send a one-time secure sign-in link. No password is required.</p>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          {message ? <p className="error">{message}</p> : null}
          <button disabled={busy} type="submit">Email me a secure link</button>
        </form> : null}
        {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
        <form className="community-card form-grid" onSubmit={async (event) => { event.preventDefault(); if (!client) return; const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); try { const result = await client.rpc("submit_community_join_request", { target_tenant_id: formText(form, "tenant"), email_value: formText(form, "join_email"), display_name_value: formText(form, "join_name"), locality_value: formText(form, "locality") || null, reason_value: formText(form, "join_reason") || null }); if (result.error) throw result.error; setMessage("Your join request was submitted for Community review."); formElement.reset(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit your join request."); } finally { setBusy(false); } }}>
          <h2>Request membership</h2><p>Membership is reviewed before you can post or interact.</p>
          <label>Community<select name="tenant" required><option value="">Choose a Community</option>{publicCommunities.map((community) => <option key={community.tenant_id} value={community.tenant_id}>{community.display_name}</option>)}</select></label>
          <label>Name<input name="join_name" required /></label><label>Email<input name="join_email" type="email" required /></label><label>Locality<input name="locality" placeholder="City or neighborhood" /></label><label>Why would you like to join?<textarea name="join_reason" maxLength={1000} rows={3} /></label><button disabled={busy} type="submit">Request to join</button>
        </form>
        {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
        <form className="community-card form-grid" onSubmit={async (event) => { event.preventDefault(); if (!client) return; const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); try { const result = await client.rpc("submit_community_public_feedback", { target_tenant_id: formText(form, "feedback_tenant") || null, category_value: formText(form, "feedback_category"), message_value: formText(form, "feedback_message"), contact_email_value: formText(form, "feedback_email") || null }); if (result.error) throw result.error; setMessage("Thank you. Your feedback was sent privately to the Community team."); formElement.reset(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit feedback."); } finally { setBusy(false); } }}>
          <h2>Public feedback</h2><label>Community (optional)<select name="feedback_tenant"><option value="">General feedback</option>{publicCommunities.map((community) => <option key={community.tenant_id} value={community.tenant_id}>{community.display_name}</option>)}</select></label><label>Category<select name="feedback_category"><option value="suggestion">Suggestion</option><option value="issue">Issue</option><option value="question">Question</option><option value="service_concern">Service concern</option></select></label><label>Message<textarea name="feedback_message" required maxLength={5000} rows={4} /></label><label>Email for follow-up (optional)<input name="feedback_email" type="email" /></label><button disabled={busy} type="submit">Send feedback</button>
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
        <a href="#profile">Profile</a>
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
      <section className="community-card" id="services">
        <div className="section-heading">
          <div><p className="eyebrow">Local services</p><h2>Services directory</h2></div>
          <button className="secondary" onClick={() => { if (activeTenantId) void loadServices(activeTenantId); }} type="button">Refresh</button>
        </div>
        {services.length ? services.map((listing) => (
          <article className="community-card" key={listing.listing_id}>
            <p className="eyebrow">{listing.service_category}{listing.service_area_name ? ` · ${listing.service_area_name}` : ""}</p>
            <h3>{listing.title}</h3>
            <p>{listing.description}</p>
            <p>{listing.provider_name}{listing.rate_text ? ` · ${listing.rate_text}` : ""}</p>
            <p>{listing.contact_email ?? listing.contact_phone ?? listing.website_url}</p>
          </article>
        )) : <p>No active service listings are available yet.</p>}
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
      <section className="community-card" id="profile">
        <p className="eyebrow">Your profile</p><h2>Community profile</h2>
        <p>Choose what other Community members can see. Your email and account identity stay private.</p>
        <form className="form-grid" onSubmit={(event) => void saveProfile(event)}>
          <label>Display name<input name="profile_name" defaultValue={profile?.display_name ?? ""} maxLength={120} required /></label>
          <label>Bio<textarea name="profile_bio" defaultValue={profile?.bio ?? ""} maxLength={1000} rows={3} /></label>
          <label>City or neighborhood<input name="profile_locality" defaultValue={profile?.locality ?? ""} maxLength={160} /></label>
          <label>Profile visibility<select name="profile_visibility" defaultValue={profile?.profile_visibility ?? "members"}><option value="members">Community members</option><option value="public">Public</option></select></label>
          <button disabled={busy} type="submit">Save profile</button>
        </form>
        <div className="profile-photo">
          {profileAvatarUrl ? <img alt="Your Community profile" src={profileAvatarUrl} /> : <p>No profile photo yet.</p>}
          <label>Profile photo<input accept="image/jpeg,image/png,image/webp" onChange={(event) => void updateProfilePhoto(event)} type="file" /></label>
          {profileAvatarUrl ? <button className="secondary" disabled={busy} onClick={() => void removeProfilePhoto()} type="button">Remove photo</button> : null}
        </div>
        <h3>Profile items</h3>
        {profileItems.map((item) => <form className="profile-item" key={item.item_id} onSubmit={(event) => void updateProfileItem(event, item.item_id)}><select name="item_kind" defaultValue={item.item_kind} aria-label="Item type"><option value="interest">Interest</option><option value="skill">Skill</option><option value="service">Service</option><option value="link">Link</option></select><input name="item_label" defaultValue={item.label} maxLength={80} aria-label="Item label" required /><input name="item_value" defaultValue={item.value} maxLength={300} aria-label="Item value" required /><select name="item_visibility" defaultValue={item.item_visibility} aria-label="Item visibility"><option value="members">Members</option><option value="public">Public</option></select><button disabled={busy} type="submit">Save</button><button className="secondary" disabled={busy} onClick={() => void removeProfileItem(item.item_id)} type="button">Remove</button></form>)}
        <form className="form-grid" onSubmit={(event) => void addProfileItem(event)}>
          <label>Type<select name="item_kind"><option value="interest">Interest</option><option value="skill">Skill</option><option value="service">Service</option><option value="link">Link</option></select></label>
          <label>Label<input name="item_label" maxLength={80} placeholder="Example: Gardening" required /></label>
          <label>Value<input name="item_value" maxLength={300} placeholder="Example: Weekend gardening projects" required /></label>
          <label>Visibility<select name="item_visibility"><option value="members">Community members</option><option value="public">Public</option></select></label>
          <button disabled={busy || !profile} type="submit">Add profile item</button>
        </form>
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
