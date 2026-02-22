import { NextResponse } from "next/server";
import { STS } from "ali-oss";
export async function GET() {
  try {
    const client = new STS({
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    });
    const result = await client.assumeRole(process.env.OSS_ROLE_ARN!, "", 3600);
    return NextResponse.json({
      accessKeyId: result.credentials.AccessKeyId,
      accessKeySecret: result.credentials.AccessKeySecret,
      stsToken: result.credentials.SecurityToken,
      bucket: "files-for-transfer",
    });
  } catch (error: any) {
    console.error("Error acquiring STS Token:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
