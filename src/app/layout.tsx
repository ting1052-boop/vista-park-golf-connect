import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VISTA Park Golf Connect",
  description: "HH Square 스크린파크골프 타석예약 및 매장관리 프로그램"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
