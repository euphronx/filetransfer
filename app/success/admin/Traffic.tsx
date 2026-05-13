"use client";
import { useEffect, useState } from "react";
import OSS from "ali-oss";

interface LogInfo {
  time: number;
  ip: string;
  level: string;
  path: string;
  msg: string;
}

export default function Traffic({
  client,
  setShowTraffic,
}: {
  client: OSS;
  setShowTraffic: (value: any) => void;
}) {
  const [content, setContent] = useState<LogInfo[]>([]);

  async function getContent() {
    const trafficInfo = [];

    const url = client.signatureUrl("traffic.log", { expires: 300 });
    const result = await fetch(url);
    const text = await result.text();

    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const info = JSON.parse(line);
        if (info) {
          trafficInfo.push(info);
        }
      } catch {}
    }
    setContent(trafficInfo);
  }

  useEffect(() => {
    const auth = async () => {
      getContent();
    };
    auth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function clearLog() {
    await client.delete("traffic.log");
    getContent();
  }

  return (
    <div className="traffic-content">
      <div className="traffic-header">
        <button type="button" onClick={() => setShowTraffic(false)}>
          Back
        </button>
        <button type="button" onClick={clearLog}>
          Clear Log
        </button>
      </div>
      <div className="log-content">
        <hr />
        {content.map((info, idx) => (
          <div key={idx}>
            Time: {new Date(info.time).toLocaleString()} <br />
            Client IP: {info.ip} <br />
            Log level: {info.level} <br /> Path: {info.path} <br /> Message: {info.msg}
            <hr />
          </div>
        ))}
      </div>
    </div>
  );
}
