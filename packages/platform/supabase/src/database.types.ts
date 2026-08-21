export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      active_tenant_preferences: {
        Row: {
          membership_id: string
          person_id: string
          selected_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          membership_id: string
          person_id: string
          selected_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          membership_id?: string
          person_id?: string
          selected_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_tenant_preferences_membership_id_tenant_id_fkey"
            columns: ["membership_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["membership_id", "tenant_id"]
          },
          {
            foreignKeyName: "active_tenant_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      driver_applications: {
        Row: {
          applicant_auth_user_id: string | null
          application_status: string
          created_at: string
          document_path: string | null
          driver_application_id: string
          driver_profile_id: string | null
          email: string
          email_verified_at: string | null
          full_name: string
          personal_photo_path: string | null
          phone: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_person_id: string | null
          submitted_at: string
          tenant_id: string
          updated_at: string
          vehicle_photo_path: string | null
        }
        Insert: {
          applicant_auth_user_id?: string | null
          application_status?: string
          created_at?: string
          document_path?: string | null
          driver_application_id?: string
          driver_profile_id?: string | null
          email: string
          email_verified_at?: string | null
          full_name: string
          personal_photo_path?: string | null
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          submitted_at?: string
          tenant_id: string
          updated_at?: string
          vehicle_photo_path?: string | null
        }
        Update: {
          applicant_auth_user_id?: string | null
          application_status?: string
          created_at?: string
          document_path?: string | null
          driver_application_id?: string
          driver_profile_id?: string | null
          email?: string
          email_verified_at?: string | null
          full_name?: string
          personal_photo_path?: string | null
          phone?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          submitted_at?: string
          tenant_id?: string
          updated_at?: string
          vehicle_photo_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_applications_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "driver_applications_reviewed_by_person_id_fkey"
            columns: ["reviewed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "driver_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      driver_availability: {
        Row: {
          created_at: string
          driver_profile_id: string
          last_offline_at: string
          last_online_at: string | null
          requested_status: string
          selected_service_area_id: string | null
          status_changed_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_profile_id: string
          last_offline_at?: string
          last_online_at?: string | null
          requested_status?: string
          selected_service_area_id?: string | null
          status_changed_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_profile_id?: string
          last_offline_at?: string
          last_online_at?: string | null
          requested_status?: string
          selected_service_area_id?: string | null
          status_changed_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_availability_selected_service_area_fk"
            columns: ["tenant_id", "selected_service_area_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["tenant_id", "service_area_id"]
          },
          {
            foreignKeyName: "driver_availability_driver_fk"
            columns: ["tenant_id", "driver_profile_id"]
            isOneToOne: true
            referencedRelation: "driver_profiles"
            referencedColumns: ["tenant_id", "driver_profile_id"]
          },
          {
            foreignKeyName: "driver_availability_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: true
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "driver_availability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      dispatch_bookings: {
        Row: {
          booking_id: string
          booking_notes: string | null
          cancelled_at: string | null
          completed_at: string | null
          completed_by_person_id: string | null
          completion_reason: string | null
          created_at: string
          created_by_person_id: string
          current_driver_profile_id: string | null
          current_vehicle_id: string | null
          customer_name: string
          customer_phone: string | null
          destination_address: string
          destination_latitude: number | null
          destination_longitude: number | null
          driver_earnings_minor: number | null
          driver_earnings_reversed_at: string | null
          driver_earnings_reversal_reason: string | null
          estimated_fare_minor: number | null
          fare_currency_code: string | null
          final_fare_minor: number | null
          earnings_share_basis_points: number | null
          dispatch_ready_at: string | null
          geocoded_at: string | null
          geocoding_provider: string | null
          pickup_address: string
          platform_fee_minor: number | null
          pickup_latitude: number | null
          pickup_longitude: number | null
          price_quote_id: string | null
          rider_profile_id: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          requested_service_type: string
          scheduled_pickup_at: string | null
          service_area_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          booking_id?: string
          booking_notes?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by_person_id?: string | null
          completion_reason?: string | null
          created_at?: string
          created_by_person_id: string
          current_driver_profile_id?: string | null
          current_vehicle_id?: string | null
          customer_name: string
          customer_phone?: string | null
          destination_address: string
          destination_latitude?: number | null
          destination_longitude?: number | null
          driver_earnings_minor?: number | null
          driver_earnings_reversed_at?: string | null
          driver_earnings_reversal_reason?: string | null
          estimated_fare_minor?: number | null
          fare_currency_code?: string | null
          final_fare_minor?: number | null
          earnings_share_basis_points?: number | null
          dispatch_ready_at?: string | null
          geocoded_at?: string | null
          geocoding_provider?: string | null
          pickup_address: string
          platform_fee_minor?: number | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          price_quote_id?: string | null
          rider_profile_id?: string | null
          route_distance_meters?: number | null
          route_duration_seconds?: number | null
          requested_service_type?: string
          scheduled_pickup_at?: string | null
          service_area_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          booking_notes?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          completed_by_person_id?: string | null
          completion_reason?: string | null
          created_at?: string
          created_by_person_id?: string
          current_driver_profile_id?: string | null
          current_vehicle_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          destination_address?: string
          destination_latitude?: number | null
          destination_longitude?: number | null
          driver_earnings_minor?: number | null
          driver_earnings_reversed_at?: string | null
          driver_earnings_reversal_reason?: string | null
          estimated_fare_minor?: number | null
          fare_currency_code?: string | null
          final_fare_minor?: number | null
          earnings_share_basis_points?: number | null
          dispatch_ready_at?: string | null
          geocoded_at?: string | null
          geocoding_provider?: string | null
          pickup_address?: string
          platform_fee_minor?: number | null
          pickup_latitude?: number | null
          pickup_longitude?: number | null
          price_quote_id?: string | null
          rider_profile_id?: string | null
          route_distance_meters?: number | null
          route_duration_seconds?: number | null
          requested_service_type?: string
          scheduled_pickup_at?: string | null
          service_area_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rider_profiles: {
        Row: {
          accessibility_notes: string | null
          created_at: string
          display_name: string
          email: string
          person_id: string
          phone: string | null
          rider_profile_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accessibility_notes?: string | null
          created_at?: string
          display_name: string
          email: string
          person_id: string
          phone?: string | null
          rider_profile_id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accessibility_notes?: string | null
          created_at?: string
          display_name?: string
          email?: string
          person_id?: string
          phone?: string | null
          rider_profile_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rider_payment_attempts: {
        Row: { amount_minor: number; booking_id: string | null; created_at: string; currency_code: string; failure_message: string | null; paid_at: string | null; payment_attempt_id: string; provider: string; provider_checkout_session_id: string; provider_payment_intent_id: string | null; quote_id: string; rider_profile_id: string; status: string; tenant_id: string; updated_at: string }
        Insert: { amount_minor: number; booking_id?: string | null; created_at?: string; currency_code: string; failure_message?: string | null; paid_at?: string | null; payment_attempt_id?: string; provider?: string; provider_checkout_session_id: string; provider_payment_intent_id?: string | null; quote_id: string; rider_profile_id: string; status?: string; tenant_id: string; updated_at?: string }
        Update: { amount_minor?: number; booking_id?: string | null; created_at?: string; currency_code?: string; failure_message?: string | null; paid_at?: string | null; payment_attempt_id?: string; provider?: string; provider_checkout_session_id?: string; provider_payment_intent_id?: string | null; quote_id?: string; rider_profile_id?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_wallet_entries: {
        Row: { amount_minor: number; booking_id: string | null; created_at: string; created_by_person_id: string | null; currency_code: string; description: string; direction: string; entry_type: string; external_key: string; quote_id: string | null; rider_profile_id: string; rider_wallet_entry_id: string; tenant_id: string }
        Insert: { amount_minor: number; booking_id?: string | null; created_at?: string; created_by_person_id?: string | null; currency_code: string; description: string; direction: string; entry_type: string; external_key: string; quote_id?: string | null; rider_profile_id: string; rider_wallet_entry_id?: string; tenant_id: string }
        Update: { amount_minor?: number; booking_id?: string | null; created_at?: string; created_by_person_id?: string | null; currency_code?: string; description?: string; direction?: string; entry_type?: string; external_key?: string; quote_id?: string | null; rider_profile_id?: string; rider_wallet_entry_id?: string; tenant_id?: string }
        Relationships: []
      }
      rider_wallet_quote_allocations: {
        Row: { amount_minor: number; applied_at: string | null; booking_id: string | null; created_at: string; currency_code: string; quote_id: string; restored_at: string | null; rider_profile_id: string; rider_wallet_quote_allocation_id: string; status: string; tenant_id: string; updated_at: string }
        Insert: { amount_minor: number; applied_at?: string | null; booking_id?: string | null; created_at?: string; currency_code: string; quote_id: string; restored_at?: string | null; rider_profile_id: string; rider_wallet_quote_allocation_id?: string; status?: string; tenant_id: string; updated_at?: string }
        Update: { amount_minor?: number; applied_at?: string | null; booking_id?: string | null; created_at?: string; currency_code?: string; quote_id?: string; restored_at?: string | null; rider_profile_id?: string; rider_wallet_quote_allocation_id?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_booking_series: {
        Row: { autopay_enabled: boolean; autopay_lead_hours: number; rider_saved_payment_method_id: string | null; booking_notes: string | null; cancelled_at: string | null; created_at: string; created_by_person_id: string; destination_address: string; destination_latitude: number; destination_longitude: number; end_date: string; local_pickup_time: string; pickup_address: string; pickup_latitude: number; pickup_longitude: number; rider_booking_series_id: string; rider_profile_id: string; service_area_id: string; start_date: string; status: string; tenant_id: string; time_zone: string; updated_at: string; weekdays: number[] }
        Insert: { autopay_enabled?: boolean; autopay_lead_hours?: number; rider_saved_payment_method_id?: string | null; booking_notes?: string | null; cancelled_at?: string | null; created_at?: string; created_by_person_id: string; destination_address: string; destination_latitude: number; destination_longitude: number; end_date: string; local_pickup_time: string; pickup_address: string; pickup_latitude: number; pickup_longitude: number; rider_booking_series_id?: string; rider_profile_id: string; service_area_id: string; start_date: string; status?: string; tenant_id: string; time_zone: string; updated_at?: string; weekdays: number[] }
        Update: { autopay_enabled?: boolean; autopay_lead_hours?: number; rider_saved_payment_method_id?: string | null; booking_notes?: string | null; cancelled_at?: string | null; created_at?: string; created_by_person_id?: string; destination_address?: string; destination_latitude?: number; destination_longitude?: number; end_date?: string; local_pickup_time?: string; pickup_address?: string; pickup_latitude?: number; pickup_longitude?: number; rider_booking_series_id?: string; rider_profile_id?: string; service_area_id?: string; start_date?: string; status?: string; tenant_id?: string; time_zone?: string; updated_at?: string; weekdays?: number[] }
        Relationships: []
      }
      rider_booking_series_occurrences: {
        Row: { autopay_attempt_count: number; autopay_failure_message: string | null; autopay_last_attempt_at: string | null; autopay_next_retry_at: string | null; autopay_status: string; booking_id: string | null; cancelled_at: string | null; created_at: string; quote_id: string | null; rider_booking_series_id: string; rider_booking_series_occurrence_id: string; rider_profile_id: string; scheduled_pickup_at: string; status: string; tenant_id: string; updated_at: string }
        Insert: { autopay_attempt_count?: number; autopay_failure_message?: string | null; autopay_last_attempt_at?: string | null; autopay_next_retry_at?: string | null; autopay_status?: string; booking_id?: string | null; cancelled_at?: string | null; created_at?: string; quote_id?: string | null; rider_booking_series_id: string; rider_booking_series_occurrence_id?: string; rider_profile_id: string; scheduled_pickup_at: string; status?: string; tenant_id: string; updated_at?: string }
        Update: { autopay_attempt_count?: number; autopay_failure_message?: string | null; autopay_last_attempt_at?: string | null; autopay_next_retry_at?: string | null; autopay_status?: string; booking_id?: string | null; cancelled_at?: string | null; created_at?: string; quote_id?: string | null; rider_booking_series_id?: string; rider_booking_series_occurrence_id?: string; rider_profile_id?: string; scheduled_pickup_at?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_saved_payment_methods: {
        Row: { brand: string | null; created_at: string; expires_month: number | null; expires_year: number | null; last4: string | null; provider: string; provider_customer_id: string; provider_payment_method_id: string; rider_profile_id: string; rider_saved_payment_method_id: string; status: string; tenant_id: string; updated_at: string }
        Insert: { brand?: string | null; created_at?: string; expires_month?: number | null; expires_year?: number | null; last4?: string | null; provider?: string; provider_customer_id: string; provider_payment_method_id: string; rider_profile_id: string; rider_saved_payment_method_id?: string; status?: string; tenant_id: string; updated_at?: string }
        Update: { brand?: string | null; created_at?: string; expires_month?: number | null; expires_year?: number | null; last4?: string | null; provider?: string; provider_customer_id?: string; provider_payment_method_id?: string; rider_profile_id?: string; rider_saved_payment_method_id?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_payment_refunds: {
        Row: { amount_minor: number; booking_id: string; created_at: string; currency_code: string; failure_message: string | null; payment_attempt_id: string; provider: string; provider_refund_id: string | null; reason: string; refund_id: string; refund_scope: string; refunded_at: string | null; status: string; tenant_id: string; updated_at: string }
        Insert: { amount_minor: number; booking_id: string; created_at?: string; currency_code: string; failure_message?: string | null; payment_attempt_id: string; provider?: string; provider_refund_id?: string | null; reason: string; refund_id?: string; refund_scope?: string; refunded_at?: string | null; status?: string; tenant_id: string; updated_at?: string }
        Update: { amount_minor?: number; booking_id?: string; created_at?: string; currency_code?: string; failure_message?: string | null; payment_attempt_id?: string; provider?: string; provider_refund_id?: string | null; reason?: string; refund_id?: string; refund_scope?: string; refunded_at?: string | null; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_payment_disputes: {
        Row: { amount_minor: number; booking_id: string | null; created_at: string; currency_code: string; evidence_due_at: string | null; fee_minor: number; funds_reinstated_at: string | null; funds_reinstated_minor: number; funds_withdrawn_at: string | null; funds_withdrawn_minor: number; payment_attempt_id: string; provider: string; provider_charge_id: string; provider_dispute_id: string; reason: string; rider_payment_dispute_id: string; status: string; tenant_id: string; updated_at: string }
        Insert: { amount_minor: number; booking_id?: string | null; created_at?: string; currency_code: string; evidence_due_at?: string | null; fee_minor?: number; funds_reinstated_at?: string | null; funds_reinstated_minor?: number; funds_withdrawn_at?: string | null; funds_withdrawn_minor?: number; payment_attempt_id: string; provider?: string; provider_charge_id: string; provider_dispute_id: string; reason: string; rider_payment_dispute_id?: string; status: string; tenant_id: string; updated_at?: string }
        Update: { amount_minor?: number; booking_id?: string | null; created_at?: string; currency_code?: string; evidence_due_at?: string | null; fee_minor?: number; funds_reinstated_at?: string | null; funds_reinstated_minor?: number; funds_withdrawn_at?: string | null; funds_withdrawn_minor?: number; payment_attempt_id?: string; provider?: string; provider_charge_id?: string; provider_dispute_id?: string; reason?: string; rider_payment_dispute_id?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      completed_trip_refund_recoveries: {
        Row: { booking_id: string; completed_at: string | null; completed_trip_refund_recovery_id: string; created_at: string; driver_earning_transfer_id: string | null; failure_message: string | null; provider_transfer_reversal_id: string | null; refund_id: string; requested_by_person_id: string; status: string; tenant_id: string; transfer_reversed_at: string | null; updated_at: string }
        Insert: { booking_id: string; completed_at?: string | null; completed_trip_refund_recovery_id?: string; created_at?: string; driver_earning_transfer_id?: string | null; failure_message?: string | null; provider_transfer_reversal_id?: string | null; refund_id: string; requested_by_person_id: string; status?: string; tenant_id: string; transfer_reversed_at?: string | null; updated_at?: string }
        Update: { booking_id?: string; completed_at?: string | null; completed_trip_refund_recovery_id?: string; created_at?: string; driver_earning_transfer_id?: string | null; failure_message?: string | null; provider_transfer_reversal_id?: string | null; refund_id?: string; requested_by_person_id?: string; status?: string; tenant_id?: string; transfer_reversed_at?: string | null; updated_at?: string }
        Relationships: []
      }
      driver_payout_accounts: {
        Row: { charges_enabled: boolean; created_at: string; details_submitted: boolean; disabled_reason: string | null; driver_payout_account_id: string; driver_profile_id: string; onboarding_status: string; payouts_enabled: boolean; provider: string; provider_account_id: string; requirements_currently_due: string[]; requirements_eventually_due: string[]; tenant_id: string; transfers_capability_status: string | null; updated_at: string }
        Insert: { charges_enabled?: boolean; created_at?: string; details_submitted?: boolean; disabled_reason?: string | null; driver_payout_account_id?: string; driver_profile_id: string; onboarding_status?: string; payouts_enabled?: boolean; provider?: string; provider_account_id: string; requirements_currently_due?: string[]; requirements_eventually_due?: string[]; tenant_id: string; transfers_capability_status?: string | null; updated_at?: string }
        Update: { charges_enabled?: boolean; created_at?: string; details_submitted?: boolean; disabled_reason?: string | null; driver_payout_account_id?: string; driver_profile_id?: string; onboarding_status?: string; payouts_enabled?: boolean; provider?: string; provider_account_id?: string; requirements_currently_due?: string[]; requirements_eventually_due?: string[]; tenant_id?: string; transfers_capability_status?: string | null; updated_at?: string }
        Relationships: []
      }
      driver_earning_transfers: {
        Row: { amount_minor: number; booking_id: string; created_at: string; currency_code: string; driver_earning_transfer_id: string; driver_profile_id: string; failure_message: string | null; payment_attempt_id: string; provider: string; provider_transfer_id: string | null; status: string; tenant_id: string; transferred_at: string | null; updated_at: string }
        Insert: { amount_minor: number; booking_id: string; created_at?: string; currency_code: string; driver_earning_transfer_id?: string; driver_profile_id: string; failure_message?: string | null; payment_attempt_id: string; provider?: string; provider_transfer_id?: string | null; status?: string; tenant_id: string; transferred_at?: string | null; updated_at?: string }
        Update: { amount_minor?: number; booking_id?: string; created_at?: string; currency_code?: string; driver_earning_transfer_id?: string; driver_profile_id?: string; failure_message?: string | null; payment_attempt_id?: string; provider?: string; provider_transfer_id?: string | null; status?: string; tenant_id?: string; transferred_at?: string | null; updated_at?: string }
        Relationships: []
      }
      driver_bank_payouts: {
        Row: { amount_minor: number; automatic: boolean; created_at: string; currency_code: string; destination_reference: string | null; driver_bank_payout_id: string; driver_payout_account_id: string; driver_profile_id: string; expected_arrival_at: string | null; failed_at: string | null; failure_code: string | null; failure_message: string | null; matched_amount_minor: number; method: string | null; paid_at: string | null; provider: string; provider_created_at: string; provider_payout_id: string; reconciliation_error: string | null; reconciliation_status: string; reconciled_at: string | null; status: string; tenant_id: string; unmatched_amount_minor: number; updated_at: string }
        Insert: { amount_minor: number; automatic?: boolean; created_at?: string; currency_code: string; destination_reference?: string | null; driver_bank_payout_id?: string; driver_payout_account_id: string; driver_profile_id: string; expected_arrival_at?: string | null; failed_at?: string | null; failure_code?: string | null; failure_message?: string | null; matched_amount_minor?: number; method?: string | null; paid_at?: string | null; provider?: string; provider_created_at: string; provider_payout_id: string; reconciliation_error?: string | null; reconciliation_status?: string; reconciled_at?: string | null; status: string; tenant_id: string; unmatched_amount_minor?: number; updated_at?: string }
        Update: { amount_minor?: number; automatic?: boolean; created_at?: string; currency_code?: string; destination_reference?: string | null; driver_bank_payout_id?: string; driver_payout_account_id?: string; driver_profile_id?: string; expected_arrival_at?: string | null; failed_at?: string | null; failure_code?: string | null; failure_message?: string | null; matched_amount_minor?: number; method?: string | null; paid_at?: string | null; provider?: string; provider_created_at?: string; provider_payout_id?: string; reconciliation_error?: string | null; reconciliation_status?: string; reconciled_at?: string | null; status?: string; tenant_id?: string; unmatched_amount_minor?: number; updated_at?: string }
        Relationships: []
      }
      driver_payout_transfer_allocations: {
        Row: { amount_minor: number; created_at: string; driver_bank_payout_id: string; driver_earning_transfer_id: string; driver_payout_transfer_allocation_id: string; driver_profile_id: string; provider_balance_transaction_id: string; tenant_id: string }
        Insert: { amount_minor: number; created_at?: string; driver_bank_payout_id: string; driver_earning_transfer_id: string; driver_payout_transfer_allocation_id?: string; driver_profile_id: string; provider_balance_transaction_id: string; tenant_id: string }
        Update: { amount_minor?: number; created_at?: string; driver_bank_payout_id?: string; driver_earning_transfer_id?: string; driver_payout_transfer_allocation_id?: string; driver_profile_id?: string; provider_balance_transaction_id?: string; tenant_id?: string }
        Relationships: []
      }
      dispatch_offers: {
        Row: {
          booking_id: string
          driver_profile_id: string
          expires_at: string
          offer_id: string
          offered_at: string
          offer_source: string
          offered_by_person_id: string | null
          responded_at: string | null
          response_notes: string | null
          status: string
          tenant_id: string
          vehicle_id: string
        }
        Insert: {
          booking_id: string
          driver_profile_id: string
          expires_at?: string
          offer_id?: string
          offered_at?: string
          offer_source?: string
          offered_by_person_id?: string | null
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          tenant_id: string
          vehicle_id: string
        }
        Update: {
          booking_id?: string
          driver_profile_id?: string
          expires_at?: string
          offer_id?: string
          offered_at?: string
          offer_source?: string
          offered_by_person_id?: string | null
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          tenant_id?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      driver_evidence: {
        Row: {
          created_at: string
          driver_application_id: string | null
          driver_profile_id: string | null
          evidence_id: string
          evidence_type: string
          expires_on: string | null
          mime_type: string
          original_file_name: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_person_id: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_application_id?: string | null
          driver_profile_id?: string | null
          evidence_id?: string
          evidence_type: string
          expires_on?: string | null
          mime_type: string
          original_file_name: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          submitted_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_application_id?: string | null
          driver_profile_id?: string | null
          evidence_id?: string
          evidence_type?: string
          expires_on?: string | null
          mime_type?: string
          original_file_name?: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          submitted_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_evidence_driver_application_id_fkey"
            columns: ["driver_application_id"]
            isOneToOne: false
            referencedRelation: "driver_applications"
            referencedColumns: ["driver_application_id"]
          },
          {
            foreignKeyName: "driver_evidence_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "driver_evidence_reviewed_by_person_id_fkey"
            columns: ["reviewed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "driver_evidence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      trip_ratings: {
        Row: {
          booking_id: string
          comment: string | null
          criteria: Json
          moderated_at: string | null
          moderated_by_person_id: string | null
          moderation_reason: string | null
          moderation_status: string
          overall_rating: number
          rating_id: string
          reviewer_person_id: string
          reviewer_type: string
          subject_driver_profile_id: string | null
          subject_rider_profile_id: string | null
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          criteria: Json
          moderated_at?: string | null
          moderated_by_person_id?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          overall_rating: number
          rating_id?: string
          reviewer_person_id: string
          reviewer_type: string
          subject_driver_profile_id?: string | null
          subject_rider_profile_id?: string | null
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          criteria?: Json
          moderated_at?: string | null
          moderated_by_person_id?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          overall_rating?: number
          rating_id?: string
          reviewer_person_id?: string
          reviewer_type?: string
          subject_driver_profile_id?: string | null
          subject_rider_profile_id?: string | null
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      trip_rating_appeals: {
        Row: {
          appellant_person_id: string
          appellant_type: string
          booking_id: string
          rating_appeal_id: string
          rating_id: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_person_id: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          appellant_person_id: string
          appellant_type: string
          booking_id: string
          rating_appeal_id?: string
          rating_id: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_person_id?: string | null
          status?: string
          submitted_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          appellant_person_id?: string
          appellant_type?: string
          booking_id?: string
          rating_appeal_id?: string
          rating_id?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_person_id?: string | null
          status?: string
          submitted_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      currency_codes: {
        Row: { currency_code: string; display_name: string; fraction_digits: number }
        Insert: { currency_code: string; display_name: string; fraction_digits: number }
        Update: { currency_code?: string; display_name?: string; fraction_digits?: number }
        Relationships: []
      }
      tenant_financial_settings: {
        Row: { created_at: string; created_by_person_id: string | null; operating_currency: string; tenant_id: string }
        Insert: { created_at?: string; created_by_person_id?: string | null; operating_currency: string; tenant_id: string }
        Update: { created_at?: string; created_by_person_id?: string | null; operating_currency?: string; tenant_id?: string }
        Relationships: []
      }
      ledger_accounts: {
        Row: { account_code: string; account_id: string; account_name: string; account_type: string; created_at: string; created_by_person_id: string | null; currency_code: string; driver_profile_id: string | null; normal_balance: string; status: string; tenant_id: string }
        Insert: { account_code: string; account_id?: string; account_name: string; account_type: string; created_at?: string; created_by_person_id?: string | null; currency_code: string; driver_profile_id?: string | null; normal_balance: string; status?: string; tenant_id: string }
        Update: { account_code?: string; account_id?: string; account_name?: string; account_type?: string; created_at?: string; created_by_person_id?: string | null; currency_code?: string; driver_profile_id?: string | null; normal_balance?: string; status?: string; tenant_id?: string }
        Relationships: []
      }
      ledger_transactions: {
        Row: { booking_id: string | null; created_at: string; created_by_person_id: string; description: string; effective_at: string; external_key: string; request_fingerprint: string; tenant_id: string; transaction_id: string }
        Insert: { booking_id?: string | null; created_at?: string; created_by_person_id: string; description: string; effective_at: string; external_key: string; request_fingerprint: string; tenant_id: string; transaction_id?: string }
        Update: { booking_id?: string | null; created_at?: string; created_by_person_id?: string; description?: string; effective_at?: string; external_key?: string; request_fingerprint?: string; tenant_id?: string; transaction_id?: string }
        Relationships: []
      }
      ledger_entries: {
        Row: { account_id: string; created_at: string; credit_amount_minor: number; debit_amount_minor: number; entry_id: string; entry_sequence: number; memo: string | null; tenant_id: string; transaction_id: string }
        Insert: { account_id: string; created_at?: string; credit_amount_minor?: number; debit_amount_minor?: number; entry_id?: string; entry_sequence: number; memo?: string | null; tenant_id: string; transaction_id: string }
        Update: { account_id?: string; created_at?: string; credit_amount_minor?: number; debit_amount_minor?: number; entry_id?: string; entry_sequence?: number; memo?: string | null; tenant_id?: string; transaction_id?: string }
        Relationships: []
      }
      ledger_transaction_reversals: {
        Row: { created_at: string; created_by_person_id: string; ledger_transaction_reversal_id: string; original_transaction_id: string; reason: string; reversal_transaction_id: string; tenant_id: string }
        Insert: { created_at?: string; created_by_person_id: string; ledger_transaction_reversal_id?: string; original_transaction_id: string; reason: string; reversal_transaction_id: string; tenant_id: string }
        Update: { created_at?: string; created_by_person_id?: string; ledger_transaction_reversal_id?: string; original_transaction_id?: string; reason?: string; reversal_transaction_id?: string; tenant_id?: string }
        Relationships: []
      }
      tenant_driver_earnings_settings: {
        Row: { created_at: string; driver_share_basis_points: number; tenant_id: string; updated_at: string; updated_by_person_id: string }
        Insert: { created_at?: string; driver_share_basis_points?: number; tenant_id: string; updated_at?: string; updated_by_person_id: string }
        Update: { created_at?: string; driver_share_basis_points?: number; tenant_id?: string; updated_at?: string; updated_by_person_id?: string }
        Relationships: []
      }
      driver_evidence_requirements: {
        Row: {
          created_at: string
          evidence_type: string
          expiration_required: boolean
          required_for_activation: boolean
          tenant_id: string
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          created_at?: string
          evidence_type: string
          expiration_required?: boolean
          required_for_activation?: boolean
          tenant_id: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          created_at?: string
          evidence_type?: string
          expiration_required?: boolean
          required_for_activation?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_evidence_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "driver_evidence_requirements_updated_by_person_id_fkey"
            columns: ["updated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      driver_onboarding_checklists: {
        Row: {
          created_at: string
          documents_reviewed: boolean
          driver_profile_id: string
          personal_details_complete: boolean
          personal_photo_complete: boolean
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_person_id: string | null
          tenant_id: string
          updated_at: string
          vehicle_details_complete: boolean
          vehicle_photo_complete: boolean
        }
        Insert: {
          created_at?: string
          documents_reviewed?: boolean
          driver_profile_id: string
          personal_details_complete?: boolean
          personal_photo_complete?: boolean
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          tenant_id: string
          updated_at?: string
          vehicle_details_complete?: boolean
          vehicle_photo_complete?: boolean
        }
        Update: {
          created_at?: string
          documents_reviewed?: boolean
          driver_profile_id?: string
          personal_details_complete?: boolean
          personal_photo_complete?: boolean
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          tenant_id?: string
          updated_at?: string
          vehicle_details_complete?: boolean
          vehicle_photo_complete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "driver_onboarding_checklists_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: true
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "driver_onboarding_checklists_reviewed_by_person_id_fkey"
            columns: ["reviewed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "driver_onboarding_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          created_at: string
          created_by_person_id: string
          display_name: string
          driver_number: string
          driver_profile_id: string
          email: string | null
          onboarding_date: string | null
          person_id: string | null
          phone: string | null
          status: string
          status_reason: string | null
          service_type: string
          tenant_id: string
          updated_at: string
          updated_by_person_id: string
        }
        Insert: {
          created_at?: string
          created_by_person_id: string
          display_name: string
          driver_number: string
          driver_profile_id?: string
          email?: string | null
          onboarding_date?: string | null
          person_id?: string | null
          phone?: string | null
          status?: string
          status_reason?: string | null
          service_type?: string
          tenant_id: string
          updated_at?: string
          updated_by_person_id: string
        }
        Update: {
          created_at?: string
          created_by_person_id?: string
          display_name?: string
          driver_number?: string
          driver_profile_id?: string
          email?: string | null
          onboarding_date?: string | null
          person_id?: string | null
          phone?: string | null
          status?: string
          status_reason?: string | null
          service_type?: string
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_created_by_person_id_fkey"
            columns: ["created_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "driver_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "driver_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "driver_profiles_updated_by_person_id_fkey"
            columns: ["updated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      driver_vehicle_assignments: {
        Row: {
          assigned_at: string
          assignment_id: string
          assignment_notes: string | null
          created_at: string
          created_by_person_id: string
          driver_profile_id: string
          ended_at: string | null
          ended_by_person_id: string | null
          tenant_id: string
          vehicle_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_id?: string
          assignment_notes?: string | null
          created_at?: string
          created_by_person_id: string
          driver_profile_id: string
          ended_at?: string | null
          ended_by_person_id?: string | null
          tenant_id: string
          vehicle_id: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          assignment_notes?: string | null
          created_at?: string
          created_by_person_id?: string
          driver_profile_id?: string
          ended_at?: string | null
          ended_by_person_id?: string | null
          tenant_id?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy_meters: number | null
          consented_at: string | null
          driver_profile_id: string
          latitude: number | null
          longitude: number | null
          recorded_at: string | null
          service_area_id: string | null
          sharing_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accuracy_meters?: number | null
          consented_at?: string | null
          driver_profile_id: string
          latitude?: number | null
          longitude?: number | null
          recorded_at?: string | null
          service_area_id?: string | null
          sharing_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accuracy_meters?: number | null
          consented_at?: string | null
          driver_profile_id?: string
          latitude?: number | null
          longitude?: number | null
          recorded_at?: string | null
          service_area_id?: string | null
          sharing_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_service_area_assignments: {
        Row: {
          assigned_at: string
          assignment_id: string
          assignment_notes: string | null
          created_at: string
          created_by_person_id: string
          driver_profile_id: string
          ended_at: string | null
          ended_by_person_id: string | null
          service_area_id: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_id?: string
          assignment_notes?: string | null
          created_at?: string
          created_by_person_id: string
          driver_profile_id: string
          ended_at?: string | null
          ended_by_person_id?: string | null
          service_area_id: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          assignment_notes?: string | null
          created_at?: string
          created_by_person_id?: string
          driver_profile_id?: string
          ended_at?: string | null
          ended_by_person_id?: string | null
          service_area_id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          center_latitude: number
          center_longitude: number
          coverage_mode: string
          created_at: string
          created_by_person_id: string
          description: string | null
          name: string
          radius_km: number
          service_area_id: string
          status: string
          tenant_id: string
          updated_at: string
          updated_by_person_id: string
        }
        Insert: {
          center_latitude: number
          center_longitude: number
          coverage_mode?: string
          created_at?: string
          created_by_person_id: string
          description?: string | null
          name: string
          radius_km: number
          service_area_id?: string
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by_person_id: string
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          coverage_mode?: string
          created_at?: string
          created_by_person_id?: string
          description?: string | null
          name?: string
          radius_km?: number
          service_area_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string
          created_at: string
          created_by_person_id: string
          license_plate: string
          make: string
          model: string
          model_year: number
          photo_mime_type: string | null
          photo_original_file_name: string | null
          photo_size_bytes: number | null
          photo_storage_bucket: string | null
          photo_storage_path: string | null
          status: string
          status_reason: string | null
          service_type: string
          tenant_id: string
          updated_at: string
          updated_by_person_id: string
          vehicle_id: string
          vehicle_number: string
          vin: string
        }
        Insert: {
          color: string
          created_at?: string
          created_by_person_id: string
          license_plate: string
          make: string
          model: string
          model_year: number
          photo_mime_type?: string | null
          photo_original_file_name?: string | null
          photo_size_bytes?: number | null
          photo_storage_bucket?: string | null
          photo_storage_path?: string | null
          status?: string
          status_reason?: string | null
          service_type?: string
          tenant_id: string
          updated_at?: string
          updated_by_person_id: string
          vehicle_id?: string
          vehicle_number: string
          vin: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by_person_id?: string
          license_plate?: string
          make?: string
          model?: string
          model_year?: number
          photo_mime_type?: string | null
          photo_original_file_name?: string | null
          photo_size_bytes?: number | null
          photo_storage_bucket?: string | null
          photo_storage_path?: string | null
          status?: string
          status_reason?: string | null
          service_type?: string
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string
          vehicle_id?: string
          vehicle_number?: string
          vin?: string
        }
        Relationships: []
      }
      vehicle_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          evidence_type: string
          expires_on: string | null
          mime_type: string
          original_file_name: string
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_person_id: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          submitted_at: string
          submitted_by_person_id: string | null
          tenant_id: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          evidence_id?: string
          evidence_type: string
          expires_on?: string | null
          mime_type: string
          original_file_name: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          submitted_at?: string
          submitted_by_person_id?: string | null
          tenant_id: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          evidence_type?: string
          expires_on?: string | null
          mime_type?: string
          original_file_name?: string
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_person_id?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          submitted_at?: string
          submitted_by_person_id?: string | null
          tenant_id?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicle_evidence_requirements: {
        Row: {
          created_at: string
          evidence_type: string
          expiration_required: boolean
          required_for_service: boolean
          tenant_id: string
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          created_at?: string
          evidence_type: string
          expiration_required?: boolean
          required_for_service?: boolean
          tenant_id: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          created_at?: string
          evidence_type?: string
          expiration_required?: boolean
          required_for_service?: boolean
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: []
      }
      driver_notification_preferences: {
        Row: {
          created_at: string
          driver_profile_id: string
          earnings_updates_enabled: boolean
          expiration_reminders_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_profile_id: string
          earnings_updates_enabled?: boolean
          expiration_reminders_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_profile_id?: string
          earnings_updates_enabled?: boolean
          expiration_reminders_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_notification_preferences_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: true
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "driver_notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          delivery_error: string | null
          delivery_status: string
          driver_profile_id: string | null
          last_attempted_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          person_id: string | null
          provider_message_id: string | null
          recipient_email: string
          rider_profile_id: string | null
          sent_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          driver_profile_id?: string | null
          last_attempted_at?: string | null
          notification_id?: string
          notification_type: string
          payload?: Json
          person_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          rider_profile_id?: string | null
          sent_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          delivery_error?: string | null
          delivery_status?: string
          driver_profile_id?: string | null
          last_attempted_at?: string | null
          notification_id?: string
          notification_type?: string
          payload?: Json
          person_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          rider_profile_id?: string | null
          sent_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["driver_profile_id"]
          },
          {
            foreignKeyName: "notification_outbox_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "notification_outbox_rider_fk"
            columns: ["tenant_id", "rider_profile_id"]
            isOneToOne: false
            referencedRelation: "rider_profiles"
            referencedColumns: ["tenant_id", "rider_profile_id"]
          },
          {
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      push_subscriptions: {
        Row: { auth_key: string; created_at: string; disabled_at: string | null; driver_profile_id: string | null; endpoint: string; last_used_at: string | null; p256dh_key: string; person_id: string; push_subscription_id: string; rider_profile_id: string | null; status: string; tenant_id: string; updated_at: string; user_agent: string | null }
        Insert: { auth_key: string; created_at?: string; disabled_at?: string | null; driver_profile_id?: string | null; endpoint: string; last_used_at?: string | null; p256dh_key: string; person_id: string; push_subscription_id?: string; rider_profile_id?: string | null; status?: string; tenant_id: string; updated_at?: string; user_agent?: string | null }
        Update: { auth_key?: string; created_at?: string; disabled_at?: string | null; driver_profile_id?: string | null; endpoint?: string; last_used_at?: string | null; p256dh_key?: string; person_id?: string; push_subscription_id?: string; rider_profile_id?: string | null; status?: string; tenant_id?: string; updated_at?: string; user_agent?: string | null }
        Relationships: []
      }
      push_delivery_attempts: {
        Row: { attempt_count: number; created_at: string; delivered_at: string | null; failure_message: string | null; notification_id: string; push_delivery_attempt_id: string; push_subscription_id: string; response_status: number | null; status: string; tenant_id: string; updated_at: string }
        Insert: { attempt_count?: number; created_at?: string; delivered_at?: string | null; failure_message?: string | null; notification_id: string; push_delivery_attempt_id?: string; push_subscription_id: string; response_status?: number | null; status?: string; tenant_id: string; updated_at?: string }
        Update: { attempt_count?: number; created_at?: string; delivered_at?: string | null; failure_message?: string | null; notification_id?: string; push_delivery_attempt_id?: string; push_subscription_id?: string; response_status?: number | null; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      sms_notification_subscriptions: {
        Row: { consented_at: string; created_at: string; disabled_at: string | null; driver_profile_id: string | null; person_id: string; phone_e164: string; rider_profile_id: string | null; sms_subscription_id: string; status: string; tenant_id: string; updated_at: string; verified_at: string }
        Insert: { consented_at?: string; created_at?: string; disabled_at?: string | null; driver_profile_id?: string | null; person_id: string; phone_e164: string; rider_profile_id?: string | null; sms_subscription_id?: string; status?: string; tenant_id: string; updated_at?: string; verified_at?: string }
        Update: { consented_at?: string; created_at?: string; disabled_at?: string | null; driver_profile_id?: string | null; person_id?: string; phone_e164?: string; rider_profile_id?: string | null; sms_subscription_id?: string; status?: string; tenant_id?: string; updated_at?: string; verified_at?: string }
        Relationships: []
      }
      sms_delivery_attempts: {
        Row: { attempt_count: number; created_at: string; delivered_at: string | null; failure_message: string | null; notification_id: string; provider_message_id: string | null; provider_status: string | null; sms_delivery_attempt_id: string; sms_subscription_id: string; status: string; tenant_id: string; updated_at: string }
        Insert: { attempt_count?: number; created_at?: string; delivered_at?: string | null; failure_message?: string | null; notification_id: string; provider_message_id?: string | null; provider_status?: string | null; sms_delivery_attempt_id?: string; sms_subscription_id: string; status?: string; tenant_id: string; updated_at?: string }
        Update: { attempt_count?: number; created_at?: string; delivered_at?: string | null; failure_message?: string | null; notification_id?: string; provider_message_id?: string | null; provider_status?: string | null; sms_delivery_attempt_id?: string; sms_subscription_id?: string; status?: string; tenant_id?: string; updated_at?: string }
        Relationships: []
      }
      rider_notification_preferences: {
        Row: {
          created_at: string
          payment_updates_enabled: boolean
          rider_profile_id: string
          tenant_id: string
          trip_updates_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          payment_updates_enabled?: boolean
          rider_profile_id: string
          tenant_id: string
          trip_updates_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          payment_updates_enabled?: boolean
          rider_profile_id?: string
          tenant_id?: string
          trip_updates_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      tenant_pricing_settings: {
        Row: { base_fare_minor: number; created_at: string; currency_code: string; minimum_fare_minor: number; per_mile_minor: number; per_minute_minor: number; pricing_enabled: boolean; service_type_surcharges: Json; tenant_id: string; updated_at: string; updated_by_person_id: string }
        Insert: { base_fare_minor?: number; created_at?: string; currency_code: string; minimum_fare_minor?: number; per_mile_minor?: number; per_minute_minor?: number; pricing_enabled?: boolean; service_type_surcharges?: Json; tenant_id: string; updated_at?: string; updated_by_person_id: string }
        Update: { base_fare_minor?: number; created_at?: string; currency_code?: string; minimum_fare_minor?: number; per_mile_minor?: number; per_minute_minor?: number; pricing_enabled?: boolean; service_type_surcharges?: Json; tenant_id?: string; updated_at?: string; updated_by_person_id?: string }
        Relationships: []
      }
      toll_authorities: {
        Row: { active: boolean; authority_id: string; code: string; created_at: string; default_currency_code: string; name: string; source_url: string }
        Insert: { active?: boolean; authority_id?: string; code: string; created_at?: string; default_currency_code: string; name: string; source_url: string }
        Update: { active?: boolean; authority_id?: string; code?: string; created_at?: string; default_currency_code?: string; name?: string; source_url?: string }
        Relationships: []
      }
      toll_facilities: {
        Row: { active: boolean; authority_id: string; created_at: string; facility_code: string; facility_id: string; facility_type: string; mapbox_latitude: number | null; mapbox_longitude: number | null; name: string }
        Insert: { active?: boolean; authority_id: string; created_at?: string; facility_code: string; facility_id?: string; facility_type: string; mapbox_latitude?: number | null; mapbox_longitude?: number | null; name: string }
        Update: { active?: boolean; authority_id?: string; created_at?: string; facility_code?: string; facility_id?: string; facility_type?: string; mapbox_latitude?: number | null; mapbox_longitude?: number | null; name?: string }
        Relationships: []
      }
      toll_facility_aliases: {
        Row: { alias_id: string; alias_text: string; created_at: string; facility_id: string; mapbox_type: string | null; normalized_alias: string }
        Insert: { alias_id?: string; alias_text: string; created_at?: string; facility_id: string; mapbox_type?: string | null; normalized_alias: string }
        Update: { alias_id?: string; alias_text?: string; created_at?: string; facility_id?: string; mapbox_type?: string | null; normalized_alias?: string }
        Relationships: []
      }
      toll_rates: {
        Row: { amount_minor: number; created_at: string; currency_code: string; day_of_week_mask: number | null; direction: string; effective_from: string; effective_to: string | null; facility_id: string; local_end_time: string | null; local_start_time: string | null; payment_method: string; rate_id: string; source_reference: string | null; source_url: string; timezone: string | null; vehicle_class: string }
        Insert: { amount_minor: number; created_at?: string; currency_code: string; day_of_week_mask?: number | null; direction: string; effective_from: string; effective_to?: string | null; facility_id: string; local_end_time?: string | null; local_start_time?: string | null; payment_method: string; rate_id?: string; source_reference?: string | null; source_url: string; timezone?: string | null; vehicle_class: string }
        Update: { amount_minor?: number; created_at?: string; currency_code?: string; day_of_week_mask?: number | null; direction?: string; effective_from?: string; effective_to?: string | null; facility_id?: string; local_end_time?: string | null; local_start_time?: string | null; payment_method?: string; rate_id?: string; source_reference?: string | null; source_url?: string; timezone?: string | null; vehicle_class?: string }
        Relationships: []
      }
      trip_price_quotes: {
        Row: { booking_id: string | null; created_at: string; currency_code: string; destination_address: string; destination_latitude: number; destination_longitude: number; expires_at: string; fare_amount_minor: number; pickup_address: string; pickup_latitude: number; pickup_longitude: number; pricing_snapshot: Json; quote_id: string; rider_profile_id: string; route_distance_meters: number; route_duration_seconds: number; service_area_id: string; service_type: string; status: string; tenant_id: string }
        Insert: { booking_id?: string | null; created_at?: string; currency_code: string; destination_address: string; destination_latitude: number; destination_longitude: number; expires_at: string; fare_amount_minor: number; pickup_address: string; pickup_latitude: number; pickup_longitude: number; pricing_snapshot: Json; quote_id?: string; rider_profile_id: string; route_distance_meters: number; route_duration_seconds: number; service_area_id: string; service_type?: string; status?: string; tenant_id: string }
        Update: { booking_id?: string | null; created_at?: string; currency_code?: string; destination_address?: string; destination_latitude?: number; destination_longitude?: number; expires_at?: string; fare_amount_minor?: number; pickup_address?: string; pickup_latitude?: number; pickup_longitude?: number; pricing_snapshot?: Json; quote_id?: string; rider_profile_id?: string; route_distance_meters?: number; route_duration_seconds?: number; service_area_id?: string; service_type?: string; status?: string; tenant_id?: string }
        Relationships: []
      }
      trip_route_metrics: {
        Row: { booking_id: string; distance_meters: number; driver_profile_id: string; invalid_segment_count: number; last_latitude: number | null; last_longitude: number | null; last_recorded_at: string | null; last_segment_speed_mps: number | null; started_at: string; telemetry_status: string; tenant_id: string }
        Insert: { booking_id: string; distance_meters?: number; driver_profile_id: string; invalid_segment_count?: number; last_latitude?: number | null; last_longitude?: number | null; last_recorded_at?: string | null; last_segment_speed_mps?: number | null; started_at?: string; telemetry_status?: string; tenant_id: string }
        Update: { booking_id?: string; distance_meters?: number; driver_profile_id?: string; invalid_segment_count?: number; last_latitude?: number | null; last_longitude?: number | null; last_recorded_at?: string | null; last_segment_speed_mps?: number | null; started_at?: string; telemetry_status?: string; tenant_id?: string }
        Relationships: []
      }
      trip_fare_reconciliations: {
        Row: { adjustment_minor: number; actual_distance_meters: number; actual_duration_seconds: number; booking_id: string; calculated_fare_minor: number; created_at: string; currency_code: string; quoted_distance_meters: number; quoted_duration_seconds: number; quoted_fare_minor: number; reconciliation_id: string; review_note: string | null; reviewed_at: string | null; reviewed_by_person_id: string | null; source: string; status: string; tenant_id: string }
        Insert: { adjustment_minor: number; actual_distance_meters: number; actual_duration_seconds: number; booking_id: string; calculated_fare_minor: number; created_at?: string; currency_code: string; quoted_distance_meters: number; quoted_duration_seconds: number; quoted_fare_minor: number; reconciliation_id?: string; review_note?: string | null; reviewed_at?: string | null; reviewed_by_person_id?: string | null; source: string; status?: string; tenant_id: string }
        Update: { adjustment_minor?: number; actual_distance_meters?: number; actual_duration_seconds?: number; booking_id?: string; calculated_fare_minor?: number; created_at?: string; currency_code?: string; quoted_distance_meters?: number; quoted_duration_seconds?: number; quoted_fare_minor?: number; reconciliation_id?: string; review_note?: string | null; reviewed_at?: string | null; reviewed_by_person_id?: string | null; source?: string; status?: string; tenant_id?: string }
        Relationships: []
      }
      trip_fare_settlements: {
        Row: { amount_minor: number; booking_id: string; created_at: string; currency_code: string; direction: string; failure_message: string | null; provider_reference: string | null; reconciliation_id: string; settled_at: string | null; settlement_id: string; status: string; tenant_id: string }
        Insert: { amount_minor: number; booking_id: string; created_at?: string; currency_code: string; direction: string; failure_message?: string | null; provider_reference?: string | null; reconciliation_id: string; settled_at?: string | null; settlement_id?: string; status?: string; tenant_id: string }
        Update: { amount_minor?: number; booking_id?: string; created_at?: string; currency_code?: string; direction?: string; failure_message?: string | null; provider_reference?: string | null; reconciliation_id?: string; settled_at?: string | null; settlement_id?: string; status?: string; tenant_id?: string }
        Relationships: []
      }
      tenant_scheduling_settings: {
        Row: {
          created_at: string
          dispatch_lead_minutes: number
          maximum_advance_days: number
          minimum_notice_minutes: number
          reminder_lead_hours: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispatch_lead_minutes?: number
          maximum_advance_days?: number
          minimum_notice_minutes?: number
          reminder_lead_hours?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispatch_lead_minutes?: number
          maximum_advance_days?: number
          minimum_notice_minutes?: number
          reminder_lead_hours?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_matching_settings: {
        Row: {
          automatic_matching_enabled: boolean
          created_at: string
          maximum_attempts: number
          offer_duration_seconds: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          automatic_matching_enabled?: boolean
          created_at?: string
          maximum_attempts?: number
          offer_duration_seconds?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          automatic_matching_enabled?: boolean
          created_at?: string
          maximum_attempts?: number
          offer_duration_seconds?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      person_profiles: {
        Row: {
          activated_at: string | null
          anonymized_at: string | null
          auth_user_id: string | null
          created_at: string
          deactivated_at: string | null
          deleted_at: string | null
          display_name: string | null
          locale: string | null
          normalized_email: string
          person_id: string
          primary_email: string
          status: string
          suspended_at: string | null
          time_zone: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          anonymized_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          locale?: string | null
          normalized_email: string
          person_id?: string
          primary_email: string
          status?: string
          suspended_at?: string | null
          time_zone?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          anonymized_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          locale?: string | null
          normalized_email?: string
          person_id?: string
          primary_email?: string
          status?: string
          suspended_at?: string | null
          time_zone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_role_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by_person_id: string | null
          assignment_id: string
          created_at: string
          expires_at: string | null
          person_id: string
          revoked_at: string | null
          revoked_by_person_id: string | null
          role_key: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by_person_id?: string | null
          assignment_id?: string
          created_at?: string
          expires_at?: string | null
          person_id: string
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          role_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by_person_id?: string | null
          assignment_id?: string
          created_at?: string
          expires_at?: string | null
          person_id?: string
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          role_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_assignments_assigned_by_person_id_fkey"
            columns: ["assigned_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "platform_role_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "platform_role_assignments_revoked_by_person_id_fkey"
            columns: ["revoked_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      tenant_audit_events: {
        Row: {
          actor_person_id: string | null
          actor_platform_roles: string[]
          actor_type: string
          audit_event_id: string
          correlation_id: string
          created_at: string
          event_name: string
          metadata: Json
          occurred_at: string
          reason: string
          resource_id: string
          resource_type: string
          tenant_id: string | null
        }
        Insert: {
          actor_person_id?: string | null
          actor_platform_roles?: string[]
          actor_type: string
          audit_event_id?: string
          correlation_id: string
          created_at?: string
          event_name: string
          metadata?: Json
          occurred_at?: string
          reason: string
          resource_id: string
          resource_type: string
          tenant_id?: string | null
        }
        Update: {
          actor_person_id?: string | null
          actor_platform_roles?: string[]
          actor_type?: string
          audit_event_id?: string
          correlation_id?: string
          created_at?: string
          event_name?: string
          metadata?: Json
          occurred_at?: string
          reason?: string
          resource_id?: string
          resource_type?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_audit_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_capabilities: {
        Row: {
          capability_key: string
          created_at: string
          disabled_at: string | null
          enabled: boolean
          enabled_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          capability_key: string
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          capability_key?: string
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          enabled_at?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_capabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_capabilities_updated_by_person_id_fkey"
            columns: ["updated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      tenant_configurations: {
        Row: {
          branding_reference: string | null
          created_at: string
          created_by_person_id: string | null
          default_time_zone: string
          display_name: string
          driver_application_slug: string | null
          legal_name: string
          support_contact_email: string
          tenant_id: string
          tenant_slug: string | null
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          branding_reference?: string | null
          created_at?: string
          created_by_person_id?: string | null
          default_time_zone: string
          display_name: string
          driver_application_slug?: string | null
          legal_name: string
          support_contact_email: string
          tenant_id: string
          tenant_slug?: string | null
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          branding_reference?: string | null
          created_at?: string
          created_by_person_id?: string | null
          default_time_zone?: string
          display_name?: string
          driver_application_slug?: string | null
          legal_name?: string
          support_contact_email?: string
          tenant_id?: string
          tenant_slug?: string | null
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configurations_created_by_person_id_fkey"
            columns: ["created_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_configurations_updated_by_person_id_fkey"
            columns: ["updated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_person_id: string | null
          cancelled_at: string | null
          cancelled_by_person_id: string | null
          created_at: string
          email: string
          email_delivered_at: string | null
          email_delivery_attempted_at: string | null
          email_delivery_error: string | null
          email_delivery_status: string
          expires_at: string
          intended_role: string
          invitation_id: string
          invitation_token_hash: string
          invited_by_person_id: string | null
          normalized_email: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_person_id?: string | null
          cancelled_at?: string | null
          cancelled_by_person_id?: string | null
          created_at?: string
          email: string
          email_delivered_at?: string | null
          email_delivery_attempted_at?: string | null
          email_delivery_error?: string | null
          email_delivery_status?: string
          expires_at: string
          intended_role: string
          invitation_id?: string
          invitation_token_hash: string
          invited_by_person_id?: string | null
          normalized_email: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_person_id?: string | null
          cancelled_at?: string | null
          cancelled_by_person_id?: string | null
          created_at?: string
          email?: string
          email_delivered_at?: string | null
          email_delivery_attempted_at?: string | null
          email_delivery_error?: string | null
          email_delivery_status?: string
          expires_at?: string
          intended_role?: string
          invitation_id?: string
          invitation_token_hash?: string
          invited_by_person_id?: string | null
          normalized_email?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_accepted_by_person_id_fkey"
            columns: ["accepted_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_invitations_cancelled_by_person_id_fkey"
            columns: ["cancelled_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_invitations_invited_by_person_id_fkey"
            columns: ["invited_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by_person_id: string | null
          expires_at: string | null
          invited_at: string | null
          membership_id: string
          person_id: string
          removed_at: string | null
          status: string
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by_person_id?: string | null
          expires_at?: string | null
          invited_at?: string | null
          membership_id?: string
          person_id: string
          removed_at?: string | null
          status?: string
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by_person_id?: string | null
          expires_at?: string | null
          invited_at?: string | null
          membership_id?: string
          person_id?: string
          removed_at?: string | null
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_created_by_person_id_fkey"
            columns: ["created_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_memberships_updated_by_person_id_fkey"
            columns: ["updated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      tenant_role_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by_person_id: string | null
          assignment_id: string
          created_at: string
          expires_at: string | null
          membership_id: string
          revoked_at: string | null
          revoked_by_person_id: string | null
          role_key: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by_person_id?: string | null
          assignment_id?: string
          created_at?: string
          expires_at?: string | null
          membership_id: string
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          role_key: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by_person_id?: string | null
          assignment_id?: string
          created_at?: string
          expires_at?: string | null
          membership_id?: string
          revoked_at?: string | null
          revoked_by_person_id?: string | null
          role_key?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_role_assignments_assigned_by_person_id_fkey"
            columns: ["assigned_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "tenant_role_assignments_membership_id_tenant_id_fkey"
            columns: ["membership_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["membership_id", "tenant_id"]
          },
          {
            foreignKeyName: "tenant_role_assignments_revoked_by_person_id_fkey"
            columns: ["revoked_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_profiles"
            referencedColumns: ["person_id"]
          },
        ]
      }
      tenants: {
        Row: {
          activated_at: string | null
          anonymized_at: string | null
          closed_at: string | null
          closing_at: string | null
          created_at: string
          deleted_at: string | null
          status: string
          suspended_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          anonymized_at?: string | null
          closed_at?: string | null
          closing_at?: string | null
          created_at?: string
          deleted_at?: string | null
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          anonymized_at?: string | null
          closed_at?: string | null
          closing_at?: string | null
          created_at?: string
          deleted_at?: string | null
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      toll_pricing_catalog: {
        Row: { alias_text: string; amount_minor: number; authority_code: string; authority_name: string; currency_code: string; effective_from: string; effective_to: string | null; facility_code: string; facility_id: string; facility_name: string; facility_type: string; mapbox_latitude: number | null; mapbox_longitude: number | null; mapbox_type: string | null; payment_method: string; rate_id: string; direction: string; source_reference: string | null; source_url: string; vehicle_class: string }
        Relationships: []
      }
    }
    Functions: {
      accept_tenant_invitation: {
        Args: { token_hash: string }
        Returns: {
          membership_id: string
          person_id: string
          status: string
          tenant_id: string
        }[]
      }
      activate_my_driver_account: { Args: never; Returns: string }
      approve_driver_application: {
        Args: { actor_id: string; target_application_id: string }
        Returns: string
      }
      attach_driver_application_files: {
        Args: {
          document_path_value?: string
          personal_path?: string
          target_application_id: string
          vehicle_path?: string
        }
        Returns: undefined
      }
      advance_my_trip: {
        Args: { target_action: string; target_booking_id: string }
        Returns: Json
      }
      submit_my_trip_distance_adjustment: {
        Args: { target_booking_id: string; actual_distance_meters_value: number }
        Returns: Json
      }
      cancel_dispatch_booking: {
        Args: { target_booking_id: string }
        Returns: boolean
      }
      admin_complete_in_progress_trip: {
        Args: { completion_reason_value: string; target_booking_id: string }
        Returns: Json
      }
      review_trip_fare_reconciliation: {
        Args: { decision_value: string; review_note_value: string; target_reconciliation_id: string }
        Returns: Json
      }
      prepare_trip_fare_settlement_internal: {
        Args: { target_reconciliation_id: string }
        Returns: Json
      }
      complete_trip_fare_settlement_internal: {
        Args: { provider_reference_value: string; target_settlement_id: string }
        Returns: boolean
      }
      fail_trip_fare_settlement_internal: {
        Args: { balance_due_value?: boolean; failure_message_value: string; target_settlement_id: string }
        Returns: boolean
      }
      cancel_my_rider_booking: {
        Args: { target_booking_id: string }
        Returns: boolean
      }
      can_manage_dispatch: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_manage_ledger: { Args: { target_tenant_id: string }; Returns: boolean }
      issue_rider_wallet_credit: { Args: { target_tenant_id: string; target_rider_profile_id: string; amount_minor_value: number; reason_value: string; request_key_value: string }; Returns: string }
      my_rider_wallet: { Args: { target_tenant_slug: string }; Returns: Json }
      prepare_rider_wallet_checkout_internal: { Args: { target_quote_id: string }; Returns: Json }
      cancel_wallet_only_booking_internal: { Args: { target_booking_id: string }; Returns: boolean }
      restore_rider_wallet_for_booking_internal: { Args: { target_booking_id: string }; Returns: number }
      create_my_rider_booking_series: { Args: { target_quote_id: string; start_date_value: string; end_date_value: string; local_pickup_time_value: string; weekdays_value: number[]; scheduled_pickup_at_values: string[]; booking_notes_value?: string }; Returns: string }
      my_rider_booking_series: { Args: { target_tenant_slug: string }; Returns: Json }
      register_my_rider_push_subscription: { Args: { target_tenant_slug: string; endpoint_value: string; p256dh_key_value: string; auth_key_value: string; user_agent_value?: string | null }; Returns: string }
      register_my_driver_push_subscription: { Args: { endpoint_value: string; p256dh_key_value: string; auth_key_value: string; user_agent_value?: string | null }; Returns: string }
      disable_my_push_subscription: { Args: { endpoint_value: string }; Returns: boolean }
      set_my_rider_booking_series_autopay: { Args: { target_series_id: string; enabled_value: boolean }; Returns: boolean }
      record_rider_saved_payment_method_internal: { Args: { target_quote_id: string; provider_customer_id_value: string; provider_payment_method_id_value: string; brand_value?: string | null; last4_value?: string | null; expires_month_value?: number | null; expires_year_value?: number | null }; Returns: string }
      claim_due_recurring_autopay_internal: { Args: { target_limit?: number }; Returns: Json }
      register_rider_offsession_attempt_internal: { Args: { target_quote_id: string; provider_payment_intent_id_value: string }; Returns: string }
      finalize_recurring_autopay_internal: { Args: { target_occurrence_id: string; target_quote_id: string }; Returns: string }
      finalize_paid_rider_booking_internal: { Args: { booking_notes_value: string; scheduled_pickup_at_value: string | null; service_type_value: string; target_quote_id: string }; Returns: string }
      fail_recurring_autopay_internal: { Args: { target_occurrence_id: string; failure_message_value: string; retryable_value: boolean }; Returns: boolean }
      cancel_my_rider_series_occurrence: { Args: { target_occurrence_id: string }; Returns: boolean }
      cancel_my_rider_booking_series: { Args: { target_series_id: string }; Returns: number }
      create_my_rider_recurring_booking: { Args: { target_quote_id: string; target_occurrence_id: string; booking_notes_value?: string }; Returns: string }
      claim_recurring_occurrence_checkout_internal: { Args: { target_occurrence_id: string; target_quote_id: string }; Returns: boolean }
      release_recurring_occurrence_checkout_internal: { Args: { target_occurrence_id: string; target_quote_id: string }; Returns: boolean }
      can_manage_pricing: { Args: { target_tenant_id: string }; Returns: boolean }
      can_manage_driver_management: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_manage_service_areas: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_manage_tenant_memberships: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_manage_tenant_roles: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_read_driver_management: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_read_service_areas: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_manage_vehicle_management: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_read_vehicle_management: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      can_read_tenant_audit: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      close_provisioning_tenant: {
        Args: {
          correlation_id: string
          reason: string
          target_tenant_id: string
        }
        Returns: {
          closed_status: string
          closed_tenant_id: string
        }[]
      }
      current_person_id: { Args: never; Returns: string }
      current_person_is_active: { Args: never; Returns: boolean }
      current_person_normalized_email: { Args: never; Returns: string }
      create_dispatch_booking: {
        Args: {
          booking_notes_value?: string
          customer_name_value: string
          customer_phone_value: string
          destination_address_value: string
          pickup_address_value: string
          target_service_area_id: string
          target_tenant_id: string
        }
        Returns: string
      }
      create_my_rider_booking: {
        Args: {
          booking_notes_value?: string
          destination_address_value: string
          pickup_address_value: string
          target_service_area_id: string
          target_tenant_slug: string
        }
        Returns: string
      }
      create_my_rider_geocoded_booking: {
        Args: {
          booking_notes_value?: string
          destination_address_value: string
          destination_latitude_value: number
          destination_longitude_value: number
          geocoding_provider_value: string
          pickup_address_value: string
          pickup_latitude_value: number
          pickup_longitude_value: number
          target_service_area_id: string
          target_tenant_slug: string
        }
        Returns: string
      }
      create_my_rider_geocoded_scheduled_booking: {
        Args: {
          booking_notes_value?: string
          destination_address_value: string
          destination_latitude_value: number
          destination_longitude_value: number
          geocoding_provider_value: string
          pickup_address_value: string
          pickup_latitude_value: number
          pickup_longitude_value: number
          scheduled_pickup_at_value: string
          target_service_area_id: string
          target_tenant_slug: string
        }
        Returns: string
      }
      create_my_rider_priced_booking: {
        Args: { booking_notes_value?: string; scheduled_pickup_at_value?: string; service_type_value?: string; target_quote_id: string }
        Returns: string
      }
      create_my_rider_priced_booking_with_service_type: {
        Args: { booking_notes_value: string; scheduled_pickup_at_value: string | null; service_type_value: string; target_quote_id: string }
        Returns: string
      }
      create_rider_price_quote_internal: {
        Args: { destination_address_value: string; destination_latitude_value: number; destination_longitude_value: number; pickup_address_value: string; pickup_latitude_value: number; pickup_longitude_value: number; route_distance_meters_value: number; route_duration_seconds_value: number; target_rider_profile_id: string; target_service_area_id: string; toll_amount_minor_value: number; toll_snapshot_value: Json }
        Returns: Json
      }
      create_rider_price_quote_with_service_type: {
        Args: { destination_address_value: string; destination_latitude_value: number; destination_longitude_value: number; pickup_address_value: string; pickup_latitude_value: number; pickup_longitude_value: number; route_distance_meters_value: number; route_duration_seconds_value: number; service_type_value: string; target_rider_profile_id: string; target_service_area_id: string; toll_amount_minor_value: number; toll_snapshot_value: Json }
        Returns: Json
      }
      create_my_rider_scheduled_booking: {
        Args: {
          booking_notes_value?: string
          destination_address_value: string
          pickup_address_value: string
          scheduled_pickup_at_value: string
          target_service_area_id: string
          target_tenant_slug: string
        }
        Returns: string
      }
      activate_due_scheduled_bookings: {
        Args: { target_tenant_id: string }
        Returns: number
      }
      current_rider_profile_id: {
        Args: { target_tenant_id: string }
        Returns: string
      }
      driver_compliance_satisfied: {
        Args: { target_driver_profile_id: string }
        Returns: boolean
      }
      driver_service_blockers: {
        Args: { target_driver_profile_id: string }
        Returns: string[]
      }
      expire_dispatch_offers: {
        Args: { target_tenant_id: string }
        Returns: number
      }
      has_active_platform_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      has_active_tenant_membership: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      has_tenant_role: {
        Args: { required_roles: string[]; target_tenant_id: string }
        Returns: boolean
      }
      inspect_tenant_invitation_token: {
        Args: { token_hash: string }
        Returns: {
          intended_role: string
          invitation_email: string
          status: string
          tenant_display_name: string
        }[]
      }
      is_platform_data_admin: { Args: never; Returns: boolean }
      list_transport_application_tenants: {
        Args: never
        Returns: {
          display_name: string
          tenant_slug: string
        }[]
      }
      list_rider_booking_tenants: {
        Args: never
        Returns: {
          display_name: string
          tenant_slug: string
        }[]
      }
      my_driver_portal_summary: { Args: never; Returns: Json }
      my_driver_dispatch: { Args: never; Returns: Json }
      my_driver_availability: { Args: never; Returns: Json }
      my_driver_service_areas: { Args: never; Returns: Json }
      my_driver_location_sharing: { Args: never; Returns: Json }
      my_driver_reputation: { Args: never; Returns: Json }
      my_driver_rating_appeals: { Args: never; Returns: Json }
      my_driver_wallet: { Args: never; Returns: Json }
      my_driver_payout_account: { Args: never; Returns: Json }
      my_driver_bank_payouts: { Args: never; Returns: Json }
      record_driver_bank_payout_internal: {
        Args: { amount_minor_value: number; automatic_value: boolean; currency_code_value: string; destination_reference_value: string | null; expected_arrival_at_value: string | null; failure_code_value: string | null; failure_message_value: string | null; method_value: string | null; provider_account_id_value: string; provider_created_at_value: string; provider_payout_id_value: string; status_value: string }
        Returns: boolean
      }
      reconcile_driver_bank_payout_internal: {
        Args: { provider_account_id_value: string; provider_balance_transaction_ids_value: string[]; provider_payout_id_value: string; provider_transfer_ids_value: string[] }
        Returns: Json
      }
      fail_driver_bank_payout_reconciliation_internal: {
        Args: { failure_message_value: string; provider_account_id_value: string; provider_payout_id_value: string }
        Returns: boolean
      }
      prepare_pretrip_refund_internal: { Args: { target_booking_id: string }; Returns: Json }
      complete_pretrip_refund_internal: { Args: { provider_refund_id_value: string; target_refund_id: string }; Returns: boolean }
      fail_pretrip_refund_internal: { Args: { failure_message_value: string; target_refund_id: string }; Returns: boolean }
      prepare_completed_trip_refund: { Args: { reason_value: string; target_booking_id: string }; Returns: Json }
      record_completed_trip_transfer_reversal_internal: { Args: { provider_transfer_reversal_id_value: string; target_recovery_id: string }; Returns: boolean }
      complete_completed_trip_refund_internal: { Args: { provider_refund_id_value: string; target_recovery_id: string }; Returns: boolean }
      fail_completed_trip_refund_recovery_internal: { Args: { failure_message_value: string; target_recovery_id: string }; Returns: boolean }
      record_rider_payment_dispute_internal: {
        Args: { amount_minor_value: number; currency_code_value: string; evidence_due_at_value: string | null; event_type_value: string; fee_minor_value: number; provider_charge_id_value: string; provider_dispute_id_value: string; provider_payment_intent_id_value: string; reason_value: string; reinstated_minor_value: number; status_value: string; withdrawn_minor_value: number }
        Returns: boolean
      }
      prepare_driver_earning_transfer_internal: {
        Args: { target_booking_id: string; target_driver_profile_id: string }
        Returns: Json
      }
      complete_driver_earning_transfer_internal: {
        Args: { provider_transfer_id_value: string; target_transfer_id: string }
        Returns: boolean
      }
      fail_driver_earning_transfer_internal: {
        Args: { failure_message_value: string; target_transfer_id: string }
        Returns: boolean
      }
      my_rider_portal: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_rider_reputation: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_rider_rating_appeals: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      moderate_trip_rating: {
        Args: { reason_value: string; target_rating_id: string; target_status: string }
        Returns: boolean
      }
      resolve_trip_rating_appeal: {
        Args: { resolution_notes_value: string; resolution_value: string; target_appeal_id: string }
        Returns: boolean
      }
      initialize_tenant_ledger: {
        Args: { target_currency_code?: string; target_tenant_id: string }
        Returns: boolean
      }
      post_tenant_ledger_transaction: {
        Args: {
          description_value: string
          effective_at_value: string
          entries_value: Json
          external_key_value: string
          target_booking_id?: string
          target_tenant_id: string
        }
        Returns: string
      }
      reverse_tenant_manual_ledger_transaction: {
        Args: { reason_value: string; target_tenant_id: string; target_transaction_id: string }
        Returns: string
      }
      register_rider_checkout_internal: {
        Args: { checkout_session_id_value: string; target_quote_id: string }
        Returns: string
      }
      register_driver_payout_account_internal: {
        Args: { provider_account_id_value: string; target_driver_profile_id: string }
        Returns: string
      }
      update_driver_payout_account_internal: {
        Args: { charges_enabled_value: boolean; currently_due_value: string[]; details_submitted_value: boolean; disabled_reason_value: string | null; eventually_due_value: string[]; payouts_enabled_value: boolean; provider_account_id_value: string; transfers_capability_status_value: string | null }
        Returns: boolean
      }
      record_rider_payment_internal: {
        Args: { amount_minor_value: number; checkout_session_id_value: string; currency_code_value: string; failure_message_value?: string | null; payment_intent_id_value: string; payment_status_value: string }
        Returns: boolean
      }
      tenant_ledger_summary: { Args: { target_tenant_id: string }; Returns: Json }
      submit_my_driver_trip_rating: {
        Args: {
          comment_value?: string
          communication_rating_value: number
          overall_rating_value: number
          readiness_rating_value: number
          respect_rating_value: number
          target_booking_id: string
        }
        Returns: string
      }
      submit_my_driver_rating_appeal: {
        Args: { reason_value: string; target_booking_id: string }
        Returns: string
      }
      submit_my_rider_trip_rating: {
        Args: {
          comment_value?: string
          communication_rating_value: number
          overall_rating_value: number
          safety_rating_value: number
          target_booking_id: string
          vehicle_cleanliness_rating_value: number
        }
        Returns: string
      }
      submit_my_rider_rating_appeal: {
        Args: { reason_value: string; target_booking_id: string; target_tenant_slug: string }
        Returns: string
      }
      my_rider_service_area_context: {
        Args: { target_tenant_slug: string; target_service_area_id: string }
        Returns: Json
      }
      my_rider_notification_preferences: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_driver_earnings_notification_preferences: { Args: never; Returns: Json }
      my_driver_sms_notification_settings: { Args: never; Returns: Json }
      my_rider_sms_notification_settings: { Args: { target_tenant_slug: string }; Returns: Json }
      my_rider_scheduling: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_rider_trip_locations: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_assigned_vehicle_compliance: { Args: never; Returns: Json }
      queue_driver_expiration_notifications: {
        Args: { target_date?: string }
        Returns: number
      }
      queue_scheduled_rider_reminders: {
        Args: { target_date?: string }
        Returns: number
      }
      offer_dispatch_booking: {
        Args: { target_booking_id: string; target_driver_profile_id: string }
        Returns: string
      }
      respond_my_dispatch_offer: {
        Args: { target_offer_id: string; target_response: string }
        Returns: Json
      }
      set_my_driver_notification_preferences: {
        Args: { expiration_reminders_enabled_value: boolean }
        Returns: boolean
      }
      set_my_driver_earnings_notification_preferences: {
        Args: { earnings_updates_enabled_value: boolean }
        Returns: boolean
      }
      disable_my_driver_sms_notifications: { Args: never; Returns: boolean }
      disable_my_rider_sms_notifications: { Args: { target_tenant_slug: string }; Returns: boolean }
      confirm_driver_sms_subscription_internal: { Args: { target_auth_user_id: string; phone_e164_value: string }; Returns: boolean }
      confirm_rider_sms_subscription_internal: { Args: { target_auth_user_id: string; target_tenant_slug: string; phone_e164_value: string }; Returns: boolean }
      set_my_driver_service_area: {
        Args: { target_service_area_id: string }
        Returns: Json
      }
      set_my_driver_availability: {
        Args: { target_status: string }
        Returns: Json
      }
      set_dispatch_booking_coordinates: {
        Args: {
          destination_latitude_value: number
          destination_longitude_value: number
          geocoding_provider_value: string
          pickup_latitude_value: number
          pickup_longitude_value: number
          target_booking_id: string
        }
        Returns: boolean
      }
      set_my_driver_location_sharing: {
        Args: { enabled_value: boolean }
        Returns: Json
      }
      update_my_driver_location: {
        Args: {
          accuracy_meters_value: number
          latitude_value: number
          longitude_value: number
          recorded_at_value: string
        }
        Returns: Json
      }
      set_my_rider_notification_preferences: {
        Args: {
          target_tenant_slug: string
          trip_updates_enabled_value: boolean
        }
        Returns: boolean
      }
      set_my_rider_payment_notification_preferences: {
        Args: { target_tenant_slug: string; payment_updates_enabled_value: boolean }
        Returns: boolean
      }
      set_tenant_scheduling_settings: {
        Args: {
          dispatch_lead_minutes_value: number
          maximum_advance_days_value: number
          minimum_notice_minutes_value: number
          reminder_lead_hours_value: number
          target_tenant_id: string
        }
        Returns: boolean
      }
      set_tenant_matching_settings: {
        Args: {
          automatic_matching_enabled_value: boolean
          maximum_attempts_value: number
          offer_duration_seconds_value: number
          target_tenant_id: string
        }
        Returns: boolean
      }
      set_tenant_pricing_settings: {
        Args: { base_fare_minor_value: number; minimum_fare_minor_value: number; operating_currency_value?: string; per_mile_minor_value: number; per_minute_minor_value: number; pricing_enabled_value: boolean; service_type_surcharges_value?: Json; target_tenant_id: string }
        Returns: boolean
      }
      set_tenant_driver_earnings_settings: {
        Args: { driver_share_basis_points_value: number; target_tenant_id: string }
        Returns: boolean
      }
      start_tenant_automatic_matching: {
        Args: { target_tenant_id: string }
        Returns: number
      }
      upsert_my_rider_profile: {
        Args: {
          accessibility_notes_value?: string
          display_name_value: string
          phone_value?: string
          target_tenant_slug: string
        }
        Returns: string
      }
      submit_my_driver_evidence: {
        Args: {
          target_driver_profile_id: string
          target_evidence_type: string
          target_mime_type: string
          target_original_file_name: string
          target_size_bytes: number
          target_storage_path: string
        }
        Returns: string
      }
      submit_my_vehicle_photo: {
        Args: {
          target_mime_type: string
          target_original_file_name: string
          target_size_bytes: number
          target_storage_path: string
          target_vehicle_id: string
        }
        Returns: boolean
      }
      submit_my_vehicle_evidence: {
        Args: {
          target_evidence_type: string
          target_mime_type: string
          target_original_file_name: string
          target_size_bytes: number
          target_storage_path: string
          target_vehicle_id: string
        }
        Returns: string
      }
      vehicle_compliance_satisfied: {
        Args: { target_vehicle_id: string }
        Returns: boolean
      }
      queue_vehicle_expiration_notifications: {
        Args: { target_date?: string }
        Returns: number
      }
      provision_tenant_with_owner_invitation: {
        Args: {
          correlation_id: string
          invitation_token_hash: string
          owner_email: string
          reason: string
          tenant_branding_reference: string
          tenant_default_time_zone: string
          tenant_display_name: string
          tenant_legal_name: string
          tenant_support_contact_email: string
        }
        Returns: {
          invitation_id: string
          tenant_id: string
        }[]
      }
      provision_tenant_with_owner_invitation_v2: {
        Args: {
          correlation_id: string
          invitation_token_hash: string
          owner_email: string
          reason: string
          tenant_branding_reference: string
          tenant_default_time_zone: string
          tenant_display_name: string
          tenant_legal_name: string
          tenant_slug: string
          tenant_support_contact_email: string
        }
        Returns: {
          provisioned_invitation_id: string
          provisioned_tenant_id: string
        }[]
      }
      submit_driver_application: {
        Args: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string
          target_tenant_id: string
        }
        Returns: string
      }
      submit_driver_application_by_slug: {
        Args: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string
          application_slug: string
        }
        Returns: string
      }
      submit_transport_driver_application: {
        Args: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string
          application_tenant_slug: string
        }
        Returns: string
      }
      sync_driver_document_compliance: {
        Args: { target_driver_profile_id: string }
        Returns: undefined
      }
      tenant_capability_enabled: {
        Args: { required_capability: string; target_tenant_id: string }
        Returns: boolean
      }
      tenant_has_active_owner: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      tenant_member_directory: {
        Args: { target_tenant_id: string }
        Returns: {
          display_name: string
          membership_id: string
          membership_status: string
          person_id: string
          person_status: string
          primary_email: string
          tenant_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
