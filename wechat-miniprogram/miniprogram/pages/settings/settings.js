/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */
const service = require("../../services/subscriptions");
const utils = require("../../utils/subscriptions");

Page({
  data: {
    activeCount: 0,
    idHint: "识别中…",
    loading: true,
    monthlyText: "¥0",
    totalCount: 0,
  },

  onShow() {
    const app = getApp();
    app.ensureLogin().then((user) => this.setData({ idHint: user.idHint }));
    service.list().then((items) => {
      const active = items.filter((item) => item.status === "active");
      const monthlyCents = active.reduce((sum, item) => sum + utils.monthlyCents(item), 0);
      this.setData({ activeCount: active.length, loading: false, monthlyText: utils.money(monthlyCents), totalCount: items.length });
    }).catch((error) => {
      this.setData({ loading: false });
      wx.showModal({ title: "暂时无法读取", content: error.message, showCancel: false });
    });
  },

  clearAll() {
    if (!this.data.totalCount) return wx.showToast({ title: "当前没有订阅数据", icon: "none" });
    wx.showModal({
      title: "清空全部数据？",
      content: "这会永久删除当前微信账号下的所有订阅，且无法恢复。",
      confirmColor: "#b05243",
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.showLoading({ title: "正在清空", mask: true });
        service.clearAll().then(() => {
          this.setData({ activeCount: 0, monthlyText: "¥0", totalCount: 0 });
          wx.showToast({ title: "数据已清空" });
        }).catch((error) => wx.showModal({ title: "清空失败", content: error.message, showCancel: false }))
          .finally(() => wx.hideLoading());
      },
    });
  },
});
