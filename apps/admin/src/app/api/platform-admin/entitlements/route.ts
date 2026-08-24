import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";

const workspaceKeys = new Set(["transportation", "community"]);
const entitlementStatuses = new Set(["granted", "suspended", "revoked"]);

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token)
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const workspaceKey = typeof body.workspaceKey === "string" ? body.workspaceKey : "";
    const status = typeof body.status === "string" ? body.status : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!workspaceKeys.has(workspaceKey)) throw new Error("A supported product is required.");
    if (!entitlementStatuses.has(status))
      throw new Error("A valid entitlement status is required.");
    if (!reason) throw new Error("Product entitlement reason is required.");

    const supabase = createRequestSupabaseClient({ accessToken: token });
    const { error } = await supabase.rpc("set_tenant_product_entitlement", {
      target_tenant_id: tenantId,
      target_workspace_key: workspaceKey,
      target_status: status,
      reason_value: reason,
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update product entitlement." },
      { status: 400 },
    );
  }
}
