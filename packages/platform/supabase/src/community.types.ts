export type CommunityArea = {
  area_id: string;
  tenant_id: string;
  parent_area_id: string | null;
  area_type: "city" | "neighborhood" | "district" | "other";
  name: string;
  description: string | null;
  visibility: "public" | "members";
  status: "draft" | "active" | "inactive";
  center_latitude: number | null;
  center_longitude: number | null;
  radius_km: number | null;
  created_at: string;
  updated_at: string;
};
export type CommunityGroup = {
  group_id: string;
  tenant_id: string;
  area_id: string | null;
  name: string;
  group_slug: string;
  description: string | null;
  visibility: "public" | "members" | "private";
  membership_mode: "open" | "approval_required" | "invite_only";
  status: "draft" | "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};
export type CommunityGroupMembership = {
  group_membership_id: string;
  tenant_id: string;
  group_id: string;
  membership_id: string;
  group_role: "member" | "moderator" | "owner";
  status: "pending" | "active" | "rejected" | "removed";
  joined_at: string | null;
  ended_at: string | null;
};
export type CommunityOrganization = {
  organization_id: string;
  tenant_id: string;
  name: string;
  organization_slug: string;
  summary: string | null;
  website_url: string | null;
  public_email: string | null;
  public_phone: string | null;
  visibility: "public" | "members";
  status: "draft" | "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
};
export type CommunityOrganizationMembership = {
  organization_membership_id: string;
  tenant_id: string;
  organization_id: string;
  membership_id: string;
  organization_role: "owner" | "admin" | "editor" | "member";
  status: "active" | "removed";
  joined_at: string;
  ended_at: string | null;
};
export type CommunityProviderProfile = {
  provider_id: string;
  tenant_id: string;
  owner_membership_id: string | null;
  owner_organization_id: string | null;
  display_name: string;
  summary: string | null;
  status: "draft" | "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
};
export type CommunityVerificationStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "suspended"
  | "expired";
export type CommunityOrganizationVerification = {
  verification_id: string;
  tenant_id: string;
  organization_id: string;
  verification_type: string;
  status: CommunityVerificationStatus;
  evidence_reference: string;
  submitted_by_person_id: string;
  reviewed_by_person_id: string | null;
  review_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  effective_at: string | null;
  expires_at: string | null;
};
export type CommunityProviderVerification = {
  verification_id: string;
  tenant_id: string;
  provider_id: string;
  verification_type: string;
  status: CommunityVerificationStatus;
  evidence_reference: string;
  submitted_by_person_id: string;
  reviewed_by_person_id: string | null;
  review_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  effective_at: string | null;
  expires_at: string | null;
};
export type CommunityServiceListing = {
  listing_id: string;
  provider_id: string;
  provider_name: string;
  provider_status: string;
  service_category: string;
  title: string;
  description: string;
  service_area_id: string | null;
  service_area_name: string | null;
  rate_text: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  updated_at: string;
};

export type CommunityFeedItem = {
  contentId: string;
  contentKind: string;
  title: string | null;
  body: string;
  visibility: "public" | "members" | "group_private";
  priority: "normal" | "important" | "urgent" | "emergency";
  publishedAt: string;
  expiresAt: string | null;
  authorName: string;
  authorPersonId: string;
  viewerIsAuthor: boolean;
  reactionCounts: CommunityReactionCounts;
  viewerReactions: CommunityReactionKind[];
  comments: CommunityComment[];
  media: CommunityMedia[];
};

export type CommunityReactionKind = "like" | "support" | "helpful";
export type CommunityReactionCounts = Partial<Record<CommunityReactionKind, number>>;
export type CommunityComment = {
  commentId: string;
  parentCommentId: string | null;
  body: string;
  authorName: string;
  authorPersonId: string;
  viewerIsAuthor: boolean;
  createdAt: string;
  reactionCounts: CommunityReactionCounts;
  viewerReactions: CommunityReactionKind[];
};
export type CommunityMedia = {
  mediaId: string;
  storagePath: string;
  altText: string | null;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};
export type CommunityModerationReport = {
  reportId: string;
  targetType: "content" | "comment";
  targetId: string;
  category: string;
  details: string | null;
  status: "open" | "reviewing";
  createdAt: string;
  reporterName: string;
  targetExcerpt: string;
  targetAuthorName: string;
};
