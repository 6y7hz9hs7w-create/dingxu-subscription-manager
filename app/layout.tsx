import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-dingxu.png`;
  const description = "集中管理会员订阅、续费日期和取消提醒，清楚知道每一笔钱花在哪里。";

  return {
    title: { default: "订序｜个人订阅管理", template: "%s｜订序" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "订序｜个人订阅管理",
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1731, height: 909, alt: "订序个人订阅管理" }],
    },
    twitter: { card: "summary_large_image", title: "订序｜个人订阅管理", description, images: [imageUrl] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div
          hidden
          data-design-contract="68d8bc56"
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: 订阅不是后台数据，而是会重复发生的个人账目；拒绝同尺寸指标卡堆叠的企业面板。
OWN-WORLD: 数字手账以纸白、墨黑和电光紫为底，薄荷、柑橘、珊瑚色签只表达账目状态；列表像流水，控件像索引签。
STORY: 用户先看月均支出和近期状态，再进入订阅流水、续费日历或分类支出，并完成管理动作。
FIRST VIEWPORT: 账本标题与同步状态居左，导出居右；月均支出占主位，数量指标紧邻，下方索引切换完整功能。
FORM: 年轻个人手账与消费凭证，第六方向，seed 68d8bc56。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
