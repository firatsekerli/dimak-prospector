import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DİMAK Prospector",
  description: "Fire door lead pipeline for DİMAK Kapı.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
