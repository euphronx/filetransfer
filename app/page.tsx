"use client";
import { authenticate } from "./authenticate";
import { useEffect, useState, useTransition } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [isPending, startTransition] = useTransition();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const user = localStorage.getItem("user_name");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) setUserName(user);
  }, []);

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await authenticate(formData);
    });
  }

  return (
    <form className={styles.form} action={handleSubmit}>
      <div className={styles["input-row"]}>
        <label htmlFor="user" style={{ fontWeight: "bold", padding: "0", fontSize: "16px" }}>
          Input User Name (Optional):{" "}
        </label>
        <input
          type="text"
          id="user"
          name="user"
          value={userName}
          onChange={(e) => {
            setUserName(e.target.value);
            localStorage.setItem("user_name", e.target.value);
          }}
          minLength={1}
          disabled={isPending}
        />
      </div>
      <div className={styles["input-row"]}>
        <label htmlFor="pwd" style={{ fontWeight: "bold", padding: "0", fontSize: "16px" }}>
          Input Password:{" "}
        </label>
        <input type="password" id="pwd" name="pwd" minLength={1} required disabled={isPending} />
      </div>
      <button
        type="submit"
        style={{ marginLeft: "3px", alignSelf: "flex-end" }}
        disabled={isPending}
      >
        {isPending ? "Authenticating..." : "Submit"}
      </button>
    </form>
  );
}
