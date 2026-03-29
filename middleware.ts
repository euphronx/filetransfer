import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setCookie, verifyCookie } from "./src/jwt";

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
    if (!payload) await setCookie({ room: "main" });
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
