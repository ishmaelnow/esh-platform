import { createAuthenticatedSupabaseClient, createServiceSupabaseClient, tripPhotoResponse } from "@esh-platform/supabase";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return tripPhotoResponse(request, "rider", { authenticated: createAuthenticatedSupabaseClient, service: createServiceSupabaseClient });
}
