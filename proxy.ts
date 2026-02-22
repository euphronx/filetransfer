import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;

  const isValidToken = async () => {
    if (!token) return false;
    try {
      await jwtVerify(token, JWT_SECRET);
      return true;
    } catch {
      return false;
    }
  };

  if (pathname === "/") {
    if (await isValidToken()) {
      return NextResponse.redirect(new URL("/success", req.url));
    }
  }

  if (pathname.startsWith("/success") || pathname.startsWith("/deepseek")) {
    if (!(await isValidToken())) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/index.html",
    "/success/:path*",
    "/fail/:path*",
    "/deepseek/:path*",
    "/api/:path*",
  ],
};
