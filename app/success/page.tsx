"use client";
import Link from "next/link";
import { useAuth } from "@/components/useAuth";
import { useLanguage } from "@/messages/LanguageProvider";
import { FileTransfer } from "@/components/FileTransfer";
import type { RoomConfig } from "@/components/types";
import "@/components/styles.css";

const mainConfig: RoomConfig = { prefix: "files", archiveDays: 7, enableZipEndpoint: true, title: "File Transfer" };

export default function Success() {
  const { authState, jwtToken, OSSClient } = useAuth(mainConfig);
  const { msgs } = useLanguage();

  return (
    <>
      {authState.message && (
        <div className={"floating" + (authState.state === 0 ? "" : authState.state === 1 ? " success" : " fail")}>
          {msgs.auth[authState.message]}
        </div>
      )}
      <div className="header">
        <div className="title">{mainConfig.title}</div>
        <Link href="/deepseek">DeepSeek</Link>
        <Link href="/?change">{msgs.main.change}</Link>
        <Link href="/convert">{msgs.main.convert}</Link>
      </div>
      <FileTransfer jwtToken={jwtToken} OSSClient={OSSClient} config={mainConfig} />
      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
