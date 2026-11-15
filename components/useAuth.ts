"use client";
import { createContext, createElement, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AuthState, RoomConfig } from "./types";

const AuthContext = createContext<{ authState: AuthState; jwtToken: string | null; OSSClient: any }>({
  authState: { state: 0, message: "authenticating" },
  jwtToken: null,
  OSSClient: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const started = useRef(false);
  const [authState, setAuthState] = useState<AuthState>({ state: 0, message: "authenticating" });
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [OSSClient, setOSSClient] = useState<any>(null);

  useEffect(() => {
    if (pathname === "/" || pathname.startsWith("/fail")) return;
    if (started.current) return;
    started.current = true;

    const getAuth = async () => {
      const jwtRes = await fetch("/auth/");
      if (jwtRes.status === 500 || !jwtRes.ok) {
        setAuthState({ state: 2, message: "failed" });
        throw new Error("Failed to get JWT");
      }
      const { accessKeyId, accessKeySecret, stsToken, bucket, jwtToken } = await jwtRes.json();
      setJwtToken(jwtToken);
      setAuthState({ state: 1, message: "success" });
      setTimeout(() => setAuthState({ state: 0, message: "" }), 3000);

      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region: "oss-cn-shanghai",
        authorizationV4: true,
        secure: true,
        bucket,
        accessKeyId,
        accessKeySecret,
        stsToken,
        refreshSTSToken: async () => {
          try {
            const res = await fetch("/auth/");
            const { accessKeyId, accessKeySecret, stsToken } = await res.json();
            return { accessKeyId, accessKeySecret, stsToken };
          } catch {
            throw new Error("Failed to get STS");
          }
        },
        refreshSTSTokenInterval: 3600000,
      });
      setOSSClient(client);
    };
    getAuth();
  }, [pathname]);

  return createElement(AuthContext.Provider, { value: { authState, jwtToken, OSSClient } }, children);
}

export function useAuth(config: RoomConfig): { authState: AuthState; jwtToken: string | null; OSSClient: any } {
  const { authState, jwtToken, OSSClient } = useContext(AuthContext);

  useEffect(() => {
    if (!jwtToken) return;

    // Wake up the FC server (throttled to 10 minutes via sessionStorage)
    const doWakeup = () => {
      fetch("https://file-trnsfer-fc-hcuthkwduw.cn-shanghai.fcapp.run/wakeup", {
        headers: { "Authorization": `Bearer ${jwtToken}`, "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          user_name: localStorage.getItem("user_name") || "%%UNKNOWN%%",
          room: config.room || "main",
        }),
      });
    };

    const wakeTime = sessionStorage.getItem("wake_time");
    if (!wakeTime || Date.now() - parseInt(wakeTime) > 600000) {
      doWakeup();
      sessionStorage.setItem("wake_time", Date.now().toString());
    }
  }, [jwtToken, config.room]);

  return { authState, jwtToken, OSSClient };
}
