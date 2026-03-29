import { Metadata } from "next";

type Props = {
  children: React.ReactNode;
  params: Promise<{ roomName: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomName } = await params;
  const decodedName = decodeURIComponent(roomName);

  return {
    title: `${decodedName} | File Transfer`,
  };
}

export default function RoomLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
