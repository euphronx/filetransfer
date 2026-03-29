import { jwtVerify, importSPKI, SignJWT, importPKCS8 } from "jose";
import { cookies } from "next/headers";

// let privateKey: any, publicKey: any;
// await (async function init() {
const privateKey = await importPKCS8(
  Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
  "RS256"
);
const publicKey = await importSPKI(
  Buffer.from(process.env.PUBLIC_KEY!, "base64").toString("utf8"),
  "RS256"
);
// })();

async function setCookie(config: Record<string, string>) {
  const token = await new SignJWT(config)
    .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
    .setIssuedAt()
    .setExpirationTime("3d")
    .sign(privateKey);

  const cookieStore = await cookies();
  cookieStore.set("token", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 3 * 24 * 60 * 60,
  });
}

async function verifyCookie(token: string | undefined) {
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

export { setCookie, verifyCookie };
