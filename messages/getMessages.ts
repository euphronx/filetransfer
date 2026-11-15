import en from "./en.json";
import zh from "./zh.json";

export default function getMessages(lang: string) {
  const code = lang.toLowerCase().split("-")[0];
  if (code === "zh") {
    return zh;
  } else {
    return en;
  }
}
