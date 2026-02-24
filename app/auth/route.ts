import { NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";

export async function GET() {
  // Generate jwt token
  const privateKey = await importPKCS8(
    Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
    "RS256"
  );
  const token = await new SignJWT({ user: "authenticated" })
    .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  return NextResponse.json({ jwtToken: token });
}
