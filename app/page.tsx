"use client";
import { authenticate } from "./authenticate";
import { useTransition } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await authenticate(formData);
    });
  }

  return (
    <form className={styles.form} action={handleSubmit}>
      <label htmlFor="pwd" style={{ fontWeight: "bold", padding: "0", fontSize: "16px" }}>
        Input password:{" "}
      </label>
      <input type="password" id="pwd" name="pwd" minLength={1} required disabled={isPending} />
      <button type="submit" style={{ marginLeft: "3px" }} disabled={isPending}>
        {isPending ? "Authenticating..." : "Submit"}
      </button>
    </form>
  );
}
