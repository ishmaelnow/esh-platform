import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient } from "@esh-platform/supabase";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ status: "authentication_required" }, { status: 401 });
    }
    const body = (await request.json()) as { invitation?: unknown };
    if (typeof body.invitation !== "string" || !body.invitation.trim()) {
      return NextResponse.json({ status: "invalid_token" }, { status: 400 });
    }

    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7).trim());
    const { data: auth, error: authError } = await authenticated.auth.getUser();
    if (authError || !auth.user) {
      return NextResponse.json({ status: "authentication_required" }, { status: 401 });
    }
    const tokenHash = createHash("sha256").update(body.invitation.trim()).digest("hex");
    const { data, error } = await authenticated.rpc("accept_tenant_invitation", {
      token_hash: tokenHash,
    });
    if (error) return NextResponse.json({ message: error.message, status: "error" }, { status: 400 });

    const result = data?.[0] ?? { status: "invalid_token" };
    return NextResponse.json(result, { status: result.status === "accepted" ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to accept invitation.", status: "error" },
      { status: 400 },
    );
  }
}
