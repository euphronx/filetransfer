"use client";
import Link from "next/link";
import styles from "../page.module.css";
import { useLanguage } from "@/messages/LanguageProvider";

export default function Fail() {
  const { msgs } = useLanguage();
  return (
    <div className={styles.failContent}>
      <p>
        <b>{msgs.fail.s1}</b>
      </p>
      <p>
        <Link href="/">{msgs.fail.s2}</Link>
      </p>
    </div>
  );
}
