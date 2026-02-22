import { timingSafeEqual } from "crypto";
import { SignJWT, importPKCS8 } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import styles from "./page.module.css";

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
      console.warn(`[AUTH FAILED] Time: ${new Date().toISOString()}`);
      return redirect("/fail");
    }

    const privateKey = await importPKCS8(
      Buffer.from(process.env.PRIVATE_KEY!, "base64").toString("utf8"),
      "RS256"
    );
    const token = await new SignJWT({ user: "authenticated" })
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

    console.log(`[AUTH SUCCESS] Time: ${new Date().toISOString()}`);

    return redirect("/success");
  }
  return (
    <form className={styles.form} action={test}>
      <label htmlFor="pwd" style={{ fontWeight: "bold" }}>
        Input password:{" "}
      </label>
      <input type="password" id="pwd" name="pwd" minLength={1} required />
      <button type="submit" style={{ marginLeft: "3px" }}>
        Submit
      </button>
    </form>
  );
}
