/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, wx */
const service = require("../../services/subscriptions");
const utils = require("../../utils/subscriptions");

Page({
  data: {
    cells: [],
    loading: true,
    monthItems: [],
    monthTitle: "",
    subscriptions: [],
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    year: 0,
    month: 0,
  },

  onLoad() {
    const today = new Date();
    this.setData({ year: today.getFullYear(), month: today.getMonth() });
  },

  onShow() {
    this.loadSubscriptions();
  },

  loadSubscriptions() {
    this.setData({ loading: true });
    service.list().then((items) => {
      this.setData({ subscriptions: items.map(utils.decorate), loading: false });
      this.buildCalendar();
    }).catch((error) => {
      this.setData({ loading: false });
      wx.showModal({ title: "暂时无法读取", content: error.message, showCancel: false });
    });
  },

  previousMonth() { this.moveMonth(-1); },
  nextMonth() { this.moveMonth(1); },

  moveMonth(offset) {
    const date = new Date(this.data.year, this.data.month + offset, 1);
    this.setData({ year: date.getFullYear(), month: date.getMonth() });
    this.buildCalendar();
  },

  buildCalendar() {
    const { year, month, subscriptions } = this.data;
    const leading = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const todayKey = utils.dateKey(new Date());
    const cells = [];
    for (let index = 0; index < leading; index += 1) cells.push({ key: `blank-${index}`, blank: true });
    for (let day = 1; day <= total; day += 1) {
      const key = `${year}-${utils.pad(month + 1)}-${utils.pad(day)}`;
      const items = subscriptions.filter((item) => item.nextChargeDate === key);
      cells.push({ key, day, blank: false, hasRenewal: items.length > 0, dotColor: items[0] ? items[0].color : "", isToday: key === todayKey });
    }
    const monthItems = subscriptions.filter((item) => {
      const date = new Date(`${item.nextChargeDate}T00:00:00`);
      return date.getFullYear() === year && date.getMonth() === month;
    });
    this.setData({ cells, monthItems, monthTitle: `${year}年 ${month + 1}月` });
  },

  addSubscription() { wx.navigateTo({ url: "/pages/add/add" }); },
});
