import { timingSafeEqual } from "crypto";
import { SignJWT } from "jose";
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

    if (pwdBuffer.length !== inputBuffer.length || !timingSafeEqual(pwdBuffer, inputBuffer)) {
      console.warn(`[AUTH FAILED] Time: ${new Date().toISOString()}`);
      redirect("/fail");
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ user: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("3d")
      .sign(secret);

    const cookieStore = await cookies();
    cookieStore.set("token", token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3 * 24 * 60 * 60,
    });

    console.log(`[AUTH SUCCESS] Time: ${new Date().toISOString()}`);

    redirect("/success");
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
