"use server";
import { timingSafeEqual } from "crypto";

const superPwdBuffer = Buffer.from("1474-2024323", "utf8");
export async function testSuper(input: string): Promise<boolean> {
  const inputBuffer = Buffer.from(input, "utf8");
  const pwdView = new Uint8Array(superPwdBuffer);
  const inputView = new Uint8Array(inputBuffer);
  if (superPwdBuffer.length !== inputBuffer.length || !timingSafeEqual(pwdView, inputView))
    return false;
  return true;
}
