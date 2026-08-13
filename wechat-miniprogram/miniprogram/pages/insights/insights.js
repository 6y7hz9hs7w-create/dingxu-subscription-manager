/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const pageData = require("../../services/pageData");
const sharing = require("../../utils/sharing");
const utils = require("../../utils/subscriptions");

const COLORS = ["#28604F", "#F2C84B", "#EE8C74", "#72A9A0", "#9DC7E8", "#C6A6D8", "#D8D2C6"];

function nextOccurrence(item, today) {
  const occurrence = utils.occurrenceOnOrAfter(item, today);
  return occurrence ? occurrence.date : null;
}

function shortDate(date) {
  return date ? `${date.getMonth() + 1}月${date.getDate()}日` : "暂无";
}

function trendSelection(trend, index) {
  const selected = trend[index] || trend[0] || { amountText: "¥0", count: 0, entries: [], label: "本月" };
  return {
    selectedTrendAmountText: selected.amountText,
    selectedTrendCount: selected.count,
    selectedTrendEntries: selected.entries || [],
    selectedTrendIndex: selected.index || 0,
    selectedTrendLabel: selected.label,
  };
}

Page({
  data: {
    activeCount: 0,
    averagePerItemText: "¥0",
    categories: [],
    dailyAverageText: "¥0",
    loading: true,
    monthlyText: "¥0",
    nextRenewalCount: 0,
    nextRenewalDateText: "暂无",
    nextRenewalNames: "暂无待续费项目",
    nextRenewalText: "¥0",
    priceChangeCount: 0,
    priceChangeMonthlyText: "¥0/月",
    priceChanges: [],
    selectedTrendAmountText: "¥0",
    selectedTrendCount: 0,
    selectedTrendEntries: [],
    selectedTrendIndex: 0,
    selectedTrendLabel: "本月",
    sixMonthTotalText: "¥0",
    topCategoryAmountText: "¥0",
    topCategoryName: "暂无分类",
    topCategoryPercentageText: "0%",
    topSubscriptions: [],
    trend: [],
    trendHasData: false,
    yearlyText: "¥0",
  },

  onShow() {
    sharing.enable();
    pageData.selectTab(this, 3);
    this.loadInsights();
  },

  applyInsights(items) {
    const summary = utils.summarize(items);
    const activeMetrics = summary.active.map((item) => ({
      annualCents: utils.annualCents(item),
      item,
      monthlyCents: utils.monthlyCents(item),
    }));
    const totals = {};
    const servicesByCategory = {};
    activeMetrics.forEach(({ item, monthlyCents }) => {
      totals[item.category] = (totals[item.category] || 0) + monthlyCents;
      if (!servicesByCategory[item.category]) servicesByCategory[item.category] = [];
      if (!servicesByCategory[item.category].includes(item.name)) {
        servicesByCategory[item.category].push(item.name);
      }
    });
    const categories = Object.keys(totals)
      .sort((left, right) => totals[right] - totals[left])
      .map((name, index) => ({
        amountText: utils.money(totals[name]),
        color: COLORS[index % COLORS.length],
        name,
        percentage: summary.monthlyCents ? Math.round(totals[name] / summary.monthlyCents * 100) : 0,
        servicesText: servicesByCategory[name].join("、"),
      }));

    const topSubscriptions = activeMetrics
      .slice()
      .sort((left, right) => right.monthlyCents - left.monthlyCents)
      .map(({ annualCents, item, monthlyCents }) => ({
        _id: item._id,
        cycleText: item.billingCycle === "yearly" ? "年付，已平均到每月" : "按月续费",
        logoPath: item.logoPath,
        monthlyText: `${utils.money(monthlyCents)}/月`,
        name: item.name,
        percentage: summary.monthlyCents
          ? Math.max(2, Math.round(monthlyCents / summary.monthlyCents * 100))
          : 0,
        yearlyText: `${utils.money(annualCents)}/年`,
      }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = summary.active
      .map((item) => ({ date: nextOccurrence(item, today), item }))
      .filter((entry) => entry.date)
      .sort((left, right) => left.date - right.date);
    const nextDateTime = upcoming.length ? upcoming[0].date.getTime() : null;
    const nextRenewals = nextDateTime
      ? upcoming.filter((entry) => entry.date.getTime() === nextDateTime)
      : [];

    const trend = utils.renewalTrend(summary.active);
    const priceChange = utils.priceChangeSummary(summary.active);
    const selectedIndex = Math.max(0, trend.findIndex((item) => item.amountCents > 0));
    const selection = trendSelection(trend, selectedIndex);
    this._activeSubscriptions = summary.active;
    this.setData(Object.assign({
      activeCount: summary.activeCount,
      averagePerItemText: utils.money(summary.activeCount ? Math.round(summary.monthlyCents / summary.activeCount) : 0),
      categories,
      dailyAverageText: utils.money(Math.round(summary.yearlyCents / 365)),
      loading: false,
      monthlyText: utils.money(summary.monthlyCents),
      nextRenewalCount: nextRenewals.length,
      nextRenewalDateText: nextRenewals.length ? shortDate(nextRenewals[0].date) : "暂无",
      nextRenewalNames: nextRenewals.length
        ? nextRenewals.map((entry) => entry.item.name).join("、")
        : "暂无待续费项目",
      nextRenewalText: utils.money(nextRenewals.reduce((sum, entry) => sum + Number(entry.item.amountCents || 0), 0)),
      priceChangeCount: priceChange.changes.length,
      priceChangeMonthlyText: priceChange.monthlyDeltaText,
      priceChanges: priceChange.changes,
      sixMonthTotalText: utils.money(trend.reduce((sum, item) => sum + item.amountCents, 0)),
      topCategoryAmountText: categories.length ? categories[0].amountText : "¥0",
      topCategoryName: categories.length ? categories[0].name : "暂无分类",
      topCategoryPercentageText: categories.length ? `${categories[0].percentage}%` : "0%",
      topSubscriptions,
      trend,
      trendHasData: trend.some((item) => item.amountCents > 0),
      yearlyText: utils.money(summary.yearlyCents),
    }, selection));
  },

  loadInsights(options) {
    return pageData.load(this, {
      apply: (items) => this.applyInsights(items),
      errorTitle: "暂时无法分析",
      hasContent: Boolean(this.data.categories.length),
      request: options,
    });
  },

  selectTrendMonth(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData(trendSelection(this.data.trend, index));
  },

  addSubscription() { wx.switchTab({ url: "/pages/add/add" }); },

  onShareAppMessage() { return sharing.appMessage(); },

  onShareTimeline() { return sharing.timeline(); },
});
