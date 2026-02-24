"use client";
import { useEffect, useRef } from "react";

function AIResponse({ HTMLcontent, isStreaming = false }) {
  const iframeRef = useRef(null);
  const updateIframeHeight = () => {
    if (iframeRef.current) {
      try {
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        if (doc && doc.body) {
          const height = doc.body.scrollHeight;
          iframe.style.height = height + 10 + "px";
        }
      } catch (e) {
        console.log("无法获取iframe高度:", e);
      }
    }
  };

  useEffect(() => {
    if (iframeRef.current && HTMLcontent) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow.document;

      doc.open();
      doc.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>* {margin: 0;padding: 0;box-sizing: border-box;font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;line-height: 1.6;}body {margin-top: 5px;background: transparent;color: #333;}</style></head><body>${HTMLcontent}</body></html>`
      );
      doc.close();
      iframe.sandbox = "allow-scripts allow-same-origin";

      setTimeout(updateIframeHeight, 50);
      iframe.onload = updateIframeHeight;
    }
  }, [HTMLcontent, isStreaming]);

  return <iframe ref={iframeRef} title="AI Response" />;
}

export default AIResponse;
