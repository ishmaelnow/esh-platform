import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@esh-platform/config";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";
export type {
  CommunityArea,
  CommunityGroup,
  CommunityGroupMembership,
  CommunityOrganization,
  CommunityOrganizationMembership,
  CommunityOrganizationVerification,
  CommunityProviderProfile,
  CommunityProviderVerification,
  CommunityVerificationStatus,
} from "./community.types";
export type SupabaseAuthSession = Session;
export type PlatformSupabaseClient = SupabaseClient<Database>;
export type PublicSupabaseClientConfig = {
  url: string;
  anonKey: string;
  auth?: {
    detectSessionInUrl?: boolean;
  };
};

export const tenantFoundationTables = [
  "person_profiles",
  "tenants",
  "tenant_configurations",
  "tenant_capabilities",
  "tenant_memberships",
  "tenant_invitations",
  "platform_role_assignments",
  "tenant_role_assignments",
  "tenant_audit_events",
  "active_tenant_preferences",
] as const;

export type TenantFoundationTable = (typeof tenantFoundationTables)[number];

export type TenantFoundationRow<TTable extends TenantFoundationTable> = Tables<TTable>;

export type TenantFoundationInsert<TTable extends TenantFoundationTable> = TablesInsert<TTable>;

export type TenantFoundationUpdate<TTable extends TenantFoundationTable> = TablesUpdate<TTable>;

export type PersonProfileRow = Tables<"person_profiles">;
export type DriverProfileRow = Tables<"driver_profiles">;
export type DriverAvailabilityRow = Tables<"driver_availability">;
export type DriverLocationRow = Tables<"driver_locations">;
export type DriverApplicationRow = Tables<"driver_applications">;
export type DriverEvidenceRow = Tables<"driver_evidence">;
export type DriverEvidenceRequirementRow = Tables<"driver_evidence_requirements">;
export type DriverOnboardingChecklistRow = Tables<"driver_onboarding_checklists">;
export type DriverNotificationPreferenceRow = Tables<"driver_notification_preferences">;
export type NotificationOutboxRow = Tables<"notification_outbox">;
export type PushSubscriptionRow = Tables<"push_subscriptions">;
export type PushDeliveryAttemptRow = Tables<"push_delivery_attempts">;
export type SmsNotificationSubscriptionRow = Tables<"sms_notification_subscriptions">;
export type SmsDeliveryAttemptRow = Tables<"sms_delivery_attempts">;
export type VehicleRow = Tables<"vehicles">;
export type DriverVehicleAssignmentRow = Tables<"driver_vehicle_assignments">;
export type ServiceAreaRow = Tables<"service_areas">;
export type DriverServiceAreaAssignmentRow = Tables<"driver_service_area_assignments">;
export type DispatchBookingRow = Tables<"dispatch_bookings">;
export type DispatchOfferRow = Tables<"dispatch_offers">;
export type TripRatingRow = Tables<"trip_ratings">;
export type CurrencyCodeRow = Tables<"currency_codes">;
export type TenantFinancialSettingsRow = Tables<"tenant_financial_settings">;
export type LedgerAccountRow = Tables<"ledger_accounts">;
export type LedgerTransactionRow = Tables<"ledger_transactions">;
export type LedgerEntryRow = Tables<"ledger_entries">;
export type LedgerTransactionReversalRow = Tables<"ledger_transaction_reversals">;
export type RiderProfileRow = Tables<"rider_profiles">;
export type RiderNotificationPreferenceRow = Tables<"rider_notification_preferences">;
export type TenantSchedulingSettingsRow = Tables<"tenant_scheduling_settings">;
export type TenantMatchingSettingsRow = Tables<"tenant_matching_settings">;
export type TenantPricingSettingsRow = Tables<"tenant_pricing_settings">;
export type TripPriceQuoteRow = Tables<"trip_price_quotes">;
export type TripFareReconciliationRow = Tables<"trip_fare_reconciliations">;
export type TripFareSettlementRow = Tables<"trip_fare_settlements">;
export type TenantDriverEarningsSettingsRow = Tables<"tenant_driver_earnings_settings">;
export type RiderPaymentAttemptRow = Tables<"rider_payment_attempts">;
export type RiderPaymentRefundRow = Tables<"rider_payment_refunds">;
export type RiderPaymentDisputeRow = Tables<"rider_payment_disputes">;
export type RiderWalletEntryRow = Tables<"rider_wallet_entries">;
export type RiderWalletQuoteAllocationRow = Tables<"rider_wallet_quote_allocations">;
export type RiderBookingSeriesRow = Tables<"rider_booking_series">;
export type RiderBookingSeriesOccurrenceRow = Tables<"rider_booking_series_occurrences">;
export type RiderSavedPaymentMethodRow = Tables<"rider_saved_payment_methods">;
export type CompletedTripRefundRecoveryRow = Tables<"completed_trip_refund_recoveries">;
export type DriverPayoutAccountRow = Tables<"driver_payout_accounts">;
export type DriverEarningTransferRow = Tables<"driver_earning_transfers">;
export type DriverBankPayoutRow = Tables<"driver_bank_payouts">;
export type DriverPayoutTransferAllocationRow = Tables<"driver_payout_transfer_allocations">;
export type VehicleEvidenceRow = Tables<"vehicle_evidence">;
export type VehicleEvidenceRequirementRow = Tables<"vehicle_evidence_requirements">;
export type TenantRow = Tables<"tenants">;
export type TenantConfigurationRow = Tables<"tenant_configurations">;
export type TenantCapabilityRow = Tables<"tenant_capabilities">;
export type CapabilityCatalogRow = Tables<"capability_catalog">;
export type CommunityPermissionCatalogRow = Tables<"community_permission_catalog">;
export type CommunityRoleCatalogRow = Tables<"community_role_catalog">;
export type CommunityRolePermissionRow = Tables<"community_role_permissions">;
export type TenantCommunitySettingsRow = Tables<"tenant_community_settings">;
export type TenantCommunityRoleAssignmentRow = Tables<"tenant_community_role_assignments">;
export type TenantMembershipRow = Tables<"tenant_memberships">;
export type TenantInvitationRow = Tables<"tenant_invitations">;
export type PlatformRoleAssignmentRow = Tables<"platform_role_assignments">;
export type TenantRoleAssignmentRow = Tables<"tenant_role_assignments">;
export type TenantAuditEventRow = Tables<"tenant_audit_events">;
export type ActiveTenantPreferenceRow = Tables<"active_tenant_preferences">;

