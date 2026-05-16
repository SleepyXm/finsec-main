import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/profile"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token");

  if (accessToken) {
    // Optionally: verify JWT expiry client-side here to avoid a round trip
    return NextResponse.next();
  }

  // No access token — try to refresh using the refresh_token cookie
  const refreshToken = request.cookies.get("refresh_token");
  if (!refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const refreshRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: { cookie: request.headers.get("cookie") ?? "" },
      }
    );

    if (!refreshRes.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Forward the new cookies the Go server set, then continue
    const response = NextResponse.next();
    refreshRes.headers.getSetCookie().forEach(cookie => {
      response.headers.append("Set-Cookie", cookie);
    });
    return response;

  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}


export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*"],
};