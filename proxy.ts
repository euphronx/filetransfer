import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, importSPKI } from "jose";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;

  const isValidToken = async () => {
    if (!token) return false;
    try {
      const publicKey = await importSPKI(
        Buffer.from(process.env.PUBLIC_KEY!, "base64").toString("utf8"),
        "RS256"
      );
      const { protectedHeader } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
      if (protectedHeader.kid !== "transfer-key-v1") return false;
      else return true;
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
    "/((?!.*\\.ico$|.*\\.png$|.*\\.jpg$).*)",
    "/",
    "/index.html",
    "/success/:path*",
    "/fail/:path*",
    "/deepseek/:path*",
    "/api/:path*",
  ],
};
