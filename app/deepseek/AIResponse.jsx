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

      // const cleanHTML = DOMPurify.sanitize(HTMLcontent, {
      //   ALLOWED_TAGS: [
      //     "p", "h1", "h2", "h3", "h4", "h5", "h6",
      //     "strong", "em", "ul", "ol", "li", "blockquote",
      //     "code", "pre", "hr", "a", "span", "div",
      //     "iframe", "br", "script", "button", "input",
      //     "textarea", "select", "option", "label", "form",
      //     "table", "tr", "td", "th", "thead", "tbody", "tfoot",
      //     "img", "canvas", "svg", "path", "circle", "rect"
      //   ],
      //   ALLOWED_ATTR: [
      //     "style", "href", "target", "src", "type", "async", "defer",
      //     "id", "class", "name", "value", "placeholder", "rows", "cols",
      //     "onclick", "onchange", "oninput", "onsubmit", "width", "height",
      //     "disabled", "checked", "selected", "maxlength", "min", "max", "step"
      //   ],
      //   ALLOW_UNKNOWN_PROTOCOLS: false,
      //   ADD_URI_SAFE_ATTR: ["onclick", "onchange", "oninput", "onsubmit"],
      //   ADD_DATA_URI_TAGS: ["img", "script"],
      //   KEEP_CONTENT: true,
      //   ADD_TAGS: [],
      //   ADD_ATTR: [],
      // });

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
