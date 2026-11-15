"use client";
import "./styles.css";
import { useLanguage } from "@/messages/LanguageProvider";

export default function Convert() {
  const { msgs } = useLanguage();
  return (
    <div className="container">
      <div>
        <div className="convert-title">{msgs.convert.title}</div>
        <div>{msgs.convert.subtitle}</div>
      </div>
      <div className="convert-links">
        <div className="convert-link">
          <a href="img2pdf">{msgs.convert.i2p.title}</a>
          <div>{msgs.convert.i2p.subtitle}</div>
        </div>
      </div>
    </div>
  );
}
