import { timingSafeEqual } from "crypto";
import { importPKCS8, SignJWT } from "jose";
import { setCookie } from "@/src/jwt";
import { redirect } from "next/navigation";
import styles from "./page.module.css";

const privateKey = await importPKCS8(
  Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
  "RS256"
);
const jwtToken = await new SignJWT({ user: "authenticated" })
  .setProtectedHeader({ alg: "RS256", kid: "transfer-key-v1" })
  .setIssuedAt()
  .setExpirationTime("3d")
  .sign(privateKey);

export default function Home() {
  async function test(formData: FormData) {
    "use server";
    const inputPwd = formData.get("pwd") as string;
    const envPwd = process.env.PASSWORD || "";

    const pwdBuffer = Buffer.from(envPwd, "utf8");
    const inputBuffer = Buffer.from(inputPwd, "utf8");

    const pwdView = new Uint8Array(pwdBuffer);
    const inputView = new Uint8Array(inputBuffer);

    if (pwdBuffer.length !== inputBuffer.length || !timingSafeEqual(pwdView, inputView)) {
      const response = await fetch(
        "https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/check",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${jwtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: inputPwd,
          }),
        }
      );
      if (response.ok) {
        const json = await response.json();
        const roomName = json.roomName;
        console.log(`[AUTH SUCCESS] Time: ${new Date().toISOString()} Room: ${roomName}`);
        setCookie({ room: roomName });
        return redirect(`/rooms/${roomName}`);
      }

      console.warn(`[AUTH FAILED] Time: ${new Date().toISOString()}`);
      return redirect("/fail");
    }

    setCookie({ room: "main" });

    console.log(`[AUTH SUCCESS] Time: ${new Date().toISOString()}`);

    return redirect("/success");
  }
  return (
    <form className={styles.form} action={test}>
      <label htmlFor="pwd" style={{ fontWeight: "bold", padding: "0", fontSize: "16px" }}>
        Input password:{" "}
      </label>
      <input type="password" id="pwd" name="pwd" minLength={1} required />
      <button type="submit" style={{ marginLeft: "3px" }}>
        Submit
      </button>
    </form>
  );
}
