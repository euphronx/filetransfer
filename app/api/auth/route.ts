import { NextResponse } from "next/server";
import { STS } from "ali-oss";
import { SignJWT, importPKCS8 } from "jose";

export async function GET() {
  try {
    // Get STS token
    const client = new STS({
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    });
    const result = await client.assumeRole(process.env.OSS_ROLE_ARN!, "", 3600);

    // Generate jwt token
    const privateKey = await importPKCS8(
      Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
      "RS256"
    );
    const token = await new SignJWT({ user: "authenticated" })
      .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
      .setIssuedAt()
      .setExpirationTime("3d")
      .sign(privateKey);

    return NextResponse.json({
      accessKeyId: result.credentials.AccessKeyId,
      accessKeySecret: result.credentials.AccessKeySecret,
      stsToken: result.credentials.SecurityToken,
      bucket: "files-for-transfer",
      jwtToken: token,
    });
  } catch (error: any) {
    console.error("Error acquiring STS Token:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
