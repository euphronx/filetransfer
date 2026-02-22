import Link from "next/link";
import styles from "../page.module.css";
export default function Fail() {
  return (
    <div className={styles.failContent}>
      <p>
        <b>Invalid Password!</b>
      </p>
      <p>
        <Link href="/">click to go back</Link>
      </p>
    </div>
  );
}
