/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const service = require("../../services/subscriptions");
const utils = require("../../utils/subscriptions");

const COLORS = ["#28604F", "#F2C84B", "#EE8C74", "#9DC7E8", "#C6A6D8", "#D8D2C6"];

Page({
  data: {
    activeCount: 0,
    categories: [],
    loading: true,
    monthlyText: "¥0",
    savingText: "¥0",
    yearlyText: "¥0",
  },

  onShow() {
    this.loadInsights();
  },

  loadInsights() {
    this.setData({ loading: true });
    service.list().then((items) => {
      const active = items.filter((item) => item.status === "active");
      const totals = {};
      active.forEach((item) => {
        totals[item.category] = (totals[item.category] || 0) + utils.monthlyCents(item);
      });
      const monthlyCents = Object.values(totals).reduce((sum, value) => sum + value, 0);
      const categories = Object.keys(totals).sort((left, right) => totals[right] - totals[left]).map((name, index) => ({
        name,
        amountText: utils.money(totals[name]),
        color: COLORS[index % COLORS.length],
        percentage: monthlyCents ? Math.round(totals[name] / monthlyCents * 100) : 0,
      }));
      const potentialSaving = active.filter((item) => ["影音娱乐", "效率工具"].includes(item.category))
        .reduce((sum, item) => sum + Math.round(utils.monthlyCents(item) * .2), 0);
      this.setData({
        activeCount: active.length,
        categories,
        loading: false,
        monthlyText: utils.money(monthlyCents),
        savingText: utils.money(potentialSaving),
        yearlyText: utils.money(monthlyCents * 12),
      });
    }).catch((error) => {
      this.setData({ loading: false });
      wx.showModal({ title: "暂时无法分析", content: error.message, showCancel: false });
    });
  },

  addSubscription() { wx.navigateTo({ url: "/pages/add/add" }); },
});
