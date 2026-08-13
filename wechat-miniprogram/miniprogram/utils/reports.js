/* eslint-disable @typescript-eslint/no-require-imports */
const subscriptions = require("./subscriptions");

function csvCell(value) {
  const text = String(value === undefined || value === null ? "" : value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, "\"\"")}"`;
}

function dateKey(now = new Date()) {
  return `${now.getFullYear()}-${subscriptions.pad(now.getMonth() + 1)}-${subscriptions.pad(now.getDate())}`;
}

function amountNumber(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function cycleText(item) {
  return item.billingCycle === "yearly" ? "年付" : "月付";
}

function statusText(item) {
  if (item.status === "paused") return "已暂停";
  if (item.status === "pending_confirmation") return "待确认";
  if (item.status === "archived") return "历史记录";
  return item.status === "active" ? "生效中" : "计划取消";
}

function currencyText(item) {
  return item.currency === "USD" ? "美元 USD" : "人民币 CNY";
}

function sourceAmountNumber(item) {
  return amountNumber(item.currency === "USD" ? item.sourceAmountCents : item.amountCents);
}

function exchangeRateNumber(item) {
  return item.currency === "USD" ? Number(item.exchangeRate || 0).toFixed(4) : "";
}

function paymentChannelText(item) {
  return subscriptions.paymentChannelInfo(item.paymentChannel).label;
}

function toCsv(headers, rows) {
  return `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function allSubscriptionsReport(items, now) {
  const active = items.filter((item) => item.status === "active");
  const monthly = active.reduce((sum, item) => sum + subscriptions.monthlyCents(item), 0);
  const rows = items.slice().sort((left, right) => left.nextChargeDate.localeCompare(right.nextChargeDate));
  const exportRows = rows.map((item) => ({
    meta: `${item.category} · ${paymentChannelText(item)} · ${statusText(item)} · ${item.dateText}`,
    title: item.name,
    value: `${item.amountText}/${item.cycleText}`,
  }));
  const csvRows = rows.map((item) => [
    item.name,
    item.category,
    statusText(item),
    cycleText(item),
    paymentChannelText(item),
    currencyText(item),
    sourceAmountNumber(item),
    exchangeRateNumber(item),
    amountNumber(item.amountCents),
    item.nextChargeDate,
    item.reminderStatusText,
    item.serviceClosedAt || "",
    item.note || "",
  ]);
  return {
    csv: toCsv(["服务名称", "分类", "状态", "账单周期", "扣款渠道", "原始币种", "原始金额", "美元兑人民币汇率", "折合人民币（元）", "下次续费日", "提醒状态", "关闭自动续费确认日", "备注"], csvRows),
    fileName: `dingxu-all-subscriptions-${dateKey(now)}.csv`,
    metricLabel: "当前月均支出",
    metricValue: subscriptions.money(monthly),
    rows: exportRows,
    subtitle: `共 ${items.length} 项 · ${active.length} 项生效中`,
    title: "我的全部订阅",
  };
}

function monthlyReport(items, now) {
  const monthKey = `${now.getFullYear()}-${subscriptions.pad(now.getMonth() + 1)}`;
  const rows = items
    .filter((item) => item.status === "active" && String(item.nextChargeDate || "").startsWith(monthKey))
    .sort((left, right) => left.nextChargeDate.localeCompare(right.nextChargeDate));
  const total = rows.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const exportRows = rows.map((item) => ({
    meta: `${item.dateText} · ${item.category} · ${paymentChannelText(item)} · ${cycleText(item)}`,
    title: item.name,
    value: item.amountText,
  }));
  const csvRows = rows.map((item) => [
    item.name,
    item.category,
    item.nextChargeDate,
    cycleText(item),
    paymentChannelText(item),
    currencyText(item),
    sourceAmountNumber(item),
    exchangeRateNumber(item),
    amountNumber(item.amountCents),
    item.reminderStatusText,
  ]);
  return {
    csv: toCsv(["服务名称", "分类", "计划续费日", "账单周期", "扣款渠道", "原始币种", "原始金额", "美元兑人民币汇率", "计划支出人民币（元）", "提醒状态"], csvRows),
    fileName: `dingxu-monthly-report-${monthKey}.csv`,
    metricLabel: "本月计划支出",
    metricValue: subscriptions.money(total),
    rows: exportRows,
    subtitle: `${now.getFullYear()}年${now.getMonth() + 1}月 · 按计划续费统计`,
    title: "本月支出报告",
  };
}

function annualReport(items, now) {
  const rows = items
    .filter((item) => item.status === "active")
    .slice()
    .sort((left, right) => subscriptions.annualCents(right) - subscriptions.annualCents(left));
  const total = rows.reduce((sum, item) => sum + subscriptions.annualCents(item), 0);
  const exportRows = rows.map((item) => ({
    meta: `${item.category} · ${paymentChannelText(item)} · ${cycleText(item)} · 下次 ${item.dateText}`,
    title: item.name,
    value: `${subscriptions.money(subscriptions.annualCents(item))}/年`,
  }));
  const csvRows = rows.map((item) => [
    item.name,
    item.category,
    cycleText(item),
    paymentChannelText(item),
    currencyText(item),
    sourceAmountNumber(item),
    exchangeRateNumber(item),
    amountNumber(item.amountCents),
    amountNumber(subscriptions.annualCents(item)),
    item.nextChargeDate,
    item.reminderStatusText,
  ]);
  return {
    csv: toCsv(["服务名称", "分类", "账单周期", "扣款渠道", "原始币种", "原始金额", "美元兑人民币汇率", "单次折合人民币（元）", "年度折算人民币（元）", "下次续费日", "提醒状态"], csvRows),
    fileName: `dingxu-annual-bill-${now.getFullYear()}.csv`,
    metricLabel: "年度订阅预估",
    metricValue: subscriptions.money(total),
    rows: exportRows,
    subtitle: `${now.getFullYear()}年度 · 按当前生效订阅折算`,
    title: "年度订阅账单",
  };
}

function buildReport(type, items, now = new Date()) {
  const decorated = items.length && items[0].amountText
    ? items
    : items.map((item) => subscriptions.decorate(item, now));
  if (type === "monthly") return monthlyReport(decorated, now);
  if (type === "annual") return annualReport(decorated, now);
  return allSubscriptionsReport(decorated, now);
}

module.exports = { buildReport };
