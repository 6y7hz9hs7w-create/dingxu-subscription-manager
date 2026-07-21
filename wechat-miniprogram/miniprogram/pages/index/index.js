/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const service = require("../../services/subscriptions");
const utils = require("../../utils/subscriptions");

Page({
  data: {
    activeCount: 0,
    loading: true,
    monthlyText: "¥0",
    subscriptions: [],
    upcoming: [],
    upcomingText: "¥0",
    yearlyText: "¥0",
  },

  onShow() {
    this.loadSubscriptions();
  },

  onPullDownRefresh() {
    this.loadSubscriptions().finally(() => wx.stopPullDownRefresh());
  },

  loadSubscriptions() {
    this.setData({ loading: true });
    return service.list().then((items) => {
      const decorated = items.map(utils.decorate);
      const active = decorated.filter((item) => item.status === "active");
      const monthlyCents = active.reduce((sum, item) => sum + utils.monthlyCents(item), 0);
      const upcoming = active.filter((item) => {
        const days = utils.daysUntil(item.nextChargeDate);
        return days >= 0 && days <= 7;
      });
      this.setData({
        activeCount: active.length,
        loading: false,
        monthlyText: utils.money(monthlyCents),
        subscriptions: decorated,
        upcoming,
        upcomingText: utils.money(upcoming.reduce((sum, item) => sum + item.amountCents, 0)),
        yearlyText: utils.money(monthlyCents * 12),
      });
    }).catch((error) => {
      this.setData({ loading: false });
      wx.showModal({ title: "暂时无法读取", content: error.message || "请稍后再试", showCancel: false });
    });
  },

  addSubscription() {
    wx.navigateTo({ url: "/pages/add/add" });
  },

  manageSubscription(event) {
    const { id, operation } = event.currentTarget.dataset;
    const title = operation === "cancel" ? "确认到期取消？" : operation === "restore" ? "恢复这项订阅？" : "确认本期已续费？";
    const content = operation === "cancel" ? "订阅不会立刻删除，你可以随时恢复。" : operation === "restore" ? "恢复后将重新计入消费分析和续费提醒。" : "确认后，下次续费日将自动顺延一个账单周期。";
    wx.showModal({
      title,
      content,
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.showLoading({ title: "处理中", mask: true });
        service.updateStatus(id, operation).then(() => {
          wx.showToast({ title: operation === "cancel" ? "已记录取消" : operation === "restore" ? "订阅已恢复" : "续费日已顺延" });
          this.loadSubscriptions();
        }).catch((error) => wx.showModal({ title: "操作失败", content: error.message, showCancel: false }))
          .finally(() => wx.hideLoading());
      },
    });
  },
});
