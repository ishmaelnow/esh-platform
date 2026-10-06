export type NativePushRegistration = {
  registration_id: string; tenant_id: string; person_id: string; auth_user_id: string; auth_session_id: string;
  rider_profile_id: string | null; driver_profile_id: string | null; installation_id: string;
  product: string; platform: string; device_token: string; status: string;
  created_at: string; refreshed_at: string; disabled_at: string | null;
};
export type NativePushAttempt = {
  attempt_id: string; tenant_id: string; notification_id: string; registration_id: string;
  status: string; attempt_count: number; claim_id: string | null; claimed_at: string | null;
  next_attempt_at: string; expires_at: string; response_status: number | null;
  failure_code: string | null; accepted_at: string | null; created_at: string;
};
