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
THESIS: 订阅是持续发生的个人账期，不是后台数据；访客理解产品与登录后处理账目的全过程必须处于同一个夜航账本空间。
OWN-WORLD: 夜航账本以哑黑仪表、白色读数和紫红光谱为核心；登录前后共享背景、材质、按钮、字体、动效与状态语义，不发生视觉换站。
STORY: 登录前建立记录、看清、处理的价值闭环；登录后承接为总览、续费日历、消费分析和订阅流水，持续强调金额、日期与状态。
FIRST VIEWPORT: 未登录时呈现价值与登录路径；已登录时呈现问候、四项关键读数和续费任务，两种状态都以暗场、白色读数和紫红主操作保持同一产品身份。
FORM: 夜间飞行仪表与当代订阅账本的融合，保留参考站的大标题、暗场和渐变节奏，但不复刻其品牌或素材。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
