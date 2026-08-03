"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./sync.module.css";

type User = { nickname?: string; idHint?: string; profileComplete?: boolean };
type Subscription = {
  _id?: string;
  name?: string;
  category?: string;
  amountCents?: number;
  billingCycle?: "monthly" | "yearly";
  nextChargeDate?: string;
  status?: string;
};
type SyncData = {
  authenticated?: boolean;
  code?: string;
  error?: string;
  expiresAt?: string;
  status?: "pending" | "confirmed";
  subscriptions?: Subscription[];
  user?: User | null;
};

type View = "subscriptions" | "calendar" | "analysis";

function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(cents / 100);
}

function statusLabel(status?: string) {
  return ({ active: "生效中", paused: "已暂停", cancel_pending: "计划取消", pending_confirmation: "待确认", archived: "已归档" } as Record<string, string>)[status || ""] || "未分类";
}

function dateLabel(value?: string) {
  if (!value) return "未设置日期";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

export default function WebSync() {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("subscriptions");
  const [actionBusy, setActionBusy] = useState("");

  const applyAuthenticated = useCallback((data: SyncData) => {
    setUser(data.user || null);
    setSubscriptions(data.subscriptions || []);
    setCode("");
    setExpiresAt("");
  }, []);

  useEffect(() => {
    fetch("/api/cloud-sync", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: SyncData) => {
        if (data.authenticated) applyAuthenticated(data);
        else if (data.error) setError(data.error);
      })
      .catch(() => setError("暂时无法连接同步服务"))
      .finally(() => setReady(true));
  }, [applyAuthenticated]);

  const monthlyCents = useMemo(() => subscriptions
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + Number(item.amountCents || 0) / (item.billingCycle === "yearly" ? 12 : 1), 0), [subscriptions]);

  async function post(action: string, payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/cloud-sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = (await response.json()) as SyncData;
    if (!response.ok || data.error) throw new Error(data.error || "操作失败");
    return data;
  }

  async function createBinding() {
    setBusy(true);
    setError("");
    try {
      const data = await post("createBinding");
      setCode(data.code || "");
      setExpiresAt(data.expiresAt || "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法生成绑定码");
    } finally {
      setBusy(false);
    }
  }

  async function checkBinding() {
    setChecking(true);
    setError("");
    try {
      const data = await post("checkBinding");
      if (data.authenticated) applyAuthenticated(data);
      else setError("尚未在小程序确认，请确认后再检查");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "检查失败");
    } finally {
      setChecking(false);
    }
  }

  async function logout() {
    setBusy(true);
    await post("logout").catch(() => null);
    setUser(null);
    setSubscriptions([]);
    setBusy(false);
  }

  async function manage(id: string | undefined, operation: string) {
    if (!id || actionBusy) return;
    const warning = ({
      renew: "确认已经完成续费，并将续费日顺延到下一周期？",
      cancel: "确认将这项订阅标记为计划取消？这不会替你关闭服务商的自动续费。",
      delete: "确认永久删除这项记录？删除后无法恢复。",
    } as Record<string, string>)[operation];
    if (warning && !window.confirm(warning)) return;
    setActionBusy(id + operation);
    setError("");
    try {
      const data = operation === "delete"
        ? await post("delete", { id })
        : await post("updateStatus", { id, operation });
      setSubscriptions(data.subscriptions || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "操作失败");
    } finally {
      setActionBusy("");
    }
  }

  function exportCsv() {
    const rows = [["服务名称", "分类", "金额（元）", "周期", "下次续费", "状态"], ...subscriptions.map((item) => [
      item.name || "",
      item.category || "其他",
      (Number(item.amountCents || 0) / 100).toFixed(2),
      item.billingCycle === "yearly" ? "每年" : "每月",
      item.nextChargeDate || "",
      statusLabel(item.status),
    ])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `订序订阅-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const visibleSubscriptions = useMemo(() => subscriptions.filter((item) => item.status !== "archived"), [subscriptions]);
  const categoryData = useMemo(() => {
    const totals = new Map<string, number>();
    visibleSubscriptions.filter((item) => item.status === "active").forEach((item) => {
      const monthly = Number(item.amountCents || 0) / (item.billingCycle === "yearly" ? 12 : 1);
      totals.set(item.category || "其他", (totals.get(item.category || "其他") || 0) + monthly);
    });
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [visibleSubscriptions]);
  const calendarData = useMemo(() => visibleSubscriptions
    .filter((item) => item.nextChargeDate)
    .sort((a, b) => String(a.nextChargeDate).localeCompare(String(b.nextChargeDate))), [visibleSubscriptions]);

  if (!ready) return <main className={styles.shell}><section className={styles.loading}>正在检查微信数据连接…</section></main>;

  return (
    <main className={styles.shell}>
      <div className={styles.orbOne} aria-hidden="true" />
      <div className={styles.orbTwo} aria-hidden="true" />
      <section className={styles.card}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="返回订序首页"><span aria-hidden="true">序</span><strong>订序</strong></Link>
          <div className={styles.headerActions}>
            <span className={styles.secure}><i aria-hidden="true" />{user ? "微信数据已连接" : "安全绑定"}</span>
            {user ? <button className={styles.logout} onClick={logout} disabled={busy}>解除绑定</button> : null}
          </div>
        </header>

        {user ? (
          <div className={styles.dashboard}>
            <div className={styles.welcomeRow}>
              <div className={styles.welcome}>
                <h1>{user.nickname || "微信用户"}的订阅账本</h1>
                <p>把每月固定支出、续费日期和处理状态放在同一本账里。</p>
              </div>
              <button className={styles.exportButton} onClick={exportCsv}>导出账单</button>
            </div>
            <div className={styles.metrics}>
              <article><span>月均订阅支出</span><strong>{money(Math.round(monthlyCents))}</strong><small>年付项目已平均到每月</small></article>
              <article><span>生效中</span><strong>{subscriptions.filter((item) => item.status === "active").length}</strong><small>项持续扣款</small></article>
              <article><span>全部记录</span><strong>{visibleSubscriptions.length}</strong><small>项订阅</small></article>
            </div>
            <nav className={styles.tabs} aria-label="网页功能">
              {(["subscriptions", "calendar", "analysis"] as View[]).map((item) => (
                <button key={item} aria-pressed={view === item} className={view === item ? styles.activeTab : ""} onClick={() => setView(item)}>
                  {{ subscriptions: "订阅管理", calendar: "续费日历", analysis: "消费分析" }[item]}
                </button>
              ))}
            </nav>

            {view === "subscriptions" ? <section className={styles.viewStage}>
              <div className={styles.listHead}><div><h2>订阅流水</h2><p>按服务核对金额、日期与当前状态</p></div><span>{subscriptions.length} 项</span></div>
              <div className={styles.list}>
                {subscriptions.length ? subscriptions.map((item) => (
                  <article key={item._id || item.name} className={styles.item} data-status={item.status || "unknown"}>
                    <div className={styles.itemMain}>
                      <div className={styles.serviceIcon} aria-hidden="true">{(item.name || "订").slice(0, 1)}</div>
                      <div><strong>{item.name || "未命名订阅"}</strong><span>{item.category || "其他"} · {dateLabel(item.nextChargeDate)}</span></div>
                      <div className={styles.itemPrice}><strong>{money(Number(item.amountCents || 0))}</strong><span className={styles.status}>{statusLabel(item.status)}</span></div>
                    </div>
                    <div className={styles.actions}>
                      {item.status === "active" ? <><button disabled={Boolean(actionBusy)} onClick={() => manage(item._id, "pause")}>暂停</button><button disabled={Boolean(actionBusy)} onClick={() => manage(item._id, "renew")}>确认续费</button><button disabled={Boolean(actionBusy)} className={styles.danger} onClick={() => manage(item._id, "cancel")}>取消订阅</button></> : null}
                      {item.status === "pending_confirmation" ? <><button disabled={Boolean(actionBusy)} onClick={() => manage(item._id, "renew")}>已续费</button><button disabled={Boolean(actionBusy)} className={styles.danger} onClick={() => manage(item._id, "cancel")}>已取消</button></> : null}
                      {["paused", "cancel_pending", "archived"].includes(item.status || "") ? <><button disabled={Boolean(actionBusy)} onClick={() => manage(item._id, "restore")}>恢复订阅</button><button disabled={Boolean(actionBusy)} className={styles.danger} onClick={() => manage(item._id, "delete")}>永久删除</button></> : null}
                    </div>
                  </article>
                )) : <div className={styles.empty}>小程序里还没有订阅，添加后会在这里同步显示。</div>}
              </div>
              <aside className={styles.readonly}><span aria-hidden="true">提示</span><div><strong>微信提醒仍需在小程序授权</strong><p>网页可以处理续费状态；新增订阅、编辑资料和提醒授权请继续使用小程序。</p></div></aside>
            </section> : null}

            {view === "calendar" ? <section className={`${styles.panel} ${styles.viewStage}`}>
              <div className={styles.panelHead}><h2>接下来的续费</h2><p>按日期查看即将发生的订阅账目</p></div>
              <div className={styles.timeline}>{calendarData.length ? calendarData.map((item) => <article key={item._id || item.name}>
                <time>{dateLabel(item.nextChargeDate)}</time><div><strong>{item.name}</strong><span>{item.category || "其他"} · {statusLabel(item.status)}</span></div><b>{money(Number(item.amountCents || 0))}</b>
              </article>) : <div className={styles.empty}>暂无续费安排</div>}</div>
            </section> : null}

            {view === "analysis" ? <section className={`${styles.panel} ${styles.viewStage}`}>
              <div className={styles.panelHead}><h2>每月的钱花在哪</h2><p>按月均口径查看分类占比</p></div>
              <div className={styles.analysisHero}><div><span>月均支出</span><strong>{money(Math.round(monthlyCents))}</strong></div><div><span>一年预计</span><strong>{money(Math.round(monthlyCents * 12))}</strong></div></div>
              <div className={styles.breakdown}>{categoryData.length ? categoryData.map(([category, cents]) => {
                const percent = monthlyCents ? Math.round(cents / monthlyCents * 100) : 0;
                return <article key={category}><div><strong>{category}</strong><span>{money(Math.round(cents))}/月 · {percent}%</span></div><i><b style={{ width: `${Math.max(percent, 2)}%` }} /></i></article>;
              }) : <div className={styles.empty}>暂无生效中的订阅数据</div>}</div>
            </section> : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {actionBusy ? <div className={styles.saving}>正在同步到微信云端…</div> : null}
          </div>
        ) : (
          <div className={styles.bind}>
            <div className={styles.bindIntro}>
              <span className={styles.bindStamp}>微信同步</span>
              <h1>把小程序里的订阅，带到网页上</h1>
              <p className={styles.lead}>无需填写微信账号或密码。生成一次性绑定码，再到小程序“我的”页面确认即可。</p>
            </div>
            <ol className={styles.steps}>
              <li><span>1</span><div><strong>生成绑定码</strong><small>绑定码仅 10 分钟有效</small></div></li>
              <li><span>2</span><div><strong>打开小程序 → 我的 → 绑定网页版</strong><small>输入并确认这组 8 位数字</small></div></li>
              <li><span>3</span><div><strong>回到网页检查结果</strong><small>确认后立即读取同一份云端数据</small></div></li>
            </ol>
            {code ? (
              <div className={styles.codeArea}>
                <span>你的 8 位绑定码</span>
                <strong>{code.slice(0, 4)} {code.slice(4)}</strong>
                <small>{expiresAt ? `${new Date(expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效` : "10 分钟内有效"}</small>
                <button onClick={checkBinding} disabled={checking}>{checking ? "正在检查…" : "我已在小程序确认"}</button>
                <button className={styles.textButton} onClick={createBinding} disabled={busy}>重新生成绑定码</button>
              </div>
            ) : <button className={styles.primary} onClick={createBinding} disabled={busy}>{busy ? "正在生成…" : "生成微信绑定码"}</button>}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.privacy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>网页只保存随机会话令牌，不保存、不展示你的微信用户标识。</span></div>
          </div>
        )}
      </section>
    </main>
  );
}
