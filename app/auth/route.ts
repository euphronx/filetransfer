import { NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { createHmac } from "crypto";
import { stringify } from "querystring";

export async function GET(req: NextRequest) {
  // Get sts token without using SDK
  const ip = (req.headers.get("x-forwarded-for") || "unknown")
    .replace(/:/g, "_")
    .replace(/\s+/g, "")
    .split(",")
    .join("-");
  console.log(ip);
  const params = {
    Action: "AssumeRole",
    RoleArn: process.env.OSS_ROLE_ARN,
    RoleSessionName: `IP-${ip}`,
    DurationSeconds: 3600,

    Format: "JSON",
    Version: "2015-04-01",
    AccessKeyId: process.env.OSS_ACCESS_KEY_ID,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: Math.random(),
    Timestamp: new Date().toISOString(),
  };

  const canoQuery = Object.keys(params)
    .sort()
    .map((k) => `${customEscape(k)}=${customEscape(params[k as keyof typeof params])}`)
    .join("&");

  const stringToSign = `${"POST"}&${customEscape("/")}&${customEscape(canoQuery)}`;

  const signature = createHmac("sha1", `${process.env.OSS_ACCESS_KEY_SECRET}&`)
    .update(stringToSign)
    .digest("base64");
  const bodyParams = { ...params, Signature: signature };

  try {
    const response = await fetch("https://sts.aliyuncs.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stringify(bodyParams),
      cache: "no-store",
    });
    if (!response.ok) {
      const errorData = await response.text();
      console.error(errorData);
      return NextResponse.json({ error: "STS_FAILED", detail: errorData }, { status: 500 });
    }
    const data = (await response.json()).Credentials;

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
      accessKeyId: data.AccessKeyId,
      accessKeySecret: data.AccessKeySecret,
      stsToken: data.SecurityToken,
      bucket: "files-for-transfer",
      jwtToken: token,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function customEscape(str: any) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}
