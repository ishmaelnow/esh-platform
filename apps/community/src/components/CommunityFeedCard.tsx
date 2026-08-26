"use client";

import type { CommunityFeedItem, CommunityReactionKind } from "@esh-platform/supabase";
import type { FormEvent } from "react";

const reactions: { key: CommunityReactionKind; label: string }[] = [
  { key: "like", label: "Like" },
  { key: "support", label: "Support" },
  { key: "helpful", label: "Helpful" },
];

type Props = {
  item: CommunityFeedItem;
  busy: boolean;
  mediaUrls: Record<string, string>;
  onComment: (contentId: string, body: string) => Promise<void>;
  onReaction: (contentId: string, kind: CommunityReactionKind) => Promise<void>;
  onCommentReaction: (commentId: string, kind: CommunityReactionKind) => Promise<void>;
  onReport: (
    targetType: "content" | "comment",
    targetId: string,
    category: string,
    details: string,
  ) => Promise<void>;
  onRelationship: (personId: string, type: "mute" | "block") => Promise<void>;
};

export function CommunityFeedCard(props: Props) {
  const { item, busy, mediaUrls } = props;
  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form).get("comment");
    if (typeof body !== "string" || !body.trim()) return;
    await props.onComment(item.contentId, body);
    form.reset();
  }
  return (
    <article className="community-card feed-item">
      <div className="feed-meta">
        <strong>{item.authorName}</strong>
        <time>{new Date(item.publishedAt).toLocaleString()}</time>
      </div>
      {item.title ? <h3>{item.title}</h3> : null}
      <p>{item.body}</p>
      {item.media.length ? (
        <div className="media-grid">
          {item.media.map((media) =>
            mediaUrls[media.mediaId] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={media.altText ?? "Community post photo"}
                key={media.mediaId}
                loading="lazy"
                src={mediaUrls[media.mediaId]}
              />
            ) : null,
          )}
        </div>
      ) : null}
      <div className="item-actions" aria-label="Post reactions">
        {reactions.map(({ key, label }) => (
          <button
            aria-pressed={item.viewerReactions.includes(key)}
            className={item.viewerReactions.includes(key) ? "reaction active" : "reaction"}
            disabled={busy}
            key={key}
            onClick={() => void props.onReaction(item.contentId, key)}
            type="button"
          >
            {label} {item.reactionCounts[key] ?? 0}
          </button>
        ))}
        <span className="tag">{item.contentKind.replaceAll("_", " ")}</span>
      </div>
      {!item.viewerIsAuthor ? (
        <div className="safety-actions">
          <button
            disabled={busy}
            onClick={() => void props.onRelationship(item.authorPersonId, "mute")}
            type="button"
          >
            Mute author
          </button>
          <button
            disabled={busy}
            onClick={() => void props.onRelationship(item.authorPersonId, "block")}
            type="button"
          >
            Block author
          </button>
          <ReportForm
            busy={busy}
            onSubmit={(category, details) =>
              props.onReport("content", item.contentId, category, details)
            }
          />
        </div>
      ) : null}
      <section className="comments" aria-label="Comments">
        <h4>
          {item.comments.length} {item.comments.length === 1 ? "comment" : "comments"}
        </h4>
        {item.comments.map((comment) => (
          <article className="comment" key={comment.commentId}>
            <div className="feed-meta">
              <strong>{comment.authorName}</strong>
              <time>{new Date(comment.createdAt).toLocaleString()}</time>
            </div>
            <p>{comment.body}</p>
            <div className="item-actions">
              {reactions.map(({ key, label }) => (
                <button
                  aria-pressed={comment.viewerReactions.includes(key)}
                  className={comment.viewerReactions.includes(key) ? "reaction active" : "reaction"}
                  disabled={busy}
                  key={key}
                  onClick={() => void props.onCommentReaction(comment.commentId, key)}
                  type="button"
                >
                  {label} {comment.reactionCounts[key] ?? 0}
                </button>
              ))}
              {!comment.viewerIsAuthor ? (
                <ReportForm
                  busy={busy}
                  onSubmit={(category, details) =>
                    props.onReport("comment", comment.commentId, category, details)
                  }
                />
              ) : null}
            </div>
          </article>
        ))}
        <form className="comment-form" onSubmit={(event) => void submitComment(event)}>
          <label>
            Add a useful comment
            <textarea
              maxLength={3000}
              name="comment"
              placeholder="Write a respectful response…"
              required
              rows={2}
            />
          </label>
          <button disabled={busy} type="submit">
            Comment
          </button>
        </form>
      </section>
    </article>
  );
}

function ReportForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (category: string, details: string) => Promise<void>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const category = values.get("category");
    const details = values.get("details");
    await onSubmit(
      typeof category === "string" ? category : "other",
      typeof details === "string" ? details : "",
    );
    form.reset();
    form.closest("details")?.removeAttribute("open");
  }
  return (
    <details className="report-control">
      <summary>Report</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Concern
          <select name="category">
            <option value="harassment">Harassment</option>
            <option value="hate">Hate</option>
            <option value="misinformation">Misinformation</option>
            <option value="spam">Spam</option>
            <option value="unsafe">Unsafe activity</option>
            <option value="privacy">Privacy</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Details <span>(optional)</span>
          <textarea maxLength={1000} name="details" rows={2} />
        </label>
        <button disabled={busy} type="submit">
          Submit report
        </button>
      </form>
    </details>
  );
}
