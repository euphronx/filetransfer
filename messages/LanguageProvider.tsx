"use client";

import { createContext, useContext, useEffect, useState } from "react";
import getMessages from "./getMessages";

const LanguageContext = createContext({ lang: "en", msgs: getMessages("en") });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState("en");
  const [msgs, setMessages] = useState(getMessages("en"));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(navigator.language);
    setMessages(getMessages(navigator.language));
  }, []);

  return <LanguageContext.Provider value={{ lang, msgs }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
