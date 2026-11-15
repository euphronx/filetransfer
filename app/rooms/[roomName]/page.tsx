"use client";
import { use } from "react";
import Link from "next/link";
import { useAuth } from "@/components/useAuth";
import { useLanguage } from "@/messages/LanguageProvider";
import { FileTransfer } from "@/components/FileTransfer";
import type { RoomConfig } from "@/components/types";
import "@/components/styles.css";

export default function Room({ params }: { params: Promise<{ roomName: string }> }) {
  const { roomName } = use(params);

  const roomConfig: RoomConfig = {
    prefix: `rooms/${roomName}`,
    room: roomName,
    archiveDays: 14,
    enableZipEndpoint: false,
    title: `File Transfer - Room ${roomName[0].toUpperCase() + roomName.slice(1)}`,
  };

  const { authState, jwtToken, OSSClient } = useAuth(roomConfig);
  const { msgs } = useLanguage();

  return (
    <>
      {authState.message && (
        <div className={"floating" + (authState.state === 0 ? "" : authState.state === 1 ? " success" : " fail")}>
          {msgs.auth[authState.message]}
        </div>
      )}
      <div className="header">
        <div className="title title-room">{roomConfig.title}</div>
        <Link href="/?change">{msgs.main.change}</Link>
      </div>
      <FileTransfer jwtToken={jwtToken} OSSClient={OSSClient} config={roomConfig} />
      <footer>&copy; 2026 Jacky</footer>
    </>
  );
}
