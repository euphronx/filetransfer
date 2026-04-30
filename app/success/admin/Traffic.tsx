"use client";
import { useEffect, useState } from "react";
import OSS from "ali-oss";

interface LogInfo {
  time: Date;
  logLevel: string;
  path: string;
  message: string;
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
      const info = line.match(
        /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.\d{3})\] \[(.+)\] <(\/.+)> (.+)/
      );
      if (info) {
        const [, time, logLevel, path, message] = info;
        trafficInfo.push({ time: new Date(time), logLevel, path, message });
      }
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
            time: {info.time.toLocaleString()} <br />
            log level: {info.logLevel} <br /> path: {info.path} <br /> message: {info.message}
            <hr />
          </div>
        ))}
      </div>
    </div>
  );
}
