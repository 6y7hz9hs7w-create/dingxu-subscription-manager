import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const description = "集中管理会员订阅、续费日期和取消提醒，清楚知道每一笔钱花在哪里。";

  return {
    title: { default: "续续｜订阅管理", template: "%s｜续续" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "续续｜订阅管理",
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1731, height: 909, alt: "续续订阅管理" }],
    },
    twitter: { card: "summary_large_image", title: "续续｜订阅管理", description, images: [imageUrl] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
