import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "符文战场 - 在线模拟器",
  description: "在线卡牌游戏模拟器（手动模拟，双人联机）"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} bg-background text-on-background antialiased`}>
        {children}
      </body>
    </html>
  );
}

