/* global getApp, wx */
/* eslint-disable @typescript-eslint/no-require-imports */
const subscriptions = require("./subscriptions");
const EMPTY_ITEMS = [];

function currentDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

function applyItems(page, options, items) {
  const dayKey = currentDayKey();
  if (page._pageDataSource === items && page._pageDataDayKey === dayKey) return false;
  options.apply(items);
  page._pageDataSource = items;
  page._pageDataDayKey = dayKey;
  return true;
}

function requireAccount(page, options) {
  const app = getApp();
  return app.ensureLogin().then(() => true).catch((error) => {
    subscriptions.invalidate();
    if (options && typeof options.apply === "function") applyItems(page, options, EMPTY_ITEMS);
    if (page && page.setData) page.setData({ loading: false });
    wx.showToast({ title: error.message || "云端连接失败，请稍后重试", icon: "none" });
    return false;
  });
}

function selectTab(page, selected) {
  const tabBar = page.getTabBar && page.getTabBar();
  if (tabBar && tabBar.data.selected !== selected) tabBar.setData({ selected });
}

function load(page, options) {
  return requireAccount(page, options).then((allowed) => {
    if (!allowed) return [];
    const cached = subscriptions.peek();
    if (cached) applyItems(page, options, cached);
    else if (!options.hasContent) page.setData({ loading: true });

    return subscriptions.list(options.request).then((items) => {
      applyItems(page, options, items);
      return items;
    }).catch((error) => {
      page.setData({ loading: false });
      wx.showModal({
        title: options.errorTitle || "暂时无法读取",
        content: error.message || "请稍后再试",
        showCancel: false,
      });
      return [];
    });
  });
}

module.exports = { load, requireAccount, selectTab };
