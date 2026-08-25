import {
  createBrowserSupabaseClient,
  createIsolatedBrowserSupabaseClient,
} from "@esh-platform/supabase";
import { adminPublicConfig } from "@/lib/config";

let transportationClient: ReturnType<typeof createIsolatedBrowserSupabaseClient> | null = null;
let communityAdminClient: ReturnType<typeof createIsolatedBrowserSupabaseClient> | null = null;

export function createAdminBrowserClient() {
  if (adminPublicConfig.surface === "transportation") {
    transportationClient ??= createIsolatedBrowserSupabaseClient(
      "esh-transportation-admin-auth",
      adminPublicConfig.supabase,
    );
    return transportationClient;
  }

  if (adminPublicConfig.surface === "community-admin") {
    communityAdminClient ??= createIsolatedBrowserSupabaseClient(
      "esh-community-admin-auth",
      adminPublicConfig.supabase,
    );
    return communityAdminClient;
  }

  return createBrowserSupabaseClient(adminPublicConfig.supabase);
}
