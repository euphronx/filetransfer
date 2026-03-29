import { Metadata } from "next";

export const metadata: Metadata = {
  title: "File Transfer",
  icons: "/favicon.svg",
  description: "A personal webpage for exchanging files",
};

export default function RoomLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
