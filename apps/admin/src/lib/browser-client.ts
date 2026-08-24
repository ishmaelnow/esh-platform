import {
  createBrowserSupabaseClient,
  createIsolatedBrowserSupabaseClient,
} from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

let transportationClient: ReturnType<typeof createIsolatedBrowserSupabaseClient> | null = null;

export function createAdminBrowserClient() {
  if (adminPublicConfig.surface !== "transportation") {
    return createBrowserSupabaseClient(adminPublicConfig.supabase);
  }

  transportationClient ??= createIsolatedBrowserSupabaseClient(
    "esh-transportation-admin-auth",
    adminPublicConfig.supabase,
  );
  return transportationClient;
}
