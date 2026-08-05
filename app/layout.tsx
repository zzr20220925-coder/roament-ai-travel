import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "michi — 会接管变化的 AI 私人导游",
  description: "从酒店出发，告诉你下一步做什么；天气、延误、体力与预算变化时，Michi 会实时重排行程。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
