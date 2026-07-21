"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Subscription = {
  id: number;
  name: string;
  category: string;
  amount_cents: number;
  billing_cycle: "monthly" | "yearly";
  next_charge_date: string;
  color: string;
  mark: string;
  note: string;
  reminder_days: number;
  status: "active" | "cancel_pending";
};

const fallbackSubscriptions: Subscription[] = [
  { id: 1, name: "爱奇艺 VIP", category: "影音娱乐", amount_cents: 2580, billing_cycle: "monthly", next_charge_date: "2026-07-23", color: "#FFE46B", mark: "爱", note: "连续包月", reminder_days: 2, status: "active" },
  { id: 2, name: "iCloud+", category: "云存储", amount_cents: 2100, billing_cycle: "monthly", next_charge_date: "2026-07-26", color: "#B8DBFF", mark: "☁", note: "200GB", reminder_days: 3, status: "active" },
  { id: 3, name: "网易云音乐", category: "音乐", amount_cents: 1800, billing_cycle: "monthly", next_charge_date: "2026-07-29", color: "#FFB9AE", mark: "音", note: "黑胶 VIP", reminder_days: 3, status: "active" },
  { id: 4, name: "Keep", category: "健康运动", amount_cents: 19800, billing_cycle: "yearly", next_charge_date: "2026-08-06", color: "#CDEB7B", mark: "K", note: "年度会员", reminder_days: 7, status: "active" },
  { id: 5, name: "Notion", category: "效率工具", amount_cents: 7200, billing_cycle: "monthly", next_charge_date: "2026-08-12", color: "#D8D2C6", mark: "N", note: "Plus 方案", reminder_days: 5, status: "active" },
  { id: 6, name: "Apple Music", category: "音乐", amount_cents: 1100, billing_cycle: "monthly", next_charge_date: "2026-08-18", color: "#FFC1D3", mark: "♫", note: "个人方案", reminder_days: 3, status: "active" },
];

const categories = ["全部", "影音娱乐", "音乐", "效率工具", "云存储", "健康运动"];
const colorOptions = ["#FFE46B", "#B8DBFF", "#FFB9AE", "#CDEB7B", "#D8D2C6", "#FFC1D3"];
const today = new Date("2026-07-21T00:00:00");

function money(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

function daysUntil(date: string) {
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86400000);
}

function dateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function SubscriptionApp() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(fallbackSubscriptions);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSubscriptions = async () => {
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = await response.json() as { subscriptions: Subscription[] };
      setSubscriptions(data.subscriptions);
    } catch {
      setToast("当前显示演示数据，稍后会自动同步");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSubscriptions(); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const active = subscriptions.filter((item) => item.status === "active");
  const monthlyCost = active.reduce((sum, item) => sum + (item.billing_cycle === "yearly" ? Math.round(item.amount_cents / 12) : item.amount_cents), 0);
  const upcoming = active.filter((item) => daysUntil(item.next_charge_date) >= 0 && daysUntil(item.next_charge_date) <= 7);
  const upcomingTotal = upcoming.reduce((sum, item) => sum + item.amount_cents, 0);
  const yearlyCost = monthlyCost * 12;
  const potentialSaving = active.filter((item) => ["影音娱乐", "效率工具"].includes(item.category)).reduce((sum, item) => sum + Math.round((item.billing_cycle === "yearly" ? item.amount_cents / 12 : item.amount_cents) * 0.2), 0);

  const filtered = useMemo(() => subscriptions.filter((item) => {
    const matchesFilter = filter === "全部" || item.category === filter;
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase()) || item.category.includes(query);
    return matchesFilter && matchesQuery;
  }), [subscriptions, filter, query]);

  const categorySpend = useMemo(() => {
    const totals = new Map<string, number>();
    active.forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + (item.billing_cycle === "yearly" ? item.amount_cents / 12 : item.amount_cents)));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [subscriptions]);

  const act = async (id: number, action: "cancel" | "renew" | "restore") => {
    setBusy(true);
    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) throw new Error("action failed");
      await loadSubscriptions();
      setToast(action === "cancel" ? "已记录取消计划，续费日前会再提醒你" : action === "renew" ? "已将续费日期顺延" : "已恢复订阅");
    } catch {
      setToast("操作没有成功，请再试一次");
    } finally {
      setBusy(false);
    }
  };

  const addSubscription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get("name"), category: form.get("category"), amount: Number(form.get("amount")),
      billingCycle: form.get("billingCycle"), nextChargeDate: form.get("nextChargeDate"),
      reminderDays: Number(form.get("reminderDays")), color: form.get("color"), note: form.get("note"),
    };
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("add failed");
      await loadSubscriptions();
      setShowAdd(false);
      setToast("订阅已添加，续费前会提醒你");
    } catch {
      setToast("添加没有成功，请检查后再试");
    } finally { setBusy(false); }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="续续首页">
          <span className="brand-mark"><i /><i /></span><span>续续</span>
        </a>
        <nav className="side-nav" aria-label="主导航">
          <a className="active" href="#overview"><span>⌂</span>总览</a>
          <a href="#subscriptions"><span>▦</span>我的订阅</a>
          <a href="#calendar"><span>□</span>续费日历</a>
          <a href="#insights"><span>◔</span>消费分析</a>
        </nav>
        <div className="side-bottom">
          <div className="tip-card"><span>省</span><strong>理性订阅</strong><p>每月复盘一次，钱要花在值得的地方。</p></div>
          <button className="ghost-nav"><span>⚙</span>设置</button>
          <div className="profile"><span>许</span><div><strong>许同学</strong><small>个人账户</small></div><b>···</b></div>
        </div>
      </aside>

      <main id="top" className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><i /><i /></span>续续</div>
          <div className="search"><span>⌕</span><input aria-label="搜索订阅" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索订阅…" /></div>
          <button className="icon-button" aria-label="通知">♧<span /></button>
          <button className="add-button" onClick={() => setShowAdd(true)}><b>＋</b>添加订阅</button>
        </header>

        <div className="page-wrap">
          <section id="overview" className="hero-row">
            <div><p className="eyebrow">TUESDAY · 7月21日</p><h1>下午好，许同学 <span>☀</span></h1><p>你的订阅都在掌控中。未来 7 天有 <strong>{upcoming.length} 笔</strong>即将续费。</p></div>
            <div className="month-switch"><button aria-label="上个月">‹</button><span>2026年 7月</span><button aria-label="下个月">›</button></div>
          </section>

          <section className="stats-grid" aria-label="订阅数据概览">
            <article className="stat-card primary"><div className="stat-top"><span>本月订阅支出</span><b>¥</b></div><strong>{money(monthlyCost)}</strong><div className="stat-foot"><span>较上月 <em>↓ 8.6%</em></span><i>预算 ¥500</i></div><div className="budget-track"><span style={{ width: `${Math.min(monthlyCost / 50000 * 100, 100)}%` }} /></div></article>
            <article className="stat-card"><div className="stat-top"><span>年度预估</span><b className="peach">↗</b></div><strong>{money(yearlyCost)}</strong><div className="stat-foot"><span>共 {active.length} 项生效中</span><i>¥{Math.round(yearlyCost / 100 / 365)}/天</i></div></article>
            <article className="stat-card"><div className="stat-top"><span>7 天内将扣款</span><b className="yellow">!</b></div><strong>{money(upcomingTotal)}</strong><div className="stat-foot"><span>{upcoming.length ? `最近：${dateLabel(upcoming[0].next_charge_date)}` : "暂无扣款"}</span><i className="warning">需留意</i></div></article>
            <article className="stat-card saving"><div className="stat-top"><span>本月可省</span><b className="mint">叶</b></div><strong>{money(potentialSaving)}</strong><div className="stat-foot"><span>来自智能建议</span><button onClick={() => document.getElementById("insights")?.scrollIntoView({ behavior: "smooth" })}>查看建议 →</button></div></article>
          </section>

          <section id="calendar" className="content-grid">
            <article className="panel upcoming-panel">
              <div className="panel-title"><div><p className="eyebrow">UP NEXT</p><h2>即将续费</h2></div><a href="#subscriptions">查看全部 <span>→</span></a></div>
              <div className="renew-list">
                {upcoming.length ? upcoming.map((item) => (
                  <div className="renew-item" key={item.id}>
                    <div className="service-mark" style={{ background: item.color }}>{item.mark}</div>
                    <div className="service-main"><strong>{item.name}</strong><span>{item.note} · {item.category}</span></div>
                    <div className="renew-date"><b>{daysUntil(item.next_charge_date) === 0 ? "今天" : `${daysUntil(item.next_charge_date)}天后`}</b><span>{dateLabel(item.next_charge_date)}</span></div>
                    <div className="renew-price"><strong>{money(item.amount_cents)}</strong><span>/{item.billing_cycle === "yearly" ? "年" : "月"}</span></div>
                    <button className="more" aria-label={`管理${item.name}`} onClick={() => void act(item.id, "renew")} disabled={busy}>续</button>
                  </div>
                )) : <div className="empty-mini">未来 7 天没有扣款，安心享受吧。</div>}
              </div>
              {upcoming.length > 0 && <div className="reminder-note"><span>铃</span><p><strong>续费提醒已开启</strong>，我们会在扣款前 {Math.min(...upcoming.map((i) => i.reminder_days))} 天再次提醒你。</p><button>管理提醒</button></div>}
            </article>

            <article id="insights" className="panel insight-panel">
              <div className="panel-title"><div><p className="eyebrow">INSIGHTS</p><h2>花在哪里</h2></div><button>本月⌄</button></div>
              <div className="spend-total"><span>月均订阅</span><strong>{money(monthlyCost)}</strong></div>
              <div className="bars">
                {categorySpend.map(([category, amount], index) => (
                  <div className="bar-row" key={category}><span>{category}</span><div><i style={{ width: `${Math.max(amount / categorySpend[0][1] * 100, 10)}%`, background: ["#28604F", "#F2C84B", "#EE8C74", "#9DC7E8"][index] }} /></div><strong>{money(Math.round(amount))}</strong></div>
                ))}
              </div>
              <div className="insight-callout"><span>✦</span><div><strong>小续发现</strong><p>影音与效率工具占支出较高，定期检查使用频率，预计每月可省 {money(potentialSaving)}。</p></div></div>
            </article>
          </section>

          <section id="subscriptions" className="subscriptions-section">
            <div className="section-head"><div><p className="eyebrow">ALL SERVICES</p><h2>我的订阅 <span>{subscriptions.length}</span></h2></div><button className="outline-add" onClick={() => setShowAdd(true)}>＋ 添加订阅</button></div>
            <div className="filter-row" role="tablist" aria-label="订阅分类">
              {categories.map((category) => <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category}</button>)}
            </div>
            <div className={`subscription-grid ${loading ? "is-loading" : ""}`}>
              {filtered.map((item) => (
                <article className={`subscription-card ${item.status === "cancel_pending" ? "cancelled" : ""}`} key={item.id}>
                  <div className="card-top"><div className="service-mark large" style={{ background: item.color }}>{item.mark}</div><button aria-label={`更多${item.name}`}>···</button></div>
                  <strong className="service-name">{item.name}</strong><span className="service-meta">{item.note} · {item.category}</span>
                  <div className="card-price"><strong>{money(item.amount_cents)}</strong><span>/{item.billing_cycle === "yearly" ? "年" : "月"}</span></div>
                  <div className="card-divider" />
                  <div className="card-date"><span>{item.status === "cancel_pending" ? "计划取消" : "下次续费"}</span><strong>{dateLabel(item.next_charge_date)}</strong></div>
                  <div className="card-actions">
                    <button onClick={() => void act(item.id, "renew")} disabled={busy}>确认续费</button>
                    <button className="danger" onClick={() => void act(item.id, item.status === "cancel_pending" ? "restore" : "cancel")} disabled={busy}>{item.status === "cancel_pending" ? "恢复订阅" : "到期取消"}</button>
                  </div>
                </article>
              ))}
              <button className="add-card" onClick={() => setShowAdd(true)}><span>＋</span><strong>添加新订阅</strong><small>记录下一笔会员服务</small></button>
            </div>
          </section>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航"><a className="active" href="#overview">⌂<span>总览</span></a><a href="#subscriptions">▦<span>订阅</span></a><button onClick={() => setShowAdd(true)}>＋</button><a href="#calendar">□<span>日历</span></a><a href="#insights">◔<span>分析</span></a></nav>

      {showAdd && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
          <div className="modal-head"><div><p className="eyebrow">NEW SUBSCRIPTION</p><h2 id="add-title">添加订阅</h2><span>记录下来，续费前替你留意。</span></div><button onClick={() => setShowAdd(false)} aria-label="关闭">×</button></div>
          <form onSubmit={addSubscription}>
            <label className="full">服务名称<input name="name" required placeholder="例如：腾讯视频 VIP" autoFocus /></label>
            <label>订阅分类<select name="category" defaultValue="影音娱乐">{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>账单周期<select name="billingCycle" defaultValue="monthly"><option value="monthly">每月</option><option value="yearly">每年</option></select></label>
            <label>订阅金额<input name="amount" type="number" step="0.01" min="0.01" required placeholder="¥ 0.00" /></label>
            <label>下次续费<input name="nextChargeDate" type="date" min="2026-07-21" required defaultValue="2026-08-21" /></label>
            <label>提前提醒<select name="reminderDays" defaultValue="3"><option value="1">1 天前</option><option value="3">3 天前</option><option value="5">5 天前</option><option value="7">7 天前</option></select></label>
            <label>标记颜色<select name="color" defaultValue={colorOptions[0]}>{colorOptions.map((color, i) => <option key={color} value={color}>颜色 {i + 1}</option>)}</select></label>
            <label className="full">备注<input name="note" placeholder="例如：与家人共享" /></label>
            <div className="form-actions"><button type="button" onClick={() => setShowAdd(false)}>取消</button><button className="submit" type="submit" disabled={busy}>{busy ? "正在添加…" : "添加并开启提醒"}</button></div>
          </form>
        </div>
      </div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}
