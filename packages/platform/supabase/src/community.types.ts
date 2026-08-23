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
