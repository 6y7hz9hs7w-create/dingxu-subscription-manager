/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */
const pageData = require("../../services/pageData");
const service = require("../../services/subscriptions");
const sharing = require("../../utils/sharing");
const serviceActions = require("../../utils/serviceActions");
const utils = require("../../utils/subscriptions");

function calendarTextColor(color) {
  const hex = String(color || "").match(/^#([0-9a-f]{6})$/i);
  if (!hex) return "#000000";
  const rgb = [0, 2, 4].map((index) => parseInt(hex[1].slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

Page({
  data: {
    actionBusy: false,
    cells: [],
    loading: true,
    monthItems: [],
    monthTitle: "",
    selectedDateKey: "",
    selectedDateText: "",
    selectedItems: [],
    selectedActionConfirming: false,
    selectedActionGuide: null,
    selectedActionId: "",
    showDateDetails: false,
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    year: 0,
    month: 0,
  },

  onLoad() {
    const today = new Date();
    this.setData({ year: today.getFullYear(), month: today.getMonth() });
  },

  onShow() {
    sharing.enable();
    pageData.selectTab(this, 1);
    this.loadSubscriptions();
  },

  loadSubscriptions(options) {
    return pageData.load(this, {
      apply: (items) => this.applySubscriptions(items),
      hasContent: Boolean(this._subscriptions && this._subscriptions.length),
      request: options,
    });
  },

  applySubscriptions(items) {
    this.buildCalendar(utils.summarize(items).all);
  },

  previousMonth() { this.moveMonth(-1); },
  nextMonth() { this.moveMonth(1); },

  moveMonth(offset) {
    const date = new Date(this.data.year, this.data.month + offset, 1);
    this.closeDateDetails();
    this.buildCalendar(this._subscriptions || [], date.getFullYear(), date.getMonth());
  },

  buildCalendar(sourceSubscriptions, sourceYear, sourceMonth) {
    const subscriptions = sourceSubscriptions || this._subscriptions || [];
    const year = typeof sourceYear === "number" ? sourceYear : this.data.year;
    const month = typeof sourceMonth === "number" ? sourceMonth : this.data.month;
    if (subscriptions !== this._subscriptions) this._monthRenewalCache = new Map();
    if (!this._monthRenewalCache) this._monthRenewalCache = new Map();
    const leading = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const todayKey = utils.dateKey(new Date());
    const itemsByDate = {};
    const monthKey = `${year}-${month}`;
    let monthItems = this._monthRenewalCache.get(monthKey);
    if (!monthItems) {
      monthItems = utils.renewalsForMonth(subscriptions, year, month);
      this._monthRenewalCache.set(monthKey, monthItems);
    }
    monthItems.forEach((item) => {
      if (!itemsByDate[item.nextChargeDate]) itemsByDate[item.nextChargeDate] = [];
      itemsByDate[item.nextChargeDate].push(item);
    });
    const cells = [];
    const cellIndexByKey = {};
    for (let index = 0; index < leading; index += 1) cells.push({ key: `blank-${index}`, blank: true });
    for (let day = 1; day <= total; day += 1) {
      const key = `${year}-${utils.pad(month + 1)}-${utils.pad(day)}`;
      const items = itemsByDate[key] || [];
      const cellColor = items[0] ? items[0].color || "#FFD166" : "";
      cellIndexByKey[key] = cells.length;
      cells.push({
        key,
        day,
        ariaLabel: items.length ? `${month + 1}月${day}日，${items.length}项续费安排` : `${month + 1}月${day}日`,
        blank: false,
        cellColor,
        cellTextColor: cellColor ? calendarTextColor(cellColor) : "",
        hasRenewal: items.length > 0,
        isToday: key === todayKey,
        renewalCount: items.length,
        selected: key === this.data.selectedDateKey && this.data.showDateDetails,
      });
    }
    this._subscriptions = subscriptions;
    this._cellIndexByKey = cellIndexByKey;
    this.setData({
      cells,
      loading: false,
      month,
      monthItems,
      monthTitle: `${year}年 ${month + 1}月`,
      year,
    });
  },

  openDateDetails(event) {
    const dateKey = event.currentTarget.dataset.date;
    if (!dateKey) return;
    const selectedItems = this.data.monthItems
      .filter((item) => item.nextChargeDate === dateKey)
      .map((item) => Object.assign({}, item, {
        // 只判断有没有指引，完整步骤文案等用户展开时再拼。
        officialActionAvailable: ["active", "pending_confirmation"].includes(item.status)
          && Boolean(serviceActions.find(item.name)),
      }));
    if (!selectedItems.length) return;
    const parts = dateKey.split("-");
    const nextData = {
      selectedDateKey: dateKey,
      selectedDateText: `${Number(parts[1])}月${Number(parts[2])}日`,
      selectedItems,
      selectedActionConfirming: false,
      selectedActionGuide: null,
      selectedActionId: "",
      showDateDetails: true,
    };
    const previousIndex = this._cellIndexByKey && this._cellIndexByKey[this.data.selectedDateKey];
    const selectedIndex = this._cellIndexByKey && this._cellIndexByKey[dateKey];
    if (Number.isInteger(previousIndex) && previousIndex !== selectedIndex) {
      nextData[`cells[${previousIndex}].selected`] = false;
    }
    if (Number.isInteger(selectedIndex)) nextData[`cells[${selectedIndex}].selected`] = true;
    this.setData(nextData);
  },

  closeDateDetails() {
    if (!this.data.showDateDetails && !this.data.selectedDateKey) return;
    const nextData = {
      selectedDateKey: "",
      selectedDateText: "",
      selectedItems: [],
      selectedActionConfirming: false,
      selectedActionGuide: null,
      selectedActionId: "",
      showDateDetails: false,
    };
    const selectedIndex = this._cellIndexByKey && this._cellIndexByKey[this.data.selectedDateKey];
    if (Number.isInteger(selectedIndex)) nextData[`cells[${selectedIndex}].selected`] = false;
    this.setData(nextData);
  },

  noop() {},

  toggleCalendarServiceAction(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.data.selectedActionId) {
      this.setData({ selectedActionConfirming: false, selectedActionGuide: null, selectedActionId: "" });
      return;
    }
    const item = this.data.selectedItems.find((entry) => entry._id === id);
    const guide = serviceActions.guideFor(item);
    if (!guide) return;
    this.setData({ selectedActionConfirming: false, selectedActionGuide: guide, selectedActionId: id });
  },

  copyCalendarServiceAction() {
    const guide = this.data.selectedActionGuide;
    if (!guide) return;
    wx.setClipboardData({ data: guide.copyText, success: () => this.setData({ selectedActionConfirming: true }) });
  },

  openCalendarOfficialService() {
    const guide = this.data.selectedActionGuide;
    if (!guide) return;
    if (!guide.directSupported) {
      this.copyCalendarServiceAction();
      return;
    }
    wx.navigateToMiniProgram({
      appId: guide.miniProgram.appId,
      path: guide.miniProgram.path || "",
      success: () => this.setData({ selectedActionConfirming: true }),
      fail: () => wx.showToast({ title: "暂时无法打开，请按页面步骤操作", icon: "none" }),
    });
  },

  confirmCalendarServiceAction(event) {
    const result = event.currentTarget.dataset.result;
    const item = this.data.selectedItems.find((entry) => entry._id === this.data.selectedActionId);
    if (!item) return;
    if (result === "none") {
      this.setData({ selectedActionConfirming: false, selectedActionGuide: null, selectedActionId: "" });
      wx.showToast({ title: "订阅状态未改变", icon: "none" });
      return;
    }
    const operation = result === "renew" ? "renew" : "cancel";
    this.setData({ actionBusy: true, selectedActionConfirming: false, selectedActionGuide: null, selectedActionId: "" });
    wx.showLoading({ title: "正在同步", mask: true });
    service.updateStatus(item._id, operation, false, 0, { expectedNextChargeDate: item.actualNextChargeDate || item.nextChargeDate }).then(() => {
      this.closeDateDetails();
      wx.showToast({ title: operation === "renew" ? "续费日已顺延" : "已记录取消", icon: "none" });
      return this.loadSubscriptions();
    }).catch((error) => wx.showModal({ title: "同步失败", content: error.message || "请稍后再试", showCancel: false }))
      .finally(() => { this.setData({ actionBusy: false }); wx.hideLoading(); });
  },

  editCalendarSubscription(event) {
    const id = event.currentTarget.dataset.id;
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
    if (!item) return;
    getApp().globalData.pendingSubscriptionEdit = Object.assign({}, item);
    this.closeDateDetails();
    wx.switchTab({ url: "/pages/add/add" });
  },

  manageCalendarSubscription(event) {
    if (this.data.actionBusy) return;
    const { id, operation } = event.currentTarget.dataset;
    if (!id || !["cancel", "pause", "restore"].includes(operation)) return;
    const item = this.data.selectedItems.find((entry) => entry._id === id);
    if (!item) return;
    const copy = utils.subscriptionOperationCopy(operation, item);
    if (!copy) return;
    wx.showModal({
      title: copy.title,
      content: copy.content,
      confirmText: copy.confirmText,
      confirmColor: copy.confirmColor,
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ actionBusy: true });
        wx.showLoading({ title: "处理中", mask: true });
        service.updateStatus(id, operation).then(() => {
          this.closeDateDetails();
          wx.showToast({ title: copy.success, icon: "success" });
          return this.loadSubscriptions();
        }).catch((error) => {
          wx.showModal({ title: "操作失败", content: error.message || "请稍后再试", showCancel: false });
        }).finally(() => {
          this.setData({ actionBusy: false });
          wx.hideLoading();
        });
      },
    });
  },

  deleteCalendarSubscription(event) {
    if (this.data.actionBusy) return;
    const id = event.currentTarget.dataset.id;
    const item = this.data.selectedItems.find((entry) => entry._id === id);
    if (!item || !["cancel_pending", "paused", "archived"].includes(item.status)) return;
    wx.showModal({
      title: `永久删除 ${item.name}？`,
      content: "删除后无法恢复，这项订阅的记录和自定义图标也会一并清除。",
      confirmText: "永久删除",
      confirmColor: "#B44335",
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ actionBusy: true });
        wx.showLoading({ title: "正在删除", mask: true });
        service.remove(id).then(() => {
          this.closeDateDetails();
          wx.showToast({ title: "订阅已删除", icon: "success" });
          return this.loadSubscriptions();
        }).catch((error) => {
          wx.showModal({ title: "删除失败", content: error.message || "请稍后再试", showCancel: false });
        }).finally(() => {
          this.setData({ actionBusy: false });
          wx.hideLoading();
        });
      },
    });
  },

  addSubscription() { wx.switchTab({ url: "/pages/add/add" }); },

  onShareAppMessage() { return sharing.appMessage(); },

  onShareTimeline() { return sharing.timeline(); },
});
