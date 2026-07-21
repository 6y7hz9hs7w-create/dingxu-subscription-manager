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

const fallbackSubscriptions: Subscription[] = [];

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
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 6, 1));
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSubscriptions = async () => {
    try {
      const response = await fetch("/api/subscriptions", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = await response.json() as { subscriptions: Subscription[] };
      setSubscriptions(data.subscriptions);
    } catch {
      setToast("暂时无法读取订阅，请稍后再试");
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCalendar(false);
        setShowAdd(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

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

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    return [...Array.from({ length: leading }, () => null), ...Array.from({ length: total }, (_, index) => index + 1)];
  }, [calendarMonth]);
  const monthSubscriptions = useMemo(() => subscriptions.filter((item) => {
    const date = new Date(`${item.next_charge_date}T00:00:00`);
    return date.getFullYear() === calendarMonth.getFullYear() && date.getMonth() === calendarMonth.getMonth();
  }), [subscriptions, calendarMonth]);

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
          <button className={showCalendar ? "active" : ""} onClick={() => setShowCalendar(true)}><span>□</span>续费日历</button>
          <a href="#insights"><span>◔</span>消费分析</a>
        </nav>
        <div className="side-bottom">
          <div className="tip-card"><span>省</span><strong>理性订阅</strong><p>每月复盘一次，钱要花在值得的地方。</p></div>
          <button className="ghost-nav"><span>⚙</span>设置</button>
          <div className="profile"><span>我</span><div><strong>我的账户</strong><small>个人空间</small></div><b>···</b></div>
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
            <div><p className="eyebrow">TUESDAY · 7月21日</p><h1>下午好 <span>☀</span></h1><p>{subscriptions.length ? <>你的订阅都在掌控中。未来 7 天有 <strong>{upcoming.length} 笔</strong>即将续费。</> : <>这里还没有订阅记录，添加第一项开始管理。</>}</p></div>
            <div className="month-switch"><button aria-label="上个月">‹</button><span>2026年 7月</span><button aria-label="下个月">›</button></div>
          </section>

          <section className="stats-grid" aria-label="订阅数据概览">
            <article className="stat-card primary"><div className="stat-top"><span>本月订阅支出</span><b>¥</b></div><strong>{money(monthlyCost)}</strong><div className="stat-foot"><span>{subscriptions.length ? "按当前订阅计算" : "添加订阅后自动统计"}</span><i>{active.length} 项生效中</i></div><div className="budget-track"><span style={{ width: subscriptions.length ? "18%" : "0%" }} /></div></article>
            <article className="stat-card"><div className="stat-top"><span>年度预估</span><b className="peach">↗</b></div><strong>{money(yearlyCost)}</strong><div className="stat-foot"><span>共 {active.length} 项生效中</span><i>¥{Math.round(yearlyCost / 100 / 365)}/天</i></div></article>
            <article className="stat-card"><div className="stat-top"><span>7 天内将扣款</span><b className="yellow">!</b></div><strong>{money(upcomingTotal)}</strong><div className="stat-foot"><span>{upcoming.length ? `最近：${dateLabel(upcoming[0].next_charge_date)}` : "暂无扣款"}</span><i className="warning">需留意</i></div></article>
            <article className="stat-card saving"><div className="stat-top"><span>本月可省</span><b className="mint">叶</b></div><strong>{money(potentialSaving)}</strong><div className="stat-foot"><span>{subscriptions.length ? "来自智能建议" : "暂无分析数据"}</span>{subscriptions.length > 0 && <button onClick={() => document.getElementById("insights")?.scrollIntoView({ behavior: "smooth" })}>查看建议 →</button>}</div></article>
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
                )) : <div className="empty-mini"><span>○</span><strong>{subscriptions.length ? "未来 7 天没有扣款" : "还没有续费计划"}</strong><p>{subscriptions.length ? "安心享受当前订阅吧。" : "添加订阅后，续费日会集中显示在这里。"}</p>{!subscriptions.length && <button onClick={() => setShowAdd(true)}>添加第一项订阅</button>}</div>}
              </div>
              {upcoming.length > 0 && <div className="reminder-note"><span>铃</span><p><strong>续费提醒已开启</strong>，我们会在扣款前 {Math.min(...upcoming.map((i) => i.reminder_days))} 天再次提醒你。</p><button>管理提醒</button></div>}
            </article>

            <article id="insights" className="panel insight-panel">
              <div className="panel-title"><div><p className="eyebrow">INSIGHTS</p><h2>花在哪里</h2></div><button>本月⌄</button></div>
              <div className="spend-total"><span>月均订阅</span><strong>{money(monthlyCost)}</strong></div>
              <div className="bars">
                {categorySpend.length ? categorySpend.map(([category, amount], index) => (
                  <div className="bar-row" key={category}><span>{category}</span><div><i style={{ width: `${Math.max(amount / categorySpend[0][1] * 100, 10)}%`, background: ["#28604F", "#F2C84B", "#EE8C74", "#9DC7E8"][index] }} /></div><strong>{money(Math.round(amount))}</strong></div>
                )) : <div className="empty-bars"><i /><i /><i /><span>添加订阅后查看消费分布</span></div>}
              </div>
              <div className="insight-callout"><span>✦</span><div><strong>小续发现</strong><p>{subscriptions.length ? <>定期检查使用频率，预计每月可省 {money(potentialSaving)}。</> : <>至少添加 2 项订阅后，这里会给出更有价值的节省建议。</>}</p></div></div>
            </article>
          </section>

          <section id="subscriptions" className="subscriptions-section">
            <div className="section-head"><div><p className="eyebrow">ALL SERVICES</p><h2>我的订阅 <span>{subscriptions.length}</span></h2></div><button className="outline-add" onClick={() => setShowAdd(true)}>＋ 添加订阅</button></div>
            <div className="filter-row" role="tablist" aria-label="订阅分类">
              {categories.map((category) => <button key={category} className={filter === category ? "active" : ""} onClick={() => setFilter(category)}>{category}</button>)}
            </div>
            <div className={`subscription-grid ${loading ? "is-loading" : ""} ${!filtered.length ? "is-empty" : ""}`}>
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
              <button className="add-card" onClick={() => setShowAdd(true)}><span>＋</span><strong>{subscriptions.length ? "添加新订阅" : "从第一项订阅开始"}</strong><small>{subscriptions.length ? "记录下一笔会员服务" : "记录服务、金额和续费日期"}</small></button>
            </div>
          </section>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航"><a className="active" href="#overview">⌂<span>总览</span></a><a href="#subscriptions">▦<span>订阅</span></a><button className="mobile-add" onClick={() => setShowAdd(true)}>＋</button><button className="nav-item" onClick={() => setShowCalendar(true)}>□<span>日历</span></button><a href="#insights">◔<span>分析</span></a></nav>

      {showCalendar && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCalendar(false); }}>
        <div className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-title">
          <div className="calendar-head">
            <div><p className="eyebrow">RENEWAL CALENDAR</p><h2 id="calendar-title">续费日历</h2><span>每一笔续费，都提前看见。</span></div>
            <button onClick={() => setShowCalendar(false)} aria-label="关闭续费日历">×</button>
          </div>
          <div className="calendar-toolbar">
            <button aria-label="上个月" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
            <strong>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</strong>
            <button aria-label="下个月" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="calendar-week" aria-hidden="true">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid" aria-label={`${calendarMonth.getFullYear()}年${calendarMonth.getMonth() + 1}月`}>
            {calendarCells.map((day, index) => {
              if (!day) return <span className="calendar-day blank" key={`blank-${index}`} />;
              const dateKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const items = monthSubscriptions.filter((item) => item.next_charge_date === dateKey);
              const isToday = dateKey === "2026-07-21";
              return <button className={`calendar-day ${isToday ? "today" : ""} ${items.length ? "has-renewal" : ""}`} key={dateKey} aria-label={`${dateKey}${items.length ? `，${items.length}项续费` : ""}`}>
                <span>{day}</span>{items.length > 0 && <i style={{ background: items[0].color }} />}
              </button>;
            })}
          </div>
          <div className="calendar-agenda">
            <div className="agenda-title"><strong>本月续费</strong><span>{monthSubscriptions.length} 项</span></div>
            {monthSubscriptions.length ? monthSubscriptions.map((item) => <div className="agenda-item" key={item.id}>
              <div className="service-mark" style={{ background: item.color }}>{item.mark}</div>
              <div><strong>{item.name}</strong><span>{dateLabel(item.next_charge_date)} · {item.note || item.category}</span></div>
              <b>{money(item.amount_cents)}</b>
            </div>) : <div className="calendar-empty"><span>○</span><div><strong>本月暂无续费安排</strong><p>添加订阅后，扣款日期会自动出现在日历中。</p></div></div>}
          </div>
          <div className="calendar-actions"><button onClick={() => setShowCalendar(false)}>完成</button><button onClick={() => { setShowCalendar(false); setShowAdd(true); }}>＋ 添加订阅</button></div>
        </div>
      </div>}

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
