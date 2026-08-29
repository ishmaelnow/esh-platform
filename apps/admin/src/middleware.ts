import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/tenant-admin/invitations")) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders() });
    }
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders())) response.headers.set(key, value);
    return response;
  }
  const host = request.headers.get("host")?.split(":")[0];
  if (host === "apply.eshapp.com" && request.nextUrl.pathname.startsWith("/transport")) {
    const url = request.nextUrl.clone();
    url.pathname = `/apply${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://community-admin.eshapp.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export const config = {
  matcher: ["/transport/:path*", "/api/tenant-admin/invitations"],
};