declare global {
  var __eshPlatformBrowserSupabaseClient: PlatformSupabaseClient | undefined;
}

export function createBrowserSupabaseClient(config?: PublicSupabaseClientConfig) {
  if (globalThis.__eshPlatformBrowserSupabaseClient) {
    return globalThis.__eshPlatformBrowserSupabaseClient;
  }

  const { url, anonKey } = config ?? getPublicSupabaseConfig();

  globalThis.__eshPlatformBrowserSupabaseClient = createClient<Database>(url, anonKey);

  return globalThis.__eshPlatformBrowserSupabaseClient;
}

export function createIsolatedBrowserSupabaseClient(
  storageKey: string,
  config?: PublicSupabaseClientConfig,
) {
  const { url, anonKey } = config ?? getPublicSupabaseConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: config?.auth?.detectSessionInUrl ?? true,
      persistSession: true,
      storageKey,
    },
  });
}

export function createAuthenticatedSupabaseClient(
  accessToken: string,
  source: NodeJS.ProcessEnv = process.env,
) {
  const { url, anonKey } = getPublicSupabaseConfig(source);

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createAnonymousSupabaseClient(source: NodeJS.ProcessEnv = process.env) {
  const { url, anonKey } = getPublicSupabaseConfig(source);

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createServiceSupabaseClient(source: NodeJS.ProcessEnv = process.env) {
  const { url } = getPublicSupabaseConfig(source);
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service Supabase access.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
