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
          created_at: string
          created_by_person_id: string
          current_driver_profile_id: string | null
          current_vehicle_id: string | null
          customer_name: string
          customer_phone: string | null
          destination_address: string
          pickup_address: string
          rider_profile_id: string | null
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
          created_at?: string
          created_by_person_id: string
          current_driver_profile_id?: string | null
          current_vehicle_id?: string | null
          customer_name: string
          customer_phone?: string | null
          destination_address: string
          pickup_address: string
          rider_profile_id?: string | null
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
          created_at?: string
          created_by_person_id?: string
          current_driver_profile_id?: string | null
          current_vehicle_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          destination_address?: string
          pickup_address?: string
          rider_profile_id?: string | null
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
      dispatch_offers: {
        Row: {
          booking_id: string
          driver_profile_id: string
          expires_at: string
          offer_id: string
          offered_at: string
          offered_by_person_id: string
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
          offered_by_person_id: string
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
          offered_by_person_id?: string
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
          expiration_reminders_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_profile_id: string
          expiration_reminders_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_profile_id?: string
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
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["tenant_id"]
          },
        ]
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
      [_ in never]: never
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
      cancel_dispatch_booking: {
        Args: { target_booking_id: string }
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
      my_rider_portal: {
        Args: { target_tenant_slug: string }
        Returns: Json
      }
      my_assigned_vehicle_compliance: { Args: never; Returns: Json }
      queue_driver_expiration_notifications: {
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
      set_my_driver_service_area: {
        Args: { target_service_area_id: string }
        Returns: Json
      }
      set_my_driver_availability: {
        Args: { target_status: string }
        Returns: Json
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
