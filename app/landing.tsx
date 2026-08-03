"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

const guides = [
  {
    label: "01 记录",
    title: "把分散的会员，收进一份账本",
    description: "在微信小程序添加服务、金额、账期和续费日。网页与小程序读取同一份个人数据。",
    action: "先添加常用订阅",
    view: "ledger",
  },
  {
    label: "02 看清",
    title: "每月花费和下次扣款，一眼看懂",
    description: "年付会自动折算为月均口径，日历按账期展开，不需要自己重复计算。",
    action: "查看消费分析",
    view: "analysis",
  },
  {
    label: "03 处理",
    title: "续费之后，顺手确认下一周期",
    description: "确认续费、暂停或取消都保留完整轨迹；取消项目 7 天后自动归档，不会混进支出。",
    action: "处理待确认项目",
    view: "renewal",
  },
] as const;

type LandingProps = { signInPath: string };

export default function Landing({ signInPath }: LandingProps) {
  const [guide, setGuide] = useState(0);
  const active = guides[guide];

  useEffect(() => {
    const timer = window.setInterval(() => setGuide((current) => (current + 1) % guides.length), 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="主导航">
        <Link className={styles.brand} href="/" aria-label="订序首页">
          <span className={styles.logo} aria-hidden="true"><i /><i /></span>
          <strong>订序</strong>
        </Link>
        <div className={styles.navLinks}>
          <a href="#features">功能</a>
          <a href="#guide">使用指引</a>
          <Link href="/sync">微信同步</Link>
        </div>
        <a className={styles.navCta} href={signInPath}>进入账本</a>
      </nav>

      <section className={styles.hero}>
        <div className={styles.aurora} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.heroCopy}>
          <p className={styles.heroTag}>个人订阅与续费管理</p>
          <h1>让每一笔订阅<br />都按时<span>归位</span></h1>
          <p className={styles.heroLead}>把金额、续费日和处理状态放进同一份账本。少记一次不必要的扣款，也少错过一次该续的会员。</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href={signInPath}>使用 ChatGPT 账号登录 <span>↗</span></a>
            <Link className={styles.textCta} href="/sync">从微信小程序同步数据</Link>
          </div>
        </div>

        <div className={styles.heroInstrument} aria-label="订阅账本演示">
          <div className={styles.instrumentTop}>
            <span>本月订阅账单</span>
            <i>演示</i>
          </div>
          <div className={styles.mainReading}>
            <div><small>月均支出</small><strong>¥173</strong></div>
            <span className={styles.orbit} aria-hidden="true"><i /></span>
          </div>
          <div className={styles.instrumentRule}><i /></div>
          <div className={styles.readings}>
            <div><small>下次扣款</small><strong>8月24日</strong><span>ChatGPT Plus</span></div>
            <div><small>未来 7 天</small><strong>¥135</strong><span>1 项待处理</span></div>
          </div>
          <div className={styles.signal}><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>

        <div className={styles.scrollHint} aria-hidden="true"><i />向下了解</div>
      </section>

      <section className={styles.proof} id="features" aria-label="产品能力">
        <article><strong>100</strong><span>单账号订阅上限</span></article>
        <article><strong>1 份</strong><span>网页与小程序共享数据</span></article>
        <article><strong>7 天</strong><span>取消后自动归档</span></article>
      </section>

      <section className={styles.guide} id="guide">
        <div className={styles.guideIntro}>
          <h2>不需要先学会<br />一套复杂工具</h2>
          <p>指引会自动切换，也可以按自己的节奏点击查看。每一步都对应真实的订阅管理动作。</p>
          <div className={styles.guideTabs} role="tablist" aria-label="使用步骤">
            {guides.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={guide === index}
                className={guide === index ? styles.activeTab : ""}
                onClick={() => setGuide(index)}
              >
                <span>{item.label}</span>
                <strong>{item.title.split("，")[0]}</strong>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.guideStage} aria-live="polite">
          <div className={styles.stageMeta}><span>动态使用指引</span><i>{String(guide + 1).padStart(2, "0")} / 03</i></div>
          <div key={active.title} className={styles.stageCopy}>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
          </div>
          <GuidePreview view={active.view} />
          <a href={signInPath}>{active.action}<span>→</span></a>
        </div>
      </section>

      <section className={styles.rhythm}>
        <div className={styles.rhythmGlow} aria-hidden="true" />
        <h2>续费不是一个提醒。<br />它是一段完整的账期。</h2>
        <div className={styles.timeline}>
          <article><i>记录</i><strong>8月 24日</strong><span>看到下一次扣款</span></article>
          <article><i>提醒</i><strong>提前 3 天</strong><span>微信一次性通知</span></article>
          <article><i>处理</i><strong>已续费</strong><span>账期自动顺延</span></article>
          <article><i>归档</i><strong>取消 7 天</strong><span>历史清楚保留</span></article>
        </div>
      </section>

      <footer className={styles.footer}>
        <div><span className={styles.logo} aria-hidden="true"><i /><i /></span><strong>订序</strong></div>
        <p>把每一份订阅，安排得井然有序。</p>
        <a href={signInPath}>开始整理我的订阅</a>
      </footer>
    </main>
  );
}

function GuidePreview({ view }: { view: (typeof guides)[number]["view"] }) {
  if (view === "analysis") return <div className={`${styles.preview} ${styles.analysis}`}>
    <div><span>8月</span><i style={{ height: "48%" }} /><b>¥173</b></div>
    <div><span>9月</span><i style={{ height: "78%" }} /><b>¥308</b></div>
    <div><span>10月</span><i style={{ height: "62%" }} /><b>¥231</b></div>
    <div><span>11月</span><i style={{ height: "36%" }} /><b>¥118</b></div>
  </div>;
  if (view === "renewal") return <div className={`${styles.preview} ${styles.renewal}`}>
    <span className={styles.previewMark}>C</span>
    <div><small>待确认</small><strong>ChatGPT Plus</strong><p>8月24日 · ¥135/月</p></div>
    <b>已续费</b>
  </div>;
  return <div className={`${styles.preview} ${styles.ledger}`}>
    <div><span className={styles.previewMark}>Q</span><p><strong>QQ音乐</strong><small>音乐 · 每月</small></p><b>¥15</b></div>
    <div><span className={styles.previewMark}>8</span><p><strong>淘宝 88VIP</strong><small>购物 · 每年</small></p><b>¥7.33</b></div>
    <div><span className={styles.previewMark}>W</span><p><strong>WPS 会员</strong><small>效率工具 · 每年</small></p><b>¥12.42</b></div>
  </div>;
}
