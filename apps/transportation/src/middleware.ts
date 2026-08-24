import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const allowed = path === "/" || path.startsWith("/transportation") || path.startsWith("/api/tenant-admin/");
  if (allowed) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/"; url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"] };
