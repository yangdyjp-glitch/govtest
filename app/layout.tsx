import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "公考研习 · 在线答题",
  description: "公务员考试题库练习、答题分析与错题复习。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
