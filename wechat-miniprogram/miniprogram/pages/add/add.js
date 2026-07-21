/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const service = require("../../services/subscriptions");
const utils = require("../../utils/subscriptions");

Page({
  data: {
    billingCycles: ["每月", "每年"],
    billingIndex: 0,
    categories: ["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"],
    categoryIndex: 0,
    colors: ["#FFE46B", "#B8DBFF", "#FFB9AE", "#CDEB7B", "#D8D2C6", "#FFC1D3"],
    nextChargeDate: "",
    reminderDays: [1, 3, 5, 7],
    reminderIndex: 1,
    selectedColor: "#FFE46B",
    submitting: false,
  },

  onLoad() {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    this.setData({ nextChargeDate: utils.dateKey(nextMonth) });
  },

  chooseColor(event) {
    this.setData({ selectedColor: event.currentTarget.dataset.color });
  },

  changeCategory(event) { this.setData({ categoryIndex: Number(event.detail.value) }); },
  changeBilling(event) { this.setData({ billingIndex: Number(event.detail.value) }); },
  changeReminder(event) { this.setData({ reminderIndex: Number(event.detail.value) }); },
  changeDate(event) { this.setData({ nextChargeDate: event.detail.value }); },

  submit(event) {
    if (this.data.submitting) return;
    const values = event.detail.value;
    const amount = Number(values.amount);
    if (!String(values.name || "").trim()) return wx.showToast({ title: "请填写服务名称", icon: "none" });
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: "请填写有效金额", icon: "none" });

    this.setData({ submitting: true });
    wx.showLoading({ title: "正在添加", mask: true });
    service.add({
      amountCents: Math.round(amount * 100),
      billingCycle: this.data.billingIndex === 1 ? "yearly" : "monthly",
      category: this.data.categories[this.data.categoryIndex],
      color: this.data.selectedColor,
      name: String(values.name).trim(),
      nextChargeDate: this.data.nextChargeDate,
      note: String(values.note || "").trim(),
      reminderDays: this.data.reminderDays[this.data.reminderIndex],
    }).then(() => {
      wx.showToast({ title: "订阅已添加" });
      setTimeout(() => wx.navigateBack(), 650);
    }).catch((error) => wx.showModal({ title: "添加失败", content: error.message, showCancel: false }))
      .finally(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
      });
  },
});
