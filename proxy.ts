import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, importSPKI } from "jose";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
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
      console.log(`Valid token from IP ${ip} to /, redirect to success`);
      return NextResponse.redirect(new URL("/success", req.url));
    }
  }

  if (!(await isValidToken())) {
    console.log(`[warn]Invalid visit to ${pathname} from IP ${ip}`);
    if (pathname.startsWith("/success") || pathname.startsWith("/deepseek")) {
      console.log(`Invalid visit to ${pathname}, redirect to /`);
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (pathname.startsWith("/auth")) {
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/success/:path*", "/fail/:path*", "/deepseek/:path*", "/auth/:path*"],
};
