/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const service = require("../../services/subscriptions");
const catalog = require("../../utils/serviceCatalog");
const utils = require("../../utils/subscriptions");

const categories = ["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"];

Page({
  data: {
    billingCycles: ["每月", "每年"],
    billingIndex: 0,
    categories,
    categoryIndex: 0,
    colors: ["#FFE46B", "#B8DBFF", "#FFB9AE", "#CDEB7B", "#D8D2C6", "#FFC1D3"],
    customService: false,
    nextChargeDate: "",
    reminderDays: [1, 3, 5, 7],
    reminderIndex: 1,
    selectedColor: "#FFE46B",
    serviceIndex: 0,
    serviceName: "",
    serviceOptions: catalog.optionsForCategory(categories[0]),
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

  changeCategory(event) {
    const categoryIndex = Number(event.detail.value);
    this.setData({
      categoryIndex,
      customService: false,
      serviceIndex: 0,
      serviceName: "",
      serviceOptions: catalog.optionsForCategory(this.data.categories[categoryIndex]),
    });
  },

  changeService(event) {
    const serviceIndex = Number(event.detail.value);
    const selectedService = this.data.serviceOptions[serviceIndex];
    const customService = selectedService === catalog.CUSTOM_SERVICE;
    this.setData({
      customService,
      serviceIndex,
      serviceName: customService || serviceIndex === 0 ? "" : selectedService,
    });
  },

  changeServiceName(event) {
    this.setData({ serviceName: event.detail.value });
  },

  changeBilling(event) { this.setData({ billingIndex: Number(event.detail.value) }); },
  changeReminder(event) { this.setData({ reminderIndex: Number(event.detail.value) }); },
  changeDate(event) { this.setData({ nextChargeDate: event.detail.value }); },

  submit(event) {
    if (this.data.submitting) return;
    const values = event.detail.value;
    const amount = Number(values.amount);
    const serviceName = String(this.data.serviceName || "").trim();
    if (!serviceName) return wx.showToast({ title: "请选择或填写服务名称", icon: "none" });
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: "请填写有效金额", icon: "none" });

    this.setData({ submitting: true });
    wx.showLoading({ title: "正在添加", mask: true });
    service.add({
      amountCents: Math.round(amount * 100),
      billingCycle: this.data.billingIndex === 1 ? "yearly" : "monthly",
      category: this.data.categories[this.data.categoryIndex],
      color: this.data.selectedColor,
      name: serviceName,
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
