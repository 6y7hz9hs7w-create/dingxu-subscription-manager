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
THESIS: 订阅是持续发生的个人账期，不是后台数据；首页必须先让用户看懂记录、看清、处理的闭环。
OWN-WORLD: 夜航账本以哑黑仪表、白色读数和紫红光谱为核心；金额、日期、状态像六联仪表一样各自承担一个真相。
STORY: 首屏用极大标题建立价值，再用真实能力读数与动态三步指引解释流程，最后把续费生命周期拉成一条可追踪时间线。
FIRST VIEWPORT: 左侧主张与登录路径，右侧只呈现月均支出、下次扣款和未来七天三项关键读数；大空间与低频光晕制造夜间专注感。
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
