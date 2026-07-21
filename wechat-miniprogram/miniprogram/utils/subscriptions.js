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

function monthlyCents(item) {
  return item.billingCycle === "yearly" ? Math.round(item.amountCents / 12) : item.amountCents;
}

function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function dateLabel(value) {
  const parts = value.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function decorate(item) {
  return Object.assign({}, item, {
    amountText: money(item.amountCents),
    cycleText: item.billingCycle === "yearly" ? "年" : "月",
    dateText: dateLabel(item.nextChargeDate),
    daysText: daysUntil(item.nextChargeDate) === 0 ? "今天" : `${daysUntil(item.nextChargeDate)}天后`,
  });
}

module.exports = { dateKey, dateLabel, daysUntil, decorate, money, monthlyCents, pad };
