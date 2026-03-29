import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, importSPKI, SignJWT, importPKCS8 } from "jose";

async function verifyCookie(token: string | undefined) {
  const publicKey = await importSPKI(
    Buffer.from(process.env.PUBLIC_KEY!, "base64").toString("utf8"),
    "RS256"
  );
  if (!token) return false;
  try {
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"],
    });
    if (protectedHeader.kid !== "transfer-key-v1") return false;
    else return payload;
  } catch {
    return false;
  }
}

async function getCookieToken(config: Record<string, string>) {
  const privateKey = await importPKCS8(
    Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
    "RS256"
  );
  const token = await new SignJWT(config)
    .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
    .setIssuedAt()
    .setExpirationTime("3d")
    .sign(privateKey);
  return token;
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.searchParams.has("change")) return;

  const { pathname } = req.nextUrl;
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  const token = req.cookies.get("token")?.value;

  if (pathname.startsWith("/fail")) return NextResponse.next();

  if (
    !["/auth", "/deepseek", "/success", "/rooms"].some((r) => pathname.includes(r)) &&
    pathname !== "/"
  )
    return NextResponse.redirect(new URL("/", req.url));

  const payload = await verifyCookie(token);

  const allowedIPs = JSON.parse(process.env.ALLOWED_IP!) as string[];
  if (allowedIPs.includes(ip)) {
    if (!payload) {
      const token = await getCookieToken({ room: "main" });
      NextResponse.next().cookies.set("token", token, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 3 * 24 * 60 * 60,
      });
    }
    if (pathname === "/") return NextResponse.redirect(new URL("/success/", req.url));
    return NextResponse.next();
  }

  if (payload) {
    const room = payload.room;
    if (pathname === "/") {
      console.log(`[info] Valid token from IP ${ip} to /, redirect to room ${room}`);
      if (room === "main") return NextResponse.redirect(new URL("/success/", req.url)); // Redirect to /success if room is main
      return NextResponse.redirect(new URL(`/rooms/${room}/`, req.url)); // Redirect to the corresponding room
    }
    if (room !== "main" && !pathname.startsWith(`/rooms/${room}/`) && !pathname.startsWith("/auth"))
      // Go to where you should!
      return NextResponse.redirect(new URL(`/rooms/${room}/`, req.url));

    return NextResponse.next(); // Nothing happens
  } else {
    console.log(
      `[warn] Invalid visit to ${pathname} from IP ${ip}, request body: ${JSON.stringify(req.body)}`
    );

    if (pathname.startsWith("/auth"))
      return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });

    if (pathname === "/") return NextResponse.next();
    else return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.ico|.*\\.svg).*)"],
};
