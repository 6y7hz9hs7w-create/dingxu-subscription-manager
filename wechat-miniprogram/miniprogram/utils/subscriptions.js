/* eslint-disable @typescript-eslint/no-require-imports */
const serviceCatalog = require("./serviceCatalog");

const paymentChannels = {
  wechat: {
    guide: "微信 → 我 → 服务 → 钱包 → 支付设置 → 自动续费",
    label: "微信支付",
  },
  alipay: {
    guide: "支付宝 → 我的 → 设置 → 支付设置 → 免密支付/自动扣款",
    label: "支付宝",
  },
  apple: {
    guide: "iPhone 设置 → Apple 账户 → 订阅",
    label: "Apple 订阅",
  },
  other: {
    guide: "前往对应服务的会员、账户或订阅设置中关闭自动续费",
    label: "其他渠道",
  },
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function money(cents) {
  const amount = Number(cents || 0) / 100;
  return `¥${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function sourceAmountText(item) {
  if (!item || item.currency !== "USD") return "";
  const amount = Number(item.sourceAmountCents || 0) / 100;
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function paymentChannelInfo(value) {
  return paymentChannels[value] || paymentChannels.other;
}

function subscriptionOperationCopy(operation, item) {
  const payment = paymentChannelInfo(item && item.paymentChannel);
  return {
    cancel: {
      confirmColor: "#B44335",
      confirmText: "已关闭",
      content: `关闭路径参考：${payment.guide}\n\n请确认已在服务商处关闭自动续费，再在订序中记录取消。记录会保留 7 天，随后自动归档。`,
      success: "已确认关闭并记录",
      title: `先关闭${payment.label}的自动续费`,
    },
    pause: {
      confirmColor: "#806320",
      confirmText: "暂停订阅",
      content: "暂停后不再计入支出、续费日历和提醒，也不会自动归档。",
      success: "订阅已暂停",
      title: "暂停这项订阅？",
    },
    renew: {
      confirmText: "确认续费",
      content: "确认后续费日会顺延一个账单周期；金额有变化时请先编辑订阅。",
      success: "续费日已顺延",
      title: "确认本期已续费？",
    },
    restore: {
      confirmColor: "#276553",
      confirmText: "恢复订阅",
      content: "恢复后会重新计入支出、续费日历和提醒。",
      success: "订阅已恢复",
      title: "恢复这项订阅？",
    },
  }[operation] || null;
}

function monthlyCents(item) {
  return item.billingCycle === "yearly" ? Math.round(item.amountCents / 12) : item.amountCents;
}

function annualCents(item) {
  return item.billingCycle === "yearly" ? Number(item.amountCents || 0) : Number(item.amountCents || 0) * 12;
}

function priceChangeSummary(items) {
  const changes = items.filter((item) => {
    const previous = Number(item.previousAmountCents || 0);
    return item.status === "active" && previous > 0 && previous !== Number(item.amountCents || 0);
  }).map((item) => {
    const previousMonthlyCents = monthlyCents(Object.assign({}, item, { amountCents: item.previousAmountCents }));
    const currentMonthlyCents = monthlyCents(item);
    const deltaCents = currentMonthlyCents - previousMonthlyCents;
    return {
      _id: item._id,
      currentText: `${money(currentMonthlyCents)}/月`,
      dateText: item.priceChangedAt ? dateLabel(item.priceChangedAt) : "",
      deltaCents,
      deltaText: `${deltaCents > 0 ? "+" : "−"}${money(Math.abs(deltaCents))}/月`,
      direction: deltaCents > 0 ? "up" : "down",
      logoPath: item.logoPath,
      name: item.name,
      previousText: `${money(previousMonthlyCents)}/月`,
    };
  }).sort((left, right) => Math.abs(right.deltaCents) - Math.abs(left.deltaCents));
  const monthlyDeltaCents = changes.reduce((sum, item) => sum + item.deltaCents, 0);
  return {
    changes,
    monthlyDeltaCents,
    monthlyDeltaText: `${monthlyDeltaCents > 0 ? "+" : monthlyDeltaCents < 0 ? "−" : ""}${money(Math.abs(monthlyDeltaCents))}/月`,
  };
}

// 账单日锚点：31 号的月付订阅经过 2 月后必须回到 31 号，不能被短月永久截断。
// 所有推算都以首个续费日为基准做整周期偏移，而不是在上一次结果上反复 +1。
function billingDateAt(base, billingCycle, count, anchorDay) {
  const day = Number(anchorDay) || base.getDate();
  const next = new Date(base.getFullYear(), base.getMonth(), 1);
  if (billingCycle === "yearly") next.setFullYear(next.getFullYear() + count);
  else next.setMonth(next.getMonth() + count);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function addBillingPeriod(date, billingCycle, anchorDay) {
  return billingDateAt(date, billingCycle, 1, anchorDay);
}

// 从 base 起、落在 boundary 当天或之后的第一个续费日。用月份差直接跳过去，不逐月循环。
function occurrenceOnOrAfter(item, boundary) {
  const base = new Date(`${item.nextChargeDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const anchorDay = base.getDate();
  const periodMonths = item.billingCycle === "yearly" ? 12 : 1;
  const monthsApart = (boundary.getFullYear() - base.getFullYear()) * 12
    + boundary.getMonth() - base.getMonth();
  let count = Math.max(0, Math.floor(monthsApart / periodMonths));
  let date = billingDateAt(base, item.billingCycle, count, anchorDay);
  while (date < boundary) {
    count += 1;
    date = billingDateAt(base, item.billingCycle, count, anchorDay);
  }
  return { anchorDay, base, count, date };
}

function cancelledArchiveDate(item) {
  const value = String(item && item.archiveDate || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function renewalTrend(items, monthCount = 6, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth() + monthCount, 1);
  const buckets = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return {
      amountCents: 0,
      count: 0,
      entries: [],
      index,
      label: `${date.getMonth() + 1}月`,
      names: [],
      year: date.getFullYear(),
      month: date.getMonth(),
    };
  });

  items.filter((item) => item.status === "active").forEach((item) => {
    const occurrence = occurrenceOnOrAfter(item, today);
    if (!occurrence) return;
    let { count } = occurrence;
    let chargeDate = occurrence.date;
    while (chargeDate < end) {
      const index = (chargeDate.getFullYear() - now.getFullYear()) * 12 + chargeDate.getMonth() - now.getMonth();
      if (index >= 0 && index < buckets.length) {
        const occurrenceDate = dateKey(chargeDate);
        buckets[index].amountCents += Number(item.amountCents || 0);
        buckets[index].count += 1;
        buckets[index].entries.push({
          amountText: money(item.amountCents),
          dateText: dateLabel(occurrenceDate),
          key: `${item._id || item.name}-${occurrenceDate}`,
          name: item.name,
        });
        buckets[index].names.push(item.name);
      }
      count += 1;
      chargeDate = billingDateAt(occurrence.base, item.billingCycle, count, occurrence.anchorDay);
    }
  });

  const maxAmount = Math.max(...buckets.map((item) => item.amountCents), 0);
  return buckets.map((item) => Object.assign({}, item, {
    amountText: money(item.amountCents),
    height: item.amountCents && maxAmount ? Math.max(12, Math.round(item.amountCents / maxAmount * 100)) : 0,
  }));
}

function renewalsForMonth(items, year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return items.reduce((result, item) => {
    if (["paused", "archived", "pending_confirmation"].includes(item.status)) return result;
    let chargeDate = new Date(`${item.nextChargeDate}T00:00:00`);
    if (Number.isNaN(chargeDate.getTime())) return result;
    if (item.status === "active") {
      const occurrence = occurrenceOnOrAfter(item, start);
      if (!occurrence) return result;
      chargeDate = occurrence.date;
    }
    if (chargeDate < start || chargeDate >= end) return result;
    const occurrenceDate = dateKey(chargeDate);
    const occurrenceDays = daysUntil(occurrenceDate);
    result.push(Object.assign({}, item, {
      actualNextChargeDate: item.nextChargeDate,
      dateText: dateLabel(occurrenceDate),
      daysText: remainingDaysText(occurrenceDays),
      nextChargeDate: occurrenceDate,
      projectedRenewal: occurrenceDate !== item.nextChargeDate,
    }));
    return result;
  }, []).sort((left, right) => String(left.nextChargeDate).localeCompare(String(right.nextChargeDate)));
}

function daysUntil(value, sourceToday) {
  const hasSharedToday = sourceToday && typeof sourceToday.getTime === "function";
  const today = hasSharedToday ? sourceToday : new Date();
  if (!hasSharedToday) today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function dateLabel(value) {
  const parts = value.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function remainingDaysText(days) {
  if (days === 0) return "今天";
  return days < 0 ? `已逾期 ${-days} 天` : `${days}天后`;
}

function reminderState(item) {
  if (item.status !== "active") return "inactive";
  if (item.reminderFailureForDate && item.reminderFailureForDate === item.nextChargeDate) return "failed";
  if (item.reminderEnabled) return "enabled";
  if (item.lastReminderForDate && item.lastReminderForDate === item.nextChargeDate) return "sent";
  return "unauthorized";
}

function taskAvailable(item, today) {
  return !item.snoozedUntil || daysUntil(item.snoozedUntil, today) <= 0;
}

function decorate(item, today) {
  const remainingDays = daysUntil(item.nextChargeDate, today);
  const status = item.status === "active" && remainingDays < 0 ? "pending_confirmation" : item.status;
  const normalized = status === item.status ? item : Object.assign({}, item, { status });
  const state = reminderState(normalized);
  const archiveDate = status === "cancel_pending" ? cancelledArchiveDate(item) : "";
  const statusText = {
    enabled: "已开启提醒",
    unauthorized: "尚未授权",
    sent: "已发送、需要重新开启",
    failed: "提醒失败",
    inactive: "提醒已关闭",
  };
  const lastActionText = {
    cancel: "已确认关闭自动续费",
    pause: "已暂停订阅",
    renew: "已确认续费",
    restore: "已恢复订阅",
    snooze: "已延后处理",
  };
  const previousAmountCents = Number(item.previousAmountCents || 0);
  const hasPriceChange = previousAmountCents > 0 && previousAmountCents !== Number(item.amountCents || 0);
  return Object.assign({}, item, {
    amountText: money(item.amountCents),
    cycleText: item.billingCycle === "yearly" ? "年" : "月",
    dateText: dateLabel(item.nextChargeDate),
    archiveDate,
    archiveDateText: archiveDate ? dateLabel(archiveDate) : "",
    daysText: remainingDaysText(remainingDays),
    remainingDays,
    logoPath: item.iconFileId || serviceCatalog.logoForService(item.name),
    lastActionDateText: item.lastActionDate ? dateLabel(item.lastActionDate) : "",
    lastActionText: lastActionText[item.lastAction] || "",
    paymentChannelText: paymentChannelInfo(item.paymentChannel).label,
    priceChangeText: hasPriceChange ? `${money(previousAmountCents)} → ${money(item.amountCents)}` : "",
    priceChangedDateText: hasPriceChange && item.priceChangedAt ? dateLabel(item.priceChangedAt) : "",
    reminderState: state,
    reminderStatusText: statusText[state],
    snoozeDateText: item.snoozedUntil ? dateLabel(item.snoozedUntil) : "",
    sourceAmountText: sourceAmountText(item),
    serviceClosedDateText: item.serviceClosedAt ? dateLabel(item.serviceClosedAt) : "",
    status,
    taskAvailable: taskAvailable(item, today),
    statusLabel: status === "paused"
      ? "已暂停"
      : status === "cancel_pending"
      ? "计划取消"
      : status === "pending_confirmation"
      ? "待确认"
      : status === "archived"
      ? "历史记录"
      : "生效中",
  });
}

let summarySource = null;
let summaryCache = null;
let summaryDayKey = "";

function summarize(items, sourceToday) {
  const today = sourceToday && typeof sourceToday.getTime === "function"
    ? new Date(sourceToday.getTime())
    : new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  if (items === summarySource && summaryCache && todayKey === summaryDayKey) return summaryCache;
  const all = items.map((item) => decorate(item, today));
  const active = all.filter((item) => item.status === "active");
  const monthly = active.reduce((sum, item) => sum + monthlyCents(item), 0);
  summarySource = items;
  summaryDayKey = todayKey;
  summaryCache = {
    active,
    activeCount: active.length,
    all,
    archived: all.filter((item) => item.status === "archived"),
    monthlyCents: monthly,
    pending: all.filter((item) => item.status === "pending_confirmation"),
    pendingActionable: all.filter((item) => item.status === "pending_confirmation" && item.taskAvailable),
    yearlyCents: active.reduce((sum, item) => sum + annualCents(item), 0),
  };
  return summaryCache;
}

module.exports = {
  addBillingPeriod,
  annualCents,
  billingDateAt,
  cancelledArchiveDate,
  dateKey,
  daysUntil,
  decorate,
  money,
  occurrenceOnOrAfter,
  monthlyCents,
  pad,
  paymentChannelInfo,
  priceChangeSummary,
  reminderState,
  renewalsForMonth,
  renewalTrend,
  sourceAmountText,
  subscriptionOperationCopy,
  summarize,
  taskAvailable,
};
