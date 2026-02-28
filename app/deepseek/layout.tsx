import { Metadata } from "next";

export const metadata: Metadata = {
  title: "File Transfer",
  icons: "/icon.ico",
  description: "webpage using DeepSeek API to imitate lingguang app",
};
export default function RouterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
