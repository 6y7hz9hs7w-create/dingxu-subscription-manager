import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../wechat-miniprogram/", import.meta.url);

async function loadSubscriptionUtils() {
  const catalogSource = await readFile(new URL("miniprogram/utils/serviceCatalog.js", root), "utf8");
  const catalogSandbox = { module: { exports: {} } };
  vm.runInNewContext(catalogSource, catalogSandbox);
  const source = await readFile(new URL("miniprogram/utils/subscriptions.js", root), "utf8");
  const sandbox = {
    module: { exports: {} },
    require(value) {
      if (value === "./serviceCatalog") return catalogSandbox.module.exports;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

async function loadServiceActions() {
  const source = await readFile(new URL("miniprogram/utils/serviceActions.js", root), "utf8");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

test("official action guide covers the 20-service launch list without invented direct links", async () => {
  const actions = await loadServiceActions();
  assert.equal(actions.SERVICES.length, 20);
  [
    "腾讯视频", "爱奇艺", "优酷", "芒果TV", "哔哩哔哩大会员", "QQ音乐", "网易云音乐", "喜马拉雅",
    "微信读书无限卡", "百度网盘", "叮咚买菜绿卡", "夸克网盘", "WPS会员", "迅雷会员", "淘宝88VIP",
    "京东PLUS", "美团会员", "饿了么超级吃货卡", "剪映VIP", "盒马X会员",
  ].forEach((name) => assert.ok(actions.find(name), name));
  const wechat = actions.guideFor({ name: "腾讯视频VIP", paymentChannel: "wechat" });
  const apple = actions.guideFor({ name: "网易云音乐", paymentChannel: "apple" });
  assert.match(wechat.copyText, /微信.*支付设置.*自动续费/);
  assert.match(apple.copyText, /Apple[\s\S]*订阅/);
  assert.equal("miniProgram" in wechat, false);
  assert.equal(actions.guideFor({ name: "未收录服务", paymentChannel: "other" }), null);
});

test("the offer assistant is fully removed from the client, the cloud, and the templates", async () => {
  const settingsTemplate = await readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8");
  const calendarTemplate = await readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8");
  const settingsLogic = await readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8");
  const calendarLogic = await readFile(new URL("miniprogram/pages/calendar/calendar.js", root), "utf8");
  const subscriptionCloud = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  // 删功能要连带清掉调用点，否则页面会在 require 一个不存在的模块时白屏。
  for (const source of [settingsTemplate, calendarTemplate, settingsLogic, calendarLogic]) {
    assert.doesNotMatch(source, /offer|Offer|优惠/);
  }
  await assert.rejects(readFile(new URL("miniprogram/services/offers.js", root)));
  await assert.rejects(readFile(new URL("cloudfunctions/offerService/index.js", root)));
  assert.doesNotMatch(settingsTemplate, /帮助改进留存体验/);
  assert.doesNotMatch(subscriptionCloud, /recordRetention|case "updatePreferences"/);
});

test("renewal trend groups upcoming charges into six calendar months", async () => {
  const subscriptionUtils = await loadSubscriptionUtils();
  const trend = subscriptionUtils.renewalTrend([
    { name: "月付会员", amountCents: 1000, billingCycle: "monthly", nextChargeDate: "2026-07-25", status: "active" },
    { name: "年付会员", amountCents: 12000, billingCycle: "yearly", nextChargeDate: "2026-08-02", status: "active" },
    { name: "已取消", amountCents: 9999, billingCycle: "monthly", nextChargeDate: "2026-07-26", status: "cancel_pending" },
  ], 6, new Date("2026-07-23T00:00:00"));

  assert.equal(trend.length, 6);
  assert.equal(trend[0].amountCents, 1000);
  assert.equal(trend[1].amountCents, 13000);
  assert.equal(trend[1].count, 2);
  assert.equal(trend[1].names.join(","), "月付会员,年付会员");

  const sharedItems = [
    { name: "缓存测试", amountCents: 1000, billingCycle: "monthly", nextChargeDate: "2026-07-25", status: "active" },
  ];
  assert.equal(subscriptionUtils.summarize(sharedItems), subscriptionUtils.summarize(sharedItems));
  const dayOneSummary = subscriptionUtils.summarize(sharedItems, new Date("2026-07-23T00:00:00"));
  const dayTwoSummary = subscriptionUtils.summarize(sharedItems, new Date("2026-07-24T00:00:00"));
  assert.notEqual(dayOneSummary, dayTwoSummary);
  assert.equal(dayOneSummary.all[0].daysText, "2天后");
  assert.equal(dayTwoSummary.all[0].daysText, "1天后");
  const overdueSummary = subscriptionUtils.summarize([
    { amountCents: 1000, billingCycle: "monthly", name: "待确认会员", nextChargeDate: "2026-07-22", status: "active" },
  ], new Date("2026-07-23T00:00:00"));
  assert.equal(overdueSummary.pending.length, 1);
  assert.equal(overdueSummary.all[0].statusLabel, "待确认");
  const snoozedSummary = subscriptionUtils.summarize([
    {
      amountCents: 1000,
      billingCycle: "monthly",
      name: "已延后会员",
      nextChargeDate: "2026-07-22",
      snoozedUntil: "2026-07-26",
      status: "pending_confirmation",
    },
  ], new Date("2026-07-23T00:00:00"));
  assert.equal(snoozedSummary.pending.length, 1);
  assert.equal(snoozedSummary.pendingActionable.length, 0);
  assert.equal(snoozedSummary.all[0].taskAvailable, false);
  assert.equal(
    subscriptionUtils.dateKey(subscriptionUtils.addBillingPeriod(new Date("2026-01-31T12:00:00"), "monthly")),
    "2026-02-28",
  );
  assert.equal(
    subscriptionUtils.dateKey(subscriptionUtils.addBillingPeriod(new Date("2024-02-29T12:00:00"), "yearly")),
    "2025-02-28",
  );
  assert.equal(subscriptionUtils.cancelledArchiveDate({
    archiveDate: "2026-02-07",
  }), "2026-02-07");
  assert.equal(subscriptionUtils.cancelledArchiveDate({
    archiveDate: "",
  }), "");
  assert.equal(subscriptionUtils.paymentChannelInfo("wechat").label, "微信支付");
  assert.match(subscriptionUtils.paymentChannelInfo("alipay").guide, /自动扣款/);
  assert.equal(subscriptionUtils.paymentChannelInfo("unknown").label, "其他渠道");
  assert.match(subscriptionUtils.subscriptionOperationCopy("cancel", { paymentChannel: "wechat" }).content, /微信.*自动续费/);
  assert.equal(subscriptionUtils.subscriptionOperationCopy("pause").confirmText, "暂停订阅");
  assert.equal(subscriptionUtils.subscriptionOperationCopy("unknown"), null);
  const priceChange = subscriptionUtils.priceChangeSummary([
    { _id: "monthly-up", amountCents: 1500, previousAmountCents: 1000, billingCycle: "monthly", name: "月付涨价", status: "active" },
    { _id: "yearly-down", amountCents: 9600, previousAmountCents: 12000, billingCycle: "yearly", name: "年付降价", status: "active" },
    { _id: "paused", amountCents: 2000, previousAmountCents: 1000, billingCycle: "monthly", name: "暂停不统计", status: "paused" },
  ]);
  assert.equal(priceChange.monthlyDeltaCents, 300);
  assert.equal(priceChange.monthlyDeltaText, "+¥3/月");
  assert.deepEqual(Array.from(priceChange.changes, (item) => [item._id, item.deltaText]), [
    ["monthly-up", "+¥5/月"],
    ["yearly-down", "−¥2/月"],
  ]);
  const customIconFileId = "cloud://test.env/subscription-icons/owner/custom.png";
  assert.equal(subscriptionUtils.decorate({
    amountCents: 1000,
    billingCycle: "monthly",
    iconFileId: customIconFileId,
    name: "网易云音乐",
    nextChargeDate: "2026-08-15",
    status: "active",
  }).logoPath, customIconFileId);
  const recurringItems = [
    { _id: "monthly", name: "月付会员", billingCycle: "monthly", nextChargeDate: "2026-08-15", status: "active" },
    { _id: "yearly", name: "年付会员", billingCycle: "yearly", nextChargeDate: "2026-08-20", status: "active" },
    { _id: "cancelled", name: "到期取消", billingCycle: "monthly", nextChargeDate: "2026-08-18", status: "cancel_pending" },
    { _id: "paused", name: "暂停保留", billingCycle: "monthly", nextChargeDate: "2026-10-18", status: "paused" },
  ];
  assert.deepEqual(
    Array.from(subscriptionUtils.renewalsForMonth(recurringItems, 2026, 9), (item) => [item._id, item.nextChargeDate]),
    [["monthly", "2026-10-15"]],
  );
  assert.deepEqual(
    Array.from(subscriptionUtils.renewalsForMonth(recurringItems, 2027, 7), (item) => [item._id, item.nextChargeDate]),
    [["monthly", "2027-08-15"], ["yearly", "2027-08-20"]],
  );
  // 投影到未来月份的续费仍要携带真实账单日，否则云端续费防重复守卫会把确认当成重复而静默跳过。
  const projectedMonthly = subscriptionUtils.renewalsForMonth(recurringItems, 2026, 9)[0];
  assert.equal(projectedMonthly.nextChargeDate, "2026-10-15");
  assert.equal(projectedMonthly.actualNextChargeDate, "2026-08-15");
  const calendarLogic = await readFile(new URL("miniprogram/pages/calendar/calendar.js", root), "utf8");
  const calendarTemplate = await readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8");
  const calendarSandbox = {
    Page() {},
    module: { exports: {} },
    require() { return {}; },
  };
  vm.runInNewContext(`${calendarLogic}\nglobalThis.__calendarColorTest = { calendarTextColor };`, calendarSandbox);
  assert.equal(calendarSandbox.__calendarColorTest.calendarTextColor("#FFE46B"), "#000000");
  assert.equal(calendarSandbox.__calendarColorTest.calendarTextColor("#3451C7"), "#FFFFFF");
  assert.match(calendarLogic, /utils\.renewalsForMonth\(subscriptions, year, month\)/);
  assert.doesNotMatch(calendarLogic, /nextChargeDate\.startsWith\(monthPrefix\)/);
  assert.match(calendarLogic, /openDateDetails\(event\)/);
  assert.match(calendarLogic, /service\.updateStatus\(id, operation\)/);
  assert.match(calendarLogic, /expectedNextChargeDate: item\.actualNextChargeDate \|\| item\.nextChargeDate/);
  assert.match(calendarTemplate, /bindtap="openDateDetails"/);
  assert.match(calendarTemplate, /bindtap="editCalendarSubscription"/);
  assert.match(calendarLogic, /pendingSubscriptionEdit/);
  assert.match(calendarTemplate, /到期取消/);
  assert.match(calendarTemplate, /暂停订阅/);
  assert.match(calendarTemplate, /date-detail-scroll-content/);
  assert.match(calendarTemplate, /scroll-y enhanced bounces/);
  assert.match(calendarTemplate, /background:' \+ item\.cellColor/);
  assert.match(calendarTemplate, /class="renewal-dot"/);
  assert.match(calendarLogic, /subscriptionOperationCopy/);
  assert.match(calendarTemplate, /扣款渠道/);
  assert.equal(subscriptionUtils.summarize([
    { amountCents: 10000, billingCycle: "yearly", nextChargeDate: "2026-08-01", status: "active" },
  ], new Date("2026-07-23T00:00:00")).yearlyCents, 10000);
});

test("reminder state distinguishes authorization, delivery, and failure", async () => {
  const { reminderState } = await loadSubscriptionUtils();
  const base = { nextChargeDate: "2026-08-01", status: "active" };

  assert.equal(reminderState({ ...base, reminderEnabled: true }), "enabled");
  assert.equal(reminderState({ ...base, reminderEnabled: false }), "unauthorized");
  assert.equal(reminderState({ ...base, lastReminderForDate: "2026-08-01" }), "sent");
  assert.equal(reminderState({ ...base, reminderEnabled: true, reminderFailureForDate: "2026-08-01" }), "failed");
  assert.equal(reminderState({ ...base, status: "cancel_pending" }), "inactive");
  assert.equal(reminderState({ ...base, status: "paused" }), "inactive");
});

test("retired web binding stays out of the mini program interface", async () => {
  const [serviceSource, settingsLogic, settingsTemplate] = await Promise.all([
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8"),
  ]);
  assert.doesNotMatch(serviceSource, /webInternal|confirmWebBinding|WEB_BINDING|WEB_SESSION/);
  assert.doesNotMatch(settingsLogic, /confirmWebBinding\(\)/);
  assert.doesNotMatch(settingsTemplate, /绑定网页版/);
  assert.doesNotMatch(settingsTemplate, /webBindingCode/);
  assert.doesNotMatch(settingsTemplate, /OPENID/);
});

test("archived subscriptions leave the overview and remain available from history", async () => {
  const utils = await loadSubscriptionUtils();
  const indexSource = await readFile(new URL("miniprogram/pages/index/index.js", root), "utf8");
  const settingsTemplate = await readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8");
  const settingsLogic = await readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8");
  let definition;
  let storedViewPreference;
  const sandbox = {
    Page(value) { definition = value; },
    getApp: () => ({ globalData: {} }),
    module: { exports: {} },
    require(value) {
      if (value === "../../utils/subscriptions") return utils;
      if (value === "../../services/subscriptions") return {};
      if (value === "../../services/reminders") return { preload() {} };
      if (value === "../../services/pageData") return {};
      if (value === "../../utils/sharing") return {};
      throw new Error(`Unexpected module: ${value}`);
    },
    // 搜索输入已做防抖；测试里同步执行定时回调，断言的仍是同一段过滤逻辑。
    setTimeout(callback) { callback(); return 0; },
    clearTimeout() {},
    wx: {
      getStorageSync() { return storedViewPreference; },
      setStorageSync(key, value) {
        assert.equal(key, "overviewViewPreferenceV1");
        storedViewPreference = value;
      },
    },
  };
  vm.runInNewContext(indexSource, sandbox);
  const page = Object.assign({}, definition, {
    data: { ...definition.data },
    setData(data, callback) {
      Object.assign(this.data, data);
      if (callback) callback();
    },
  });
  page.onLoad({});
  page.applySubscriptions([
    { _id: "alpha", amountCents: 1000, billingCycle: "monthly", category: "效率工具", name: "Alpha", nextChargeDate: "2026-09-10", note: "团队协作", status: "active" },
    { _id: "bravo", amountCents: 2000, billingCycle: "monthly", category: "影音娱乐", name: "Bravo", nextChargeDate: "2026-09-01", status: "active" },
    { _id: "charlie", amountCents: 3000, billingCycle: "monthly", category: "云存储", name: "Charlie", nextChargeDate: "2026-09-20", status: "paused" },
    { _id: "archived", amountCents: 2000, billingCycle: "monthly", name: "历史服务", nextChargeDate: "2026-07-01", status: "archived" },
  ]);

  // 完整列表只留在逻辑层，视图层拿到的是计数，避免 setData 重复搬运同一批数据。
  assert.deepEqual(Array.from(page._subscriptions, (item) => item._id), ["alpha", "bravo", "charlie"]);
  assert.equal(page.data.subscriptionCount, 3);
  assert.equal(page.data.subscriptions, undefined);
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["bravo", "alpha", "charlie"]);
  assert.deepEqual(Array.from(page.data.statusFilters, (item) => [item.value, item.count]), [
    ["all", 3],
    ["active", 2],
    ["pending_confirmation", 0],
    ["paused", 1],
    ["cancel_pending", 0],
  ]);
  page.changeSearch({ detail: { value: "效率" } });
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["alpha"]);
  page.changeSearch({ detail: { value: "不存在" } });
  assert.equal(page.data.visibleSubscriptions.length, 0);
  page.clearSearch();
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["bravo", "alpha", "charlie"]);
  page.changeSort({ detail: { value: "1" } });
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["charlie", "bravo", "alpha"]);
  page.changeSort({ detail: { value: "2" } });
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["alpha", "bravo", "charlie"]);
  page.changeStatusFilter({ currentTarget: { dataset: { status: "paused" } } });
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["charlie"]);
  page.changeStatusFilter({ currentTarget: { dataset: { status: "active" } } });
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["alpha", "bravo"]);
  page.toggleOverviewMetric({ currentTarget: { dataset: { metric: "monthly" } } });
  assert.equal(storedViewPreference.sortIndex, 2);
  assert.equal(storedViewPreference.statusFilter, "active");
  assert.equal(storedViewPreference.expandedOverviewMetric, "monthly");
  const restoredPage = Object.assign({}, definition, {
    data: { ...definition.data },
    setData(data) { Object.assign(this.data, data); },
  });
  restoredPage.onLoad({});
  assert.equal(restoredPage.data.sortIndex, 2);
  assert.equal(restoredPage.data.statusFilter, "active");
  assert.equal(restoredPage.data.expandedOverviewMetric, "monthly");
  page.resetListFilters();
  assert.equal(page.data.statusFilter, "all");
  assert.equal(page.data.sortIndex, 0);
  assert.deepEqual(Array.from(page.data.visibleSubscriptions, (item) => item._id), ["bravo", "alpha", "charlie"]);
  page.toggleSelectionMode();
  page.toggleSubscriptionSelection({ currentTarget: { dataset: { id: "alpha" } } });
  page.toggleSubscriptionSelection({ currentTarget: { dataset: { id: "charlie" } } });
  assert.equal(page.data.batchSelectedCount, 2);
  assert.equal(page.data.batchPausableCount, 1);
  assert.equal(page.data.batchRestorableCount, 1);
  page.selectVisibleSubscriptions();
  assert.equal(page.data.batchSelectedCount, 3);
  page.clearBatchSelection();
  assert.equal(page.data.batchSelectedCount, 0);
  page.toggleSelectionMode();
  assert.equal(page.data.selectionMode, false);
  assert.match(settingsTemplate, /class="history-entry/);
  assert.match(settingsTemplate, /data-stat="history"/);
  assert.match(settingsTemplate, /bindtap="manageHistorySubscription"/);
  assert.match(settingsLogic, /type === "history"/);
});

test("service center groups renewals and manages them without returning to the overview", async () => {
  const utils = await loadSubscriptionUtils();
  const settingsLogic = await readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8");
  const settingsTemplate = await readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8");
  const indexLogic = await readFile(new URL("miniprogram/pages/index/index.js", root), "utf8");
  const appLogic = await readFile(new URL("miniprogram/app.js", root), "utf8");
  let definition;
  const sandbox = {
    Page(value) { definition = value; },
    getApp: () => ({ globalData: {} }),
    module: { exports: {} },
    require(value) {
      if (value === "../../utils/subscriptions") return utils;
      if (value === "../../services/reminders") return {};
      if (value === "../../services/subscriptions") return {};
      if (value === "../../services/pageData") return {};
      if (value === "../../utils/serviceActions") return { find: () => null, guideFor: () => null };
      if (value === "../../utils/sharing") return {};
      throw new Error(`Unexpected module: ${value}`);
    },
    wx: {},
  };
  vm.runInNewContext(`${settingsLogic}\nglobalThis.__serviceCenterData = serviceCenterData; globalThis.__recentActionData = recentActionData; globalThis.__serviceTaskActions = serviceTaskActions;`, sandbox);
  const now = new Date("2026-08-03T00:00:00");
  const summary = utils.summarize([
    { _id: "urgent", amountCents: 1000, billingCycle: "monthly", name: "近期续费", nextChargeDate: "2026-08-06", paymentChannel: "wechat", status: "active" },
    { _id: "upcoming", amountCents: 2000, billingCycle: "monthly", name: "月内续费", nextChargeDate: "2026-08-23", paymentChannel: "alipay", status: "active" },
    { _id: "future", amountCents: 3000, billingCycle: "monthly", name: "远期续费", nextChargeDate: "2026-09-05", status: "active" },
    { _id: "pending", amountCents: 4000, billingCycle: "monthly", name: "待确认", nextChargeDate: "2026-08-02", status: "pending_confirmation" },
    { _id: "cancel", amountCents: 5000, archiveDate: "2026-08-10", billingCycle: "monthly", name: "计划取消", nextChargeDate: "2026-08-03", status: "cancel_pending" },
    { _id: "paused", amountCents: 6000, billingCycle: "monthly", name: "暂停服务", nextChargeDate: "2026-08-03", status: "paused" },
    { _id: "archived", amountCents: 7000, billingCycle: "monthly", name: "历史记录", nextChargeDate: "2026-08-03", status: "archived" },
  ], now);
  const result = sandbox.__serviceCenterData(summary.all, now);

  assert.deepEqual({ ...result.serviceCounts }, { followUp: 2, upcoming: 1, urgent: 2 });
  assert.equal(result.serviceFocusTitle, "先处理 1 项待确认");
  assert.match(result.serviceFocusCopy, /续费日已过/);
  assert.deepEqual(Array.from(result.serviceItems, (item) => item._id), ["pending", "urgent", "cancel", "paused", "upcoming"]);
  assert.deepEqual(Array.from(result.serviceItems, (item) => item.actionText), ["处理", "管理", "管理", "管理", "管理"]);
  assert.deepEqual(Array.from(result.serviceItems, (item) => item.deadlineText), [
    "已逾期 1 天", "3 天后续费", "7 天后归档", "暂停保留，不会自动归档", "20 天后续费",
  ]);
  assert.deepEqual(Array.from(sandbox.__serviceTaskActions(summary.all.find((item) => item._id === "pending")).operations), [
    "renew", "cancel", "snooze:1", "snooze:3", "snooze:7", "edit",
  ]);
  assert.deepEqual(Array.from(sandbox.__serviceTaskActions(summary.all.find((item) => item._id === "urgent")).operations), [
    "reminder", "edit", "pause", "cancel",
  ]);
  assert.deepEqual(Array.from(sandbox.__serviceTaskActions({ status: "active", reminderState: "enabled" }).operations), [
    "edit", "pause", "cancel",
  ]);
  assert.deepEqual(Array.from(sandbox.__serviceTaskActions(summary.all.find((item) => item._id === "cancel")).operations), ["restore", "delete"]);
  const reminderFocus = sandbox.__serviceCenterData(summary.all.filter((item) => item._id !== "pending"), now);
  assert.equal(reminderFocus.serviceReminderGapCount, 2);
  assert.equal(reminderFocus.serviceFocusTitle, "2 项续费提醒待开启");
  assert.equal(result.serviceTaskCount, 5);
  const recentActions = sandbox.__recentActionData(utils.summarize([
    { _id: "pause-action", amountCents: 1000, billingCycle: "monthly", lastAction: "pause", lastActionDate: "2026-08-03", name: "暂停服务", nextChargeDate: "2026-09-01", status: "paused" },
    { _id: "renew-action", amountCents: 2000, billingCycle: "monthly", lastAction: "renew", lastActionDate: "2026-08-02", name: "续费服务", nextChargeDate: "2026-09-02", status: "active" },
    { _id: "no-action", amountCents: 3000, billingCycle: "monthly", name: "未处理服务", nextChargeDate: "2026-09-03", status: "active" },
  ], now).all);
  assert.deepEqual(Array.from(recentActions, (item) => item._id), ["pause-action", "renew-action"]);
  assert.deepEqual(Array.from(recentActions, (item) => item.actionText), ["已暂停订阅", "已确认续费"]);
  assert.deepEqual(Array.from(recentActions, (item) => item.dateText), ["8月3日", "8月2日"]);
  assert.match(settingsTemplate, /续费处理中心/);
  assert.match(settingsTemplate, /最近操作/);
  assert.doesNotMatch(settingsTemplate, /service-center-toggle|bindtap="toggleServiceCenter"/);
  assert.match(settingsTemplate, /data-tone="urgent" bindtap="filterServiceCenter"/);
  assert.match(settingsTemplate, /data-tone="upcoming" bindtap="filterServiceCenter"/);
  assert.match(settingsTemplate, /data-tone="follow-up" bindtap="filterServiceCenter"/);
  assert.match(settingsTemplate, /bindtap="toggleRecentActions"/);
  assert.match(settingsTemplate, /bindtap="openServiceTask"/);
  assert.match(settingsTemplate, /service-task-deadline/);
  assert.match(settingsLogic, /showActionSheet/);
  assert.match(settingsLogic, /enableSubscriptionReminder\(item\._id\)/);
  assert.match(settingsLogic, /expectedNextChargeDate: item\.nextChargeDate/);
  assert.match(settingsLogic, /result && result\.subscription \? result\.subscription : item/);
  assert.match(settingsLogic, /processRenewalFlow\(event\)/);
  assert.match(settingsTemplate, /我已在服务商取消/);
  assert.match(settingsTemplate, /仅移动应用内任务/);
  assert.match(settingsLogic, /pendingSubscriptionEdit/);
  assert.match(indexLogic, /pendingSubscriptionFocusId/);
  assert.match(indexLogic, /loadSubscriptions\(\)\.then\(\(\) => this\.focusRequestedContent\(\)\)/);
  assert.match(appLogic, /pendingSubscriptionFocusId: ""/);
  assert.match(appLogic, /pendingRenewalFlow: null/);

  const page = Object.assign({}, definition, {
    data: { ...definition.data },
    setData(data) { Object.assign(this.data, data); },
  });
  page._serviceItems = result.serviceItems;
  assert.equal(page.data.serviceItems.length, 0);
  page.filterServiceCenter({ currentTarget: { dataset: { tone: "urgent" } } });
  assert.equal(page.data.serviceCenterExpanded, true);
  assert.equal(page.data.serviceFilter, "urgent");
  assert.deepEqual(Array.from(page.data.serviceItems, (item) => item._id), ["pending", "urgent"]);
  page.filterServiceCenter({ currentTarget: { dataset: { tone: "urgent" } } });
  assert.equal(page.data.serviceFilter, "");
  assert.equal(page.data.serviceItems.length, 5);
  page._recentActionItems = recentActions;
  assert.equal(page.data.recentActionItems.length, 0);
  page.toggleRecentActions();
  assert.equal(page.data.recentActionItems.length, 2);
  page.toggleRecentActions();
  assert.equal(page.data.recentActionItems.length, 0);
  assert.equal("reminderItems" in page.data, false);
  assert.match(settingsTemplate, /hidden="\{\{loading \|\| reminderTotal\}\}"/);
  assert.match(settingsTemplate, /bindtap="filterServiceCenter"/);
  assert.match(settingsTemplate, /serviceFilter === 'follow-up'/);
});

test("reminder request waits for one shared template config load", async () => {
  const source = await readFile(new URL("miniprogram/services/reminders.js", root), "utf8");
  let resolveConfig;
  let configCalls = 0;
  let subscribeCalls = 0;
  const configPromise = new Promise((resolve) => { resolveConfig = resolve; });
  const sandbox = {
    module: { exports: {} },
    require(value) {
      if (value === "./subscriptions") {
        return {
          reminderConfig() {
            configCalls += 1;
            return configPromise;
          },
        };
      }
      throw new Error(`Unexpected module: ${value}`);
    },
    wx: {
      requestSubscribeMessage({ success, tmplIds }) {
        subscribeCalls += 1;
        success({ [tmplIds[0]]: "accept" });
      },
    },
  };
  vm.runInNewContext(source, sandbox);

  const preloadResult = sandbox.module.exports.preload();
  const requestResult = sandbox.module.exports.request();
  resolveConfig("template-id");

  assert.equal(await preloadResult, "template-id");
  assert.deepEqual({ ...(await requestResult) }, { enabled: true, reason: "accept" });
  assert.equal(configCalls, 1);
  assert.equal(subscribeCalls, 1);
});

test("one authorization sends one subscription reminder only once", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sentMessages = [];
  const subscription = {
    _id: "single-reminder",
    amountCents: 1999,
    name: "测试会员",
    nextChargeDate: today,
    ownerOpenid: "openid-single-reminder",
    recordType: "subscription",
    reminderDays: 1,
    reminderEnabled: true,
    status: "active",
  };
  const collection = {
    doc(id) {
      assert.equal(id, subscription._id);
      return {
        update: async ({ data }) => Object.assign(subscription, data),
      };
    },
    where(criteria) {
      const query = {
        get: async () => {
          if (criteria.status === "cancel_pending") return { data: [] };
          if (criteria.status === "active" && criteria.reminderEnabled === true) {
            return { data: subscription.reminderEnabled ? [Object.assign({}, subscription)] : [] };
          }
          return { data: [] };
        },
        limit() { return this; },
        skip() { return this; },
      };
      return query;
    },
  };
  const database = { collection: () => collection };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({}),
    init() {},
    openapi: {
      subscribeMessage: {
        send: async (message) => { sentMessages.push(message); },
      },
    },
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const first = await sandbox.module.exports.main({ Type: "Timer" });
  const second = await sandbox.module.exports.main({ Type: "Timer" });
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(sentMessages.length, 1);
  assert.equal(subscription.reminderEnabled, false);
  assert.equal(subscription.lastReminderForDate, today);
});

test("same-day reminders for one user are merged into one message", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const records = ["视频会员", "音乐会员"].map((name, index) => ({
    _id: `group-${index}`,
    amountCents: 1000 + index,
    name,
    nextChargeDate: today,
    ownerOpenid: "same-owner",
    recordType: "subscription",
    reminderDays: 1,
    reminderEnabled: true,
    status: "active",
  }));
  const sentMessages = [];
  const collection = {
    doc(id) {
      return { update: async ({ data }) => Object.assign(records.find((item) => item._id === id), data) };
    },
    where(filter) {
      const data = filter.status === "active"
        ? (filter.reminderEnabled ? records.filter((item) => item.reminderEnabled) : records)
        : [];
      return {
        get: async () => ({ data: data.map((item) => ({ ...item })) }),
        limit() { return this; },
        skip() { return this; },
      };
    },
  };
  const database = { collection: () => collection };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({}),
    init() {},
    openapi: { subscribeMessage: { send: async (message) => sentMessages.push(message) } },
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({ Type: "Timer" });
  assert.equal(result.due, 2);
  assert.equal(result.groups, 1);
  assert.equal(result.sent, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].page, "pages/settings/settings?renewals=1");
  assert.match(sentMessages[0].data.thing2.value, /^2项订阅待处理/);
  assert.equal(records.every((item) => item.reminderEnabled === false), true);
});

test("cloud login ignores legacy monthly reminder fields", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const month = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const profile = {
    _id: "profile-1",
    avatarFileId: "",
    monthlyReminderEnabled: true,
    monthlyReminderMonth: month,
    nickname: "测试用户",
    ownerOpenid: "openid-test-user",
    recordType: "profile",
  };
  const query = {
    limit() { return this; },
    get() { return Promise.resolve({ data: [profile] }); },
  };
  const database = {
    collection() {
      return {
        where() { return query; },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: profile.ownerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({ action: "login" });
  assert.equal(result.ok, true);
  assert.equal(result.user.nickname, "测试用户");
  assert.equal(Object.hasOwn(result.user, "monthlyReminderState"), false);
});

test("a single subscription reminder can be enabled without profile authorization", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const ownerOpenid = "silent-identity-user";
  const updates = [];
  const subscription = {
    _id: "subscription-due",
    amountCents: 1000,
    billingCycle: "monthly",
    nextChargeDate: "2026-08-01",
    ownerOpenid,
    recordType: "subscription",
    status: "active",
  };
  const collection = {
    doc(id) {
      assert.equal(id, subscription._id);
      return {
        get: async () => ({ data: subscription }),
        update: async ({ data }) => { updates.push(data); },
      };
    },
    where(criteria) {
      return {
        get: async () => ({ data: criteria._id === subscription._id ? [subscription] : [] }),
        limit() { return this; },
        skip() { return this; },
      };
    },
  };
  const database = { collection: () => collection };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: ownerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({ action: "enableReminder", id: subscription._id });
  assert.equal(result.ok, true);
  assert.equal(result.subscription.reminderEnabled, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].reminderEnabled, true);
});

test("subscription editing updates the owned record without changing ownership or status", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  let callerOpenid = "owner-openid";
  const updates = [];
  const record = {
    _id: "subscription-1",
    amountCents: 12000,
    billingCycle: "monthly",
    nextChargeDate: "2026-08-24",
    ownerOpenid: "owner-openid",
    recordType: "subscription",
    reminderDays: 3,
    reminderEnabled: true,
    status: "active",
  };
  const database = {
    collection() {
      return {
        doc(id) {
          assert.equal(id, record._id);
          return {
            get: async () => ({ data: record }),
            update: async ({ data }) => { updates.push(data); },
          };
        },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: callerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);
  const input = {
    amountCents: 15000,
    billingCycle: "yearly",
    category: "效率工具",
    color: "#123456",
    name: "修改后的会员",
    nextChargeDate: "2026-09-01",
    note: "已核对",
    paymentChannel: "apple",
    reminderDays: 5,
    reminderEnabled: true,
  };

  const result = await sandbox.module.exports.main({ action: "update", id: record._id, input });
  assert.equal(result.ok, true);
  assert.equal(result.subscription._id, record._id);
  assert.equal(result.subscription.name, input.name);
  assert.equal(result.subscription.status, "active");
  assert.equal("ownerOpenid" in result.subscription, false);
  assert.equal("updatedAt" in result.subscription, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].name, input.name);
  assert.equal(updates[0].paymentChannel, "apple");
  assert.equal(updates[0].previousAmountCents, 12000);
  assert.match(updates[0].priceChangedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(updates[0].reminderEnabled, true);
  assert.equal(updates[0].lastReminderForDate, "");
  assert.equal("ownerOpenid" in updates[0], false);
  assert.equal("recordType" in updates[0], false);
  assert.equal("status" in updates[0], false);

  const decorated = (await loadSubscriptionUtils()).decorate(result.subscription, new Date("2026-08-03T00:00:00"));
  assert.equal(decorated.priceChangeText, "¥120 → ¥150");
  assert.match(decorated.priceChangedDateText, /月/);

  callerOpenid = "another-openid";
  const rejected = await sandbox.module.exports.main({ action: "update", id: record._id, input });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /订阅不存在/);
  assert.equal(updates.length, 1);

  callerOpenid = record.ownerOpenid;
  record.recordType = "profile";
  const wrongType = await sandbox.module.exports.main({ action: "update", id: record._id, input });
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.error, /订阅不存在/);
  assert.equal(updates.length, 1);
});

test("cancelling records provider confirmation and the latest service action", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const ownerOpenid = "service-version-owner";
  const record = {
    _id: "subscription-service-version",
    billingCycle: "monthly",
    nextChargeDate: "2026-09-01",
    ownerOpenid,
    paymentChannel: "alipay",
    recordType: "subscription",
    status: "active",
  };
  const database = {
    collection() {
      return {
        doc(id) {
          assert.equal(id, record._id);
          return {
            get: async () => ({ data: record }),
            update: async ({ data }) => Object.assign(record, data),
          };
        },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: ownerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({
    action: "updateStatus",
    id: record._id,
    operation: "cancel",
  });
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(result.ok, true);
  assert.equal(record.status, "cancel_pending");
  assert.equal(record.serviceClosedAt, today);
  assert.equal(record.lastAction, "cancel");
  assert.equal(record.lastActionDate, today);
  assert.equal(record.reminderEnabled, false);
});

test("renewal processing is idempotent when the client retries the same billing date", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const ownerOpenid = "renewal-idempotency-owner";
  const record = {
    _id: "renewal-idempotency",
    amountCents: 1999,
    billingCycle: "monthly",
    name: "测试会员",
    nextChargeDate: "2026-08-15",
    ownerOpenid,
    recordType: "subscription",
    reminderEnabled: false,
    status: "active",
  };
  let updates = 0;
  const database = {
    collection() {
      return {
        doc(id) {
          assert.equal(id, record._id);
          return {
            get: async () => ({ data: record }),
            update: async ({ data }) => {
              updates += 1;
              Object.assign(record, data);
            },
          };
        },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: ownerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const first = await sandbox.module.exports.main({
    action: "updateStatus",
    expectedNextChargeDate: "2026-08-15",
    id: record._id,
    operation: "renew",
  });
  const advancedDate = record.nextChargeDate;
  const retry = await sandbox.module.exports.main({
    action: "updateStatus",
    expectedNextChargeDate: "2026-08-15",
    id: record._id,
    operation: "renew",
  });

  assert.equal(first.ok, true);
  assert.notEqual(advancedDate, "2026-08-15");
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(record.nextChargeDate, advancedDate);
  assert.equal(updates, 1);
});

test("only the owner can permanently delete a cancelled or paused subscription", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  let callerOpenid = "owner-openid";
  let removed = 0;
  const deletedFiles = [];
  const ownerKey = crypto.createHash("sha256").update(callerOpenid).digest("hex").slice(0, 24);
  const record = {
    _id: "subscription-1",
    iconFileId: `cloud://test.env/subscription-icons/${ownerKey}/custom.png`,
    ownerOpenid: "owner-openid",
    recordType: "subscription",
    status: "cancel_pending",
  };
  const database = {
    collection() {
      return {
        doc(id) {
          assert.equal(id, record._id);
          return {
            get: async () => ({ data: record }),
            remove: async () => { removed += 1; },
          };
        },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    deleteFile: async ({ fileList }) => { deletedFiles.push(...fileList); },
    getWXContext: () => ({ OPENID: callerOpenid }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({ action: "delete", id: record._id });
  assert.equal(result.ok, true);
  assert.equal(removed, 1);
  assert.deepEqual(deletedFiles, [record.iconFileId]);

  record.status = "active";
  const activeResult = await sandbox.module.exports.main({ action: "delete", id: record._id });
  assert.equal(activeResult.ok, false);
  assert.match(activeResult.error, /请先取消、暂停或归档订阅/);
  assert.equal(removed, 1);

  record.status = "paused";
  const pausedResult = await sandbox.module.exports.main({ action: "delete", id: record._id });
  assert.equal(pausedResult.ok, true);
  assert.equal(removed, 2);

  record.status = "cancel_pending";
  callerOpenid = "another-openid";
  const rejected = await sandbox.module.exports.main({ action: "delete", id: record._id });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /订阅不存在/);
  assert.equal(removed, 2);
});

test("daily timer archives expired cancellations and marks overdue renewals for confirmation", async () => {
  const originalSource = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const source = originalSource.replace(
    /const RENEWAL_TEMPLATE_ID = "[^"]+";/,
    'const RENEWAL_TEMPLATE_ID = "";',
  );
  const records = [
    {
      _id: "monthly-cancelled",
      billingCycle: "monthly",
      archiveDate: "2020-02-07",
      iconFileId: "",
      nextChargeDate: "2020-01-31",
      ownerOpenid: "monthly-owner",
      recordType: "subscription",
      status: "cancel_pending",
    },
    {
      _id: "yearly-cancelled",
      billingCycle: "yearly",
      archiveDate: "2020-02-07",
      iconFileId: "",
      nextChargeDate: "2020-01-31",
      ownerOpenid: "yearly-owner",
      recordType: "subscription",
      status: "cancel_pending",
    },
  ];
  const overdue = {
    _id: "overdue-active",
    nextChargeDate: "2020-02-01",
    ownerOpenid: "active-owner",
    recordType: "subscription",
    status: "active",
  };
  const updates = new Map();
  const database = {
    collection() {
      return {
        doc(id) {
          return {
            update: async ({ data }) => { updates.set(id, data); },
          };
        },
        where(filter) {
          assert.equal(filter.recordType, "subscription");
          const data = filter.status === "cancel_pending"
            ? records
            : filter.status === "active" && filter.reminderEnabled === undefined
              ? [overdue]
              : [];
          return {
            get: async () => ({ data }),
            limit() { return this; },
            skip() { return this; },
          };
        },
      };
    },
  };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({}),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.module.exports.main({ Type: "Timer" });
  assert.equal(result.ok, true);
  assert.equal(result.lifecycle.archived, 2);
  assert.equal(result.lifecycle.pending, 1);
  assert.equal(updates.get("monthly-cancelled").status, "archived");
  assert.equal(updates.get("yearly-cancelled").status, "archived");
  assert.equal(updates.get("overdue-active").status, "pending_confirmation");
});

test("cloud timer, date, and avatar boundaries reject client-controlled values", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  const database = {
    collection() {
      return {
        where() {
          throw new Error("client timer must stop before database access");
        },
      };
    },
  };
  database.command = { in: (values) => values };
  database.serverDate = () => ({ serverDate: true });
  const cloud = {
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: "client-openid" }),
    init() {},
  };
  const sandbox = {
    console,
    module: { exports: {} },
    require(value) {
      if (value === "wx-server-sdk") return cloud;
      if (value === "crypto") return crypto;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(`${source}
module.exports.__test = {
  addDays,
  advanceDate,
  avatarPathPrefix,
  cancelledArchiveDate,
  convertToRmbCents,
  isOwnedAvatarFileId,
  isOwnedSubscriptionIconFileId,
  isValidDateKey,
  normalizeColor,
  subscriptionIconPathPrefix,
};`, sandbox);

  const timerResult = await sandbox.module.exports.main({ Type: "Timer" });
  assert.equal(timerResult.ok, false);
  assert.match(timerResult.error, /不能由客户端触发/);
  assert.equal(sandbox.module.exports.__test.advanceDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(sandbox.module.exports.__test.advanceDate("2024-02-29", "yearly"), "2025-02-28");
  assert.equal(sandbox.module.exports.__test.addDays("2026-08-01", 7), "2026-08-08");
  assert.equal(sandbox.module.exports.__test.cancelledArchiveDate({
    archiveDate: "2026-02-07",
  }), "2026-02-07");
  assert.equal(sandbox.module.exports.__test.isValidDateKey("2026-02-31"), false);
  assert.equal(sandbox.module.exports.__test.normalizeColor("#12abEF"), "#12ABEF");
  assert.equal(sandbox.module.exports.__test.normalizeColor("red"), "#FFE46B");
  assert.equal(sandbox.module.exports.__test.normalizeColor("#123456; background:red"), "#FFE46B");
  assert.equal(sandbox.module.exports.__test.convertToRmbCents(1999, 6.786115), 13565);
  assert.throws(() => sandbox.module.exports.__test.convertToRmbCents(1999, 0), /exchange rate/);
  const ownPrefix = sandbox.module.exports.__test.avatarPathPrefix("client-openid");
  assert.match(ownPrefix, /^avatars\/[a-f0-9]{24}$/);
  assert.equal(
    sandbox.module.exports.__test.isOwnedAvatarFileId(`cloud://test.env/${ownPrefix}/avatar.jpg`, "client-openid"),
    true,
  );
  assert.equal(
    sandbox.module.exports.__test.isOwnedAvatarFileId("cloud://test.env/avatars/another-user/avatar.jpg", "client-openid"),
    false,
  );
  const iconPrefix = sandbox.module.exports.__test.subscriptionIconPathPrefix("client-openid");
  assert.match(iconPrefix, /^subscription-icons\/[a-f0-9]{24}$/);
  assert.equal(
    sandbox.module.exports.__test.isOwnedSubscriptionIconFileId(`cloud://test.env/${iconPrefix}/custom.png`, "client-openid"),
    true,
  );
  assert.equal(
    sandbox.module.exports.__test.isOwnedSubscriptionIconFileId("cloud://test.env/subscription-icons/another-user/custom.png", "client-openid"),
    false,
  );
});

test("add subscription supports USD input and shows the RMB conversion quote", async () => {
  const [pageSource, template, styles, serviceSource, cloudSource] = await Promise.all([
    readFile(new URL("miniprogram/pages/add/add.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxss", root), "utf8"),
    readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
  ]);

  assert.match(pageSource, /人民币 CNY/);
  assert.match(pageSource, /美元 USD/);
  assert.match(template, /预计折合人民币/);
  assert.match(template, /ExchangeRate-API/);
  assert.match(styles, /\.currency-switch/);
  assert.match(styles, /\.exchange-rate-card/);
  assert.match(pageSource, /preloadExchangeRate\(\)/);
  assert.match(pageSource, /service\.peekExchangeRate\(\)/);
  assert.match(pageSource, /service\.exchangeRate\(\)/);
  assert.match(pageSource, /sourceAmountCents/);
  assert.match(serviceSource, /exchangeRate\(options\)/);
  assert.match(serviceSource, /exchangeRateRequest/);
  assert.match(serviceSource, /EXCHANGE_RATE_CACHE_TTL/);
  assert.match(cloudSource, /open\.er-api\.com\/v6\/latest\/USD/);
  assert.match(cloudSource, /usdCnyRateRequest/);
  assert.match(cloudSource, /amountCents = convertToRmbCents\(sourceAmountCents, exchangeRate\)/);
  assert.match(cloudSource, /const MAX_SUBSCRIPTIONS = 100/);
  assert.match(cloudSource, /\["cancel", "pause", "restore", "renew", "snooze"\]/);
  assert.match(cloudSource, /data\.archiveDate = addDays\(today, 7\)/);
});

test("USD exchange-rate requests are prefetched, cached, and coalesced", async () => {
  const source = await readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8");
  let requestCount = 0;
  const account = {
    ensureLogin: () => Promise.resolve({ profileComplete: true }),
  };
  const sandbox = {
    Date,
    Promise,
    getApp: () => account,
    module: { exports: {} },
    wx: {
      cloud: {
        callFunction({ data }) {
          assert.equal(data.action, "exchangeRate");
          requestCount += 1;
          return Promise.resolve({
            result: {
              ok: true,
              base: "USD",
              target: "CNY",
              rate: 6.7861,
              updatedAt: "2026-07-26T00:00:00.000Z",
            },
          });
        },
      },
    },
  };
  vm.runInNewContext(source, sandbox);
  const service = sandbox.module.exports;
  const [first, second] = await Promise.all([service.exchangeRate(), service.exchangeRate()]);
  assert.equal(requestCount, 1);
  assert.equal(first, second);
  assert.equal(await service.exchangeRate(), first);
  assert.equal(service.peekExchangeRate(), first);
  assert.equal(requestCount, 1);
  await service.exchangeRate({ force: true });
  assert.equal(requestCount, 2);
});

test("export reports create complete CSV data with clear accounting scopes", async () => {
  const subscriptionUtils = await loadSubscriptionUtils();
  const reportSource = await readFile(new URL("miniprogram/utils/reports.js", root), "utf8");
  const reportSandbox = {
    module: { exports: {} },
    require(value) {
      if (value === "./subscriptions") return subscriptionUtils;
      throw new Error(`Unexpected module: ${value}`);
    },
  };
  vm.runInNewContext(reportSource, reportSandbox);
  const { buildReport } = reportSandbox.module.exports;
  const items = [
    { name: "月付会员", category: "影音娱乐", amountCents: 1000, billingCycle: "monthly", nextChargeDate: "2026-07-25", paymentChannel: "wechat", reminderEnabled: true, status: "active" },
    { name: "年度会员", category: "效率工具", amountCents: 12000, billingCycle: "yearly", nextChargeDate: "2026-08-02", paymentChannel: "apple", status: "active" },
    { name: "准备取消", category: "其他", amountCents: 500, billingCycle: "monthly", nextChargeDate: "2026-07-29", paymentChannel: "alipay", serviceClosedAt: "2026-07-22", status: "cancel_pending" },
    { name: "=2+2", category: "其他", amountCents: 1, billingCycle: "yearly", nextChargeDate: "2026-09-01", status: "active" },
  ];
  const now = new Date("2026-07-23T00:00:00");
  const all = buildReport("all", items, now);
  const monthly = buildReport("monthly", items, now);
  const annual = buildReport("annual", items, now);

  assert.equal(all.rows.length, 4);
  assert.equal(monthly.rows.length, 1);
  assert.equal(monthly.metricValue, "¥10");
  assert.equal(annual.rows.length, 3);
  assert.equal(annual.metricValue, "¥240.01");
  assert.ok(all.csv.startsWith("\ufeff"));
  assert.match(all.csv, /服务名称/);
  assert.match(all.csv, /扣款渠道/);
  assert.match(all.csv, /关闭自动续费确认日/);
  assert.match(all.csv, /微信支付/);
  assert.match(all.csv, /2026-07-22/);
  assert.match(monthly.subtitle, /按计划续费统计/);
  assert.match(annual.subtitle, /按当前生效订阅折算/);
  assert.match(all.csv, /"'=2\+2"/);
});

test("known services use local brand logos and subscriptions can override them with a custom icon", async () => {
  const catalogSource = await readFile(new URL("miniprogram/utils/serviceCatalog.js", root), "utf8");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(catalogSource, sandbox);
  const { logoForService, optionsForCategory } = sandbox.module.exports;
  const [logo, indexTemplate, calendarTemplate, settingsTemplate, addTemplate, addLogic, serviceLogic, cloudLogic, appStyle, settingsStyle] = await Promise.all([
    readFile(new URL(`miniprogram${logoForService("网易云音乐")}`, root)),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.js", root), "utf8"),
    readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
    readFile(new URL("miniprogram/app.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxss", root), "utf8"),
  ]);

  assert.ok(logo.length > 0);
  assert.equal(logoForService("网易云音乐黑胶会员"), "/assets/services/neteasecloudmusic.png");
  assert.equal(logoForService("我的自定义服务"), "");
  ["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"].forEach((category) => {
    const knownServices = optionsForCategory(category).slice(1, -1);
    assert.ok(knownServices.every((serviceName) => logoForService(serviceName)), `${category} 存在缺少 Logo 的常用服务`);
  });
  assert.match(indexTemplate, /wx:if="\{\{item\.logoPath\}\}"/);
  assert.match(calendarTemplate, /wx:if="\{\{item\.logoPath\}\}"/);
  assert.match(settingsTemplate, /wx:if="\{\{item\.logoPath\}\}"/);
  assert.doesNotMatch(indexTemplate, /\{\{item\.mark\}\}/);
  assert.doesNotMatch(calendarTemplate, /\{\{item\.mark\}\}/);
  assert.doesNotMatch(settingsTemplate, /\{\{item\.mark\}\}/);
  assert.match(indexTemplate, /class="service-fallback-icon"/);
  assert.match(addTemplate, /bindtap="chooseSubscriptionIcon"/);
  assert.match(addTemplate, /扣款渠道/);
  assert.match(addTemplate, /changePaymentChannel/);
  assert.match(addTemplate, /bindtap="removeSubscriptionIcon"/);
  assert.match(addTemplate, /bindtap="selectMatchedIcon"/);
  assert.match(addTemplate, /iconCandidates/);
  assert.match(addLogic, /wx\.chooseImage/);
  assert.match(addLogic, /wx\.chooseMedia/);
  assert.match(addLogic, /wx\.getPrivacySetting/);
  assert.match(addLogic, /wx\.requirePrivacyAuthorize/);
  assert.match(addLogic, /handleSubscriptionIconPickerError/);
  assert.match(addLogic, /wx\.cropImage/);
  assert.match(addLogic, /iconFileId: fileId/);
  assert.match(addLogic, /scheduleIconSearch/);
  assert.match(addLogic, /正在重新匹配图标/);
  assert.match(addLogic, /String\(this\.data\.serviceName \|\| ""\)\.trim\(\)/);
  assert.match(addLogic, /service\.searchIcons/);
  assert.match(addTemplate, />重新匹配<\/button>/);
  assert.match(serviceLogic, /searchSubscriptionIcons/);
  assert.match(serviceLogic, /adoptSubscriptionIcon/);
  assert.match(serviceLogic, /subscriptionIconUploadConfig/);
  assert.match(cloudLogic, /itunes\.apple\.com\/search/);
  assert.match(cloudLogic, /trustedArtworkUrl/);
  assert.match(cloudLogic, /subscriptionIconPathPrefix/);
  assert.match(cloudLogic, /isOwnedSubscriptionIconFileId/);
  assert.match(cloudLogic, /paymentChannel: item\.paymentChannel/);
  assert.match(cloudLogic, /data\.serviceClosedAt = today/);
  assert.match(cloudLogic, /data\.lastActionDate = today/);
  assert.match(settingsTemplate, /class="export-icon skeuo-stack"/);
  assert.match(settingsTemplate, /class="export-icon skeuo-calendar"/);
  assert.match(settingsTemplate, /class="export-icon skeuo-ledger"/);
  assert.match(settingsTemplate, /class="privacy-icon skeuo-lock"/);
  assert.match(settingsTemplate, /class="privacy-icon skeuo-shield"/);
  assert.match(settingsTemplate, /bindtap="clearCache"/);
  assert.match(settingsTemplate, /清除临时列表和头像预览，不影响云端数据/);
  assert.match(settingsTemplate, /<button open-type="feedback">去反馈<\/button>/);
  assert.match(settingsTemplate, /<\/block>\s*<view class="feedback-card panel">/);
  assert.match(settingsTemplate, /bindtap="filterReminders"/);
  assert.match(settingsTemplate, /visibleReminderItems/);
  assert.doesNotMatch(settingsTemplate, /class="export-icon">\s*(全|月|年)/);
  assert.match(appStyle, /\.service-fallback-icon \{/);
  assert.match(settingsStyle, /\.skeuo-calendar-sheet \{/);
  assert.match(settingsStyle, /\.skeuo-ledger-book \{/);
  assert.match(settingsStyle, /\.settings-action-row \{/);
  assert.match(settingsStyle, /\.cache-action/);
  assert.match(settingsStyle, /\.feedback-card \{/);
  assert.match(settingsStyle, /\.feedback-bubble \{/);
});

test("custom color picker converts the full hue range to safe hex colors", async () => {
  const source = await readFile(new URL("miniprogram/pages/add/add.js", root), "utf8");
  const sandbox = {
    Page(config) { sandbox.page = config; },
    require(value) {
      if (value.endsWith("serviceCatalog")) {
        return {
          CUSTOM_SERVICE: "自定义服务",
          logoForService: () => "",
          optionsForCategory: () => ["请选择常用服务", "自定义服务"],
          servicesForCategory: () => [],
        };
      }
      return {};
    },
  };
  vm.runInNewContext(`${source}
globalThis.__colorTest = { colorPickerState, editFormState, hexToHsv, hsvToHex, isAutoMatchedIconFileId };`, sandbox);

  assert.equal(sandbox.__colorTest.hsvToHex(0, 1, 1), "#FF0000");
  assert.equal(sandbox.__colorTest.hsvToHex(120, 1, 1), "#00FF00");
  assert.equal(sandbox.__colorTest.hsvToHex(240, 1, 1), "#0000FF");
  assert.equal(sandbox.__colorTest.colorPickerState("#12abEF").selectedColor, "#12ABEF");
  assert.equal(
    sandbox.__colorTest.isAutoMatchedIconFileId("cloud://test.env/subscription-icons/owner/matched-123-456.jpg"),
    true,
  );
  assert.equal(
    sandbox.__colorTest.isAutoMatchedIconFileId("cloud://test.env/subscription-icons/owner/456-custom.jpg"),
    false,
  );
  const editState = sandbox.__colorTest.editFormState({
    _id: "subscription-1",
    amountCents: 13500,
    billingCycle: "monthly",
    category: "效率工具",
    color: "#123456",
    iconFileId: "cloud://test.env/subscription-icons/owner/custom.png",
    name: "自定义服务名称",
    nextChargeDate: "2026-08-24",
    note: "测试备注",
    reminderDays: 5,
    reminderEnabled: true,
  });
  assert.equal(editState.editingId, "subscription-1");
  assert.equal(editState.amount, "135");
  assert.equal(editState.customService, true);
  assert.equal(editState.customIconPreviewPath, "cloud://test.env/subscription-icons/owner/custom.png");
  assert.equal(editState.reminderIndex, 2);
  assert.equal(editState.paymentIndex, 3);
  assert.equal(editState.selectedColor, "#123456");
  assert.equal(sandbox.page.data.presetColors.length, 12);
  assert.equal(sandbox.page.data.selectedColor, "#FFE46B");
});

test("secondary copy remains readable on phone-sized screens", async () => {
  const [appStyle, indexLogic, indexTemplate, indexStyle, addStyle, calendarStyle, insightsStyle, settingsStyle] = await Promise.all([
    readFile(new URL("miniprogram/app.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxss", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxss", root), "utf8"),
  ]);

  assert.match(appStyle, /\.eyebrow \{[^}]*font-size: 20rpx/);
  assert.match(indexStyle, /\.reminder-status \{[^}]*font-size: 21rpx/);
  assert.match(indexStyle, /\.card-actions button \{[^}]*width: 100%[^}]*min-width: 0[^}]*margin: 0/);
  assert.match(indexStyle, /\.card-actions button\.edit-action \{[^}]*var\(--primary-soft\)[^}]*var\(--primary-strong\)/);
  assert.match(indexStyle, /button\.renew-action \{[^}]*#dfeee7/);
  assert.match(indexStyle, /\.subscription-card\.cancelled \{[^}]*opacity: 1/);
  assert.match(indexStyle, /\.subscription-card\.cancelled \{[^}]*background: #fff0ed/);
  assert.match(indexStyle, /\.subscription-card\.cancelled \.service-name,[\s\S]*color: #8f3329/);
  assert.doesNotMatch(indexStyle, /text-decoration-line: line-through/);
  assert.match(indexStyle, /\.subscription-card\.cancelled \.subscription-meta \{[^}]*#fbdcd6/);
  assert.match(indexStyle, /\.card-actions button\.delete-action \{[^}]*var\(--danger\)[^}]*color: #fff/);
  assert.match(indexTemplate, /bindtap="deleteSubscription"/);
  assert.match(indexTemplate, />删除订阅<\/button>/);
  assert.match(indexTemplate, /archiveDateText/);
  assert.match(indexTemplate, /7 天后自动归档/);
  assert.match(indexLogic, /service\.remove\(id\)/);
  assert.match(indexLogic, /删除后无法恢复/);
  assert.match(addStyle, /\.reminder-note \{[^}]*font-size: 21rpx/);
  assert.match(calendarStyle, /\.agenda-copy text:last-child \{[^}]*font-size: 21rpx/);
  assert.match(insightsStyle, /\.panel-description \{[^}]*font-size: 21rpx/);
  assert.match(insightsStyle, /\.analysis-note > view:last-child text:last-child \{[^}]*font-size: 20rpx/);
  assert.match(settingsStyle, /\.reminder-summary-item > text:last-child \{[^}]*font-size: 21rpx/);
  assert.match(settingsStyle, /\.reminder-summary-item\.selected/);
  assert.match(settingsStyle, /\.reminder-state \{[^}]*font-size: 18rpx/);
  assert.match(settingsStyle, /\.export-center-copy \{[^}]*font-size: 21rpx/);
});

test("overview sync badge distinguishes silent identity from optional profile completion", async () => {
  const [logic, template, style] = await Promise.all([
    readFile(new URL("miniprogram/pages/index/index.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxss", root), "utf8"),
  ]);

  assert.match(logic, /profileComplete: false/);
  assert.match(logic, /Boolean\(user && user\.profileComplete\)/);
  assert.match(logic, /profileComplete \? "微信云端已同步" : "微信身份已识别"/);
  assert.doesNotMatch(logic, /app\.isSignedOut\(\)/);
  assert.match(logic, /app\.refreshLogin\(\)/);
  assert.match(template, /\{\{accountStatusText\}\}/);
  assert.match(template, /bindtap="openAccount"/);
  assert.doesNotMatch(logic + template, /monthlyReminder|monthlyDue|本月汇总|汇总提醒/);
  assert.match(template, /未来 7 天待扣/);
  assert.doesNotMatch(template, /UP NEXT|即将发生|renew-panel/);
  assert.doesNotMatch(template, /bindtap="showUpcomingStats"/);
  assert.doesNotMatch(template, /查看明细/);
  assert.match(template, /bindtap="toggleOverviewMetric"/);
  assert.match(template, /overview-detail-list/);
  assert.match(logic, /function overviewMetricDetail/);
  const overviewMetricMethod = logic.match(/toggleOverviewMetric\(event\) \{([\s\S]*?)\n  \},\n\n  manageSubscription/);
  assert.ok(overviewMetricMethod);
  assert.doesNotMatch(overviewMetricMethod[1], /wx\.showModal/);
  assert.doesNotMatch(template, /<text>微信云端已同步<\/text>/);
  assert.match(style, /\.sync-chip\.signed-out/);
  assert.match(style, /\.sync-chip\.identified/);
  assert.match(style, /\.sync-chip\.synced/);
  assert.doesNotMatch(style, /\.monthly-reminder-nudge/);
});

test("page switching reuses fresh login and subscription data without duplicate renders", async () => {
  const appSource = await readFile(new URL("miniprogram/app.js", root), "utf8");
  let appDefinition;
  let loginCalls = 0;
  const appSandbox = {
    App(definition) { appDefinition = definition; },
    Error,
    Promise,
    Date,
    module: { exports: {} },
    require(value) {
      if (value === "./config") return { cloudEnvId: "test" };
      throw new Error(`Unexpected module: ${value}`);
    },
    wx: {
      cloud: {
        callFunction() {
          loginCalls += 1;
          return Promise.resolve({
            result: {
              ok: true,
              user: { nickname: "流畅度测试", profileComplete: true },
            },
          });
        },
      },
      removeStorageSync() {},
      setStorageSync() {},
    },
  };
  vm.runInNewContext(appSource, appSandbox);
  const app = Object.assign({}, appDefinition, {
    globalData: Object.assign({}, appDefinition.globalData),
  });

  const firstUser = await app.startLogin();
  assert.equal(loginCalls, 1);
  assert.equal(await app.refreshLogin(), firstUser);
  assert.equal(loginCalls, 1);
  const forced = app.refreshLogin({ force: true });
  const coalesced = app.refreshLogin({ force: true });
  await Promise.all([forced, coalesced]);
  assert.equal(loginCalls, 2);

  const pageDataSource = await readFile(new URL("miniprogram/services/pageData.js", root), "utf8");
  const sharedItems = [{ _id: "subscription-1" }];
  let applyCalls = 0;
  const page = {
    data: { loading: false, loginRequired: false },
    setData(data) { Object.assign(this.data, data); },
  };
  const pageDataSandbox = {
    Date,
    Promise,
    getApp() {
      return {
        ensureLogin: () => Promise.resolve(firstUser),
      };
    },
    module: { exports: {} },
    require(value) {
      if (value === "./subscriptions") {
        return {
          invalidate() {},
          list: () => Promise.resolve(sharedItems),
          peek: () => sharedItems,
        };
      }
      throw new Error(`Unexpected module: ${value}`);
    },
    setTimeout,
    wx: {
      showModal() {},
      showToast() {},
      switchTab() {},
    },
  };
  vm.runInNewContext(pageDataSource, pageDataSandbox);
  const options = {
    apply() { applyCalls += 1; },
    hasContent: true,
  };
  await pageDataSandbox.module.exports.load(page, options);
  await pageDataSandbox.module.exports.load(page, options);
  assert.equal(applyCalls, 1);
});

test("subscription mutations update the local list without a second full-list request", async () => {
  const serviceSource = await readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8");
  let listRequests = 0;
  const account = {
    ensureLogin: () => Promise.resolve({ profileComplete: true }),
  };
  const sandbox = {
    Date,
    Promise,
    getApp: () => account,
    module: { exports: {} },
    wx: {
      cloud: {
        callFunction({ data }) {
          if (data.action === "list") {
            listRequests += 1;
            return Promise.resolve({
              result: {
                ok: true,
                subscriptions: [{
                  _id: "subscription-1",
                  name: "测试订阅",
                  nextChargeDate: "2026-08-01",
                  status: "active",
                }],
              },
            });
          }
          if (data.action === "updateStatus") {
            return Promise.resolve({
              result: {
                ok: true,
                subscription: {
                  _id: "subscription-1",
                  name: "测试订阅",
                  nextChargeDate: "2026-08-01",
                  status: "paused",
                },
              },
            });
          }
          throw new Error(`Unexpected action: ${data.action}`);
        },
      },
    },
  };
  vm.runInNewContext(serviceSource, sandbox);
  const service = sandbox.module.exports;
  await service.list();
  await service.updateStatus("subscription-1", "pause");
  const cached = await service.list();
  assert.equal(listRequests, 1);
  assert.equal(cached[0].status, "paused");
});

test("forced list refresh cannot be overwritten by an older in-flight response", async () => {
  const serviceSource = await readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8");
  const pending = [];
  let listRequests = 0;
  const sandbox = {
    module: { exports: {} },
    getApp: () => ({ ensureLogin: () => Promise.resolve({}) }),
    wx: {
      cloud: {
        callFunction({ data }) {
          assert.equal(data.action, "list");
          listRequests += 1;
          return new Promise((resolve) => pending.push(resolve));
        },
      },
    },
  };
  vm.runInNewContext(serviceSource, sandbox);
  const service = sandbox.module.exports;
  const first = service.list();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const forced = service.list({ force: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const coalesced = service.list();
  assert.equal(listRequests, 2);
  pending[0]({ result: { ok: true, subscriptions: [{ _id: "old", status: "active" }] } });
  await first;
  assert.equal(listRequests, 2);
  pending[1]({ result: { ok: true, subscriptions: [{ _id: "new", status: "active" }] } });
  await Promise.all([forced, coalesced]);
  assert.equal(service.peek()[0]._id, "new");
});

test("post-mutation pages reuse the updated cache and stale exchange-rate requests are ignored", async () => {
  const [indexLogic, calendarLogic, settingsLogic, addLogic, cloudLogic] = await Promise.all([
    readFile(new URL("miniprogram/pages/index/index.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
  ]);

  const indexDelete = indexLogic.match(/deleteSubscription\(event\) \{([\s\S]*?)\n  \},\n\n  authorizeReminder/);
  const calendarManage = calendarLogic.match(/manageCalendarSubscription\(event\) \{([\s\S]*?)\n  \},\n\n  deleteCalendarSubscription/);
  const calendarDelete = calendarLogic.match(/deleteCalendarSubscription\(event\) \{([\s\S]*?)\n  \},\n\n  addSubscription/);
  const settingsReminder = settingsLogic.match(/authorizeReminder\(event\) \{([\s\S]*?)\n  \},\n\n  exportReport/);
  assert.ok(indexDelete);
  assert.ok(calendarManage);
  assert.ok(calendarDelete);
  assert.ok(settingsReminder);
  [indexDelete[1], calendarManage[1], calendarDelete[1], settingsReminder[1]].forEach((source) => {
    assert.doesNotMatch(source, /force: true/);
  });
  assert.match(addLogic, /sequence !== this\._exchangeRateSequence \|\| this\.data\.currencyIndex !== 1/);
  assert.match(cloudLogic, /mapWithConcurrency\(subscriptionRecords, 8,/);
});

test("silent WeChat identity can use core features without profile authorization", async () => {
  const [
    appLogic,
    serviceLogic,
    pageDataLogic,
    addLogic,
    tabBarLogic,
    settingsLogic,
    settingsTemplate,
    indexTemplate,
    calendarTemplate,
    insightsTemplate,
  ] = await Promise.all([
    readFile(new URL("miniprogram/app.js", root), "utf8"),
    readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8"),
    readFile(new URL("miniprogram/services/pageData.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.js", root), "utf8"),
    readFile(new URL("miniprogram/custom-tab-bar/index.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxml", root), "utf8"),
  ]);

  assert.doesNotMatch(appLogic, /ensureAuthorizedAccount|isAccountAuthorized|signIn\(\)/);
  assert.doesNotMatch(appLogic, /isSignedOut|requiresAccountLogin/);
  assert.doesNotMatch(appLogic, /SIGNED_OUT_KEY|dingxu_signed_out/);
  assert.doesNotMatch(appLogic, /ACCOUNT_LOGIN_REQUIRED|accountLoginError/);
  assert.match(serviceLogic, /getApp\(\)\.ensureLogin\(\)/);
  assert.doesNotMatch(serviceLogic, /isSignedOut\(\)\) return Promise\.resolve\(\[\]\)/);
  assert.match(serviceLogic, /peek\(\) \{ return listCache; \}/);
  assert.match(pageDataLogic, /applyItems\(page, options, EMPTY_ITEMS\)/);
  assert.match(pageDataLogic, /app\.ensureLogin\(\)/);
  assert.doesNotMatch(pageDataLogic, /switchTab|登录微信账号|loginRequired: true/);
  assert.match(addLogic, /pageData\.requireAccount\(this, \{ redirectOnRequired: true \}\)/);
  assert.doesNotMatch(tabBarLogic, /requiresAccountLogin|请先登录微信账号/);
  assert.match(settingsLogic, /applyAccountSession\(user/);
  assert.doesNotMatch(settingsLogic, /isSignedOut|signOut\(\)|signedOutData/);
  assert.doesNotMatch(settingsLogic, /if \(!user \|\| !user\.profileComplete\)/);
  assert.match(settingsLogic, /clearCache\(\)/);
  assert.match(settingsLogic, /service\.list\(\{ force: true \}\)/);
  assert.match(settingsTemplate, /<block wx:if="\{\{identityReady\}\}">\s*<view class="account-stats">/);
  assert.match(settingsTemplate, /完善个人资料（可选）/);
  assert.match(settingsTemplate, /不授权昵称和头像，也可以正常使用订阅管理功能/);
  assert.doesNotMatch(settingsTemplate, /disabled="\{\{!profileComplete \|\| !monthlyDueCount/);
  [indexTemplate, calendarTemplate, insightsTemplate].forEach((template) => {
    assert.doesNotMatch(template, /account-login-gate|登录后查看|前往微信登录|wx:if="\{\{loginRequired\}\}"/);
  });
  assert.doesNotMatch(settingsTemplate, /退出账号|bindtap="signOut"/);
});

test("insight data is explained inline without ambiguous saving estimates", async () => {
  const [logic, template, style] = await Promise.all([
    readFile(new URL("miniprogram/pages/insights/insights.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxss", root), "utf8"),
  ]);

  assert.match(template, /每月固定支出/);
  assert.match(template, /月付金额与年付金额 ÷ 12 后相加/);
  assert.match(template, /一年预计花费/);
  assert.match(template, /最近一次续费/);
  assert.match(template, /每月的钱花在哪/);
  assert.match(template, /每项订阅占多少/);
  assert.match(template, /长条越长表示占每月支出越高/);
  assert.match(template, /\{\{item\.percentage\}\}%/);
  assert.match(template, /item\.percentage >= 12/);
  assert.match(template, /bindtap="selectTrendMonth"/);
  assert.match(template, /selectedTrendEntries/);
  assert.doesNotMatch(template, /bindtap="showMetricDetails"/);
  assert.doesNotMatch(template, /查看估算依据/);
  assert.doesNotMatch(template, /可优化空间/);
  assert.doesNotMatch(logic, /OPTIMIZATION_RATE|showMetricDetails|wx\.showModal/);
  assert.match(logic, /function trendSelection/);
  assert.match(style, /\.trend-detail/);
  assert.match(style, /\.category-stack/);
  assert.match(style, /\.cost-track/);
});

test("WeChat mini program uses server-owned identity with user-approved profile", async () => {
  const [projectText, appText, appConfigText, appStyleText, cloudConfigText, serviceText, reminderText, reportExportText, cloudText, functionConfigText, packageText, indexText, addText, addLogicText, addStyleText, catalogText, calendarText, insightsText, settingsText, settingsLogicText, tabBarText, tabBarStyleText, tabBarLogicText] = await Promise.all([
    readFile(new URL("project.config.json", root), "utf8"),
    readFile(new URL("miniprogram/app.js", root), "utf8"),
    readFile(new URL("miniprogram/app.json", root), "utf8"),
    readFile(new URL("miniprogram/app.wxss", root), "utf8"),
    readFile(new URL("miniprogram/config.js", root), "utf8"),
    readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8"),
    readFile(new URL("miniprogram/services/reminders.js", root), "utf8"),
    readFile(new URL("miniprogram/services/reportExport.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/config.json", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/package.json", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/add/add.wxss", root), "utf8"),
    readFile(new URL("miniprogram/utils/serviceCatalog.js", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.js", root), "utf8"),
    readFile(new URL("miniprogram/custom-tab-bar/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/custom-tab-bar/index.wxss", root), "utf8"),
    readFile(new URL("miniprogram/custom-tab-bar/index.js", root), "utf8"),
  ]);

  const project = JSON.parse(projectText);
  const appConfig = JSON.parse(appConfigText);
  const functionConfig = JSON.parse(functionConfigText);
  const cloudPackage = JSON.parse(packageText);
  assert.equal(project.appid, "wxa5a0b5d34c4f21fa");
  assert.equal(project.miniprogramRoot, "miniprogram/");
  assert.equal(project.cloudfunctionRoot, "cloudfunctions/");
  assert.equal(appConfig.tabBar.list.length, 5);
  assert.equal(appConfig.tabBar.custom, true);
  assert.deepEqual(appConfig.tabBar.list[2], {
    pagePath: "pages/add/add",
    text: "",
    iconPath: "assets/tabbar/add.png",
    selectedIconPath: "assets/tabbar/add-selected.png",
  });
  assert.match(cloudConfigText, /cloud1-d0g1w79k00d72557c/);
  assert.equal(cloudPackage.dependencies["wx-server-sdk"], "4.0.2");
  assert.match(appText, /wx\.cloud\.init/);
  assert.match(appText, /action: "login"/);
  assert.match(appText, /updateUser/);
  assert.match(appText, /refreshLogin/);
  assert.doesNotMatch(appText, /dingxu_signed_out|SIGNED_OUT_KEY/);
  assert.match(serviceText, /ensureLogin/);
  assert.match(serviceText, /avatarUploadConfig/);
  assert.doesNotMatch(serviceText, /enableMonthlyReminder/);
  assert.match(serviceText, /update\(id, input\).*mutate\("update"/);
  assert.match(reminderText, /wx\.requestSubscribeMessage/);
  assert.match(reminderText, /result\[id\] === "accept"/);
  assert.match(cloudText, /cloud\.getWXContext\(\)/);
  assert.match(cloudText, /where\(\{ ownerOpenid \}\)/);
  assert.match(cloudText, /async function ownedSubscription/);
  assert.match(cloudText, /item\.ownerOpenid === ownerOpenid/);
  assert.match(cloudText, /item\.recordType === SUBSCRIPTION_RECORD_TYPE/);
  assert.match(cloudText, /case "saveProfile"/);
  assert.doesNotMatch(cloudText, /enableMonthlyReminder|sendMonthlyRenewalReminders|monthlyReminder/);
  assert.match(cloudText, /case "update"/);
  assert.match(cloudText, /async function updateSubscription/);
  assert.match(cloudText, /const current = await ownedSubscription\(ownerOpenid, id\)/);
  assert.match(cloudText, /reminderEnabled: Boolean\(current\.reminderEnabled && item\.reminderEnabled\)/);
  assert.match(cloudText, /async function login[\s\S]*publicUser\(ownerOpenid, profile\)/);
  assert.match(cloudText, /async function saveProfile[\s\S]*Object\.assign\(\{\}, current \|\| \{\}, profile\)/);
  assert.match(cloudText, /PROFILE_RECORD_TYPE/);
  assert.match(cloudText, /recordType === SUBSCRIPTION_RECORD_TYPE/);
  assert.match(cloudText, /profileComplete: Boolean\(profile && profile\.nickname\)/);
  assert.match(cloudText, /cloud\.openapi\.subscribeMessage\.send/);
  assert.match(cloudText, /event\.Type === "Timer"/);
  assert.match(cloudText, /if \(OPENID\) return \{ ok: false, error: "定时任务不能由客户端触发" \}/);
  assert.match(cloudText, /isOwnedAvatarFileId/);
  assert.match(cloudText, /avatarPathPrefix/);
  assert.match(cloudText, /mapWithConcurrency/);
  assert.match(cloudText, /reminderEnabled: false/);
  assert.match(cloudText, /reminderFailureCode/);
  assert.match(cloudText, /reminderFailureForDate/);
  assert.match(cloudText, /reminderFailedAt/);
  assert.match(cloudText, /time: "time1"/);
  assert.match(cloudText, /description: "thing2"/);
  assert.doesNotMatch(cloudText, /amount2|date3|thing4/);
  assert.equal(functionConfig.permissions.openapi[0], "subscribeMessage.send");
  assert.equal(functionConfig.triggers[0].config, "0 0 9 * * * *");
  assert.doesNotMatch(cloudText + appText + serviceText, /AppSecret|appsecret|getPhoneNumber|phoneNumber/);
  assert.doesNotMatch(indexText, /add-small|floating-add/);
  assert.match(indexText, /每月固定支出/);
  assert.match(indexText, /一年预计花费/);
  assert.match(indexText, /未来 7 天待扣/);
  assert.match(indexText, /管理提示/);
  assert.match(indexText, /managementNoteTitle/);
  assert.doesNotMatch(indexText, /bindtap="showMonthlyStats"|bindtap="showYearlyStats"|bindtap="showUpcomingStats"/);
  assert.match(indexText, /item\.reminderStatusText/);
  assert.match(indexText, /bindtap="editSubscription"/);
  assert.match(addText, /serviceOptions/);
  assert.match(addText, /customService/);
  assert.match(addText, /添加并申请微信提醒/);
  assert.match(addText, /修改订阅/);
  assert.match(addText, /保存修改/);
  assert.match(addText, /bindtap="cancelEdit"/);
  assert.match(addText, /id="color-plane"/);
  assert.match(addText, /id="hue-slider"/);
  assert.match(addText, /bindtouchstart="startColorTouch"/);
  assert.match(addText, /catchtouchmove="moveHueTouch"/);
  assert.match(addLogicText, /reminders\.request\(\)/);
  assert.match(addLogicText, /pendingSubscriptionEdit/);
  assert.match(addLogicText, /service\.update\(this\.data\.editingId, input\)/);
  assert.match(addLogicText, /servicesForCategory/);
  assert.match(addLogicText, /chooseSuggestedService/);
  assert.match(addLogicText, /resetAutoMatchedIcon/);
  assert.match(addLogicText, /isAutoMatchedIconFileId/);
  assert.match(addText, /输入任意订阅服务名称/);
  assert.match(addText, /class="service-suggestion/);
  assert.doesNotMatch(addText, /bindchange="changeService"/);
  assert.match(addLogicText, /function hsvToHex/);
  assert.match(addLogicText, /colorPickerState/);
  assert.match(addLogicText, /queueColorState/);
  assert.match(addText, /bindtouchend="flushColorState"/);
  assert.match(cloudText, /function normalizeColor/);
  assert.doesNotMatch(cloudText, /const COLORS = new Set/);
  assert.match(appStyleText, /form, label \{[^}]*box-sizing: border-box/);
  assert.match(appStyleText, /--font-sans: sans-serif/);
  assert.match(appStyleText, /--glass-surface:/);
  assert.match(appStyleText, /\.page \.form-section,[\s\S]*backdrop-filter: blur\(22rpx\)/);
  assert.match(appStyleText, /never every card in a long list/);
  assert.doesNotMatch(appStyleText, /page-enter|translateY/);
  assert.doesNotMatch(appStyleText + addStyleText, /Georgia|Songti|font-family:\s*serif/);
  assert.match(addStyleText, /\.form-panel \{[^}]*width: 100%/);
  assert.match(addStyleText, /\.add-page \{[^}]*overflow-x: hidden/);
  assert.match(addStyleText, /\.color-plane \{/);
  assert.match(addStyleText, /\.hue-slider \{/);
  assert.match(catalogText, /腾讯视频/);
  assert.match(catalogText, /网易云音乐/);
  assert.match(catalogText, /ChatGPT Plus/);
  assert.match(calendarText, /续费日历/);
  assert.match(insightsText, /消费分析/);
  assert.match(insightsText, /未来 6 个月扣款/);
  assert.match(insightsText, /bindtap="selectTrendMonth"/);
  assert.match(settingsText, /open-type="chooseAvatar"/);
  assert.match(settingsText, /mode="aspectFit"/);
  assert.match(settingsText, /type="nickname"/);
  assert.match(settingsText, /bindchange="authorizeWithNickname"/);
  assert.match(settingsText, /选择微信昵称（可选）/);
  assert.match(settingsText, /不授权昵称和头像，也可以正常使用订阅管理功能/);
  assert.match(settingsText, /profile-summary/);
  assert.match(settingsText, /账号已安全绑定/);
  assert.match(settingsText, /profile-card-head/);
  assert.match(settingsText, /profile-avatar-button/);
  assert.match(settingsText, /avatar-camera/);
  assert.match(settingsText, /profile-card-footer/);
  assert.match(settingsText, /更换头像/);
  assert.match(settingsText, /使用微信头像/);
  assert.doesNotMatch(settingsText, /退出账号|bindtap="signOut"/);
  assert.doesNotMatch(settingsText, /profile-actions|class="profile-action/);
  assert.match(settingsText, /bindtap="showAccountStat"/);
  assert.match(settingsText, /account-stat-detail/);
  assert.match(settingsText, /statDetailItems/);
  assert.match(settingsLogicText, /function accountStatDetail/);
  const accountStatMethod = settingsLogicText.match(/showAccountStat\(event\) \{([\s\S]*?)\n  \},\n\n  manageHistorySubscription/);
  assert.ok(accountStatMethod);
  assert.doesNotMatch(accountStatMethod[1], /wx\.showModal/);
  assert.match(settingsText, /提醒中心/);
  assert.match(settingsText, /已开启提醒/);
  assert.match(settingsText, /尚未授权/);
  assert.match(settingsText, /已发送、需要重新开启/);
  assert.match(settingsText, /提醒失败/);
  assert.match(settingsText, /bindtap="authorizeReminder"/);
  assert.match(settingsText, /一次授权仅发送一次/);
  assert.match(settingsText, /系统不会按月统一推送/);
  assert.doesNotMatch(settingsText, /本月汇总提醒|authorizeMonthlyReminder/);
  assert.match(settingsText, /reminder-empty" hidden/);
  assert.match(settingsText, /导出中心/);
  assert.match(settingsText, /我的全部订阅/);
  assert.match(settingsText, /本月支出报告/);
  assert.match(settingsText, /年度订阅账单/);
  assert.match(settingsText, /data-report="all"/);
  assert.match(settingsText, /canvas type="2d"/);
  // 375px 的导出画布正好等于整屏宽，常驻页面会撑出横向滚动；原生组件不受祖先 overflow 约束，
  // 只能靠 wx:if 在导出时才挂载，并等 setData 渲染完成后再查询画布节点。
  assert.match(settingsText, /canvas type="2d" wx:if="\{\{exporting\}\}"/);
  assert.match(settingsLogicText, /setData\(\{ exporting: true \}, resolve\)/);
  assert.match(settingsText, /微信身份已无感识别/);
  assert.doesNotMatch(settingsText, /class="profile-card"/);
  assert.match(settingsText, /无需授权昵称、头像或手机号即可使用/);
  assert.match(settingsLogicText, /wx\.cloud\.uploadFile/);
  assert.match(settingsLogicText, /service\.avatarUploadConfig/);
  assert.match(settingsLogicText, /action: "saveProfile"/);
  assert.match(settingsLogicText, /uploadedAvatarFileId/);
  assert.match(settingsLogicText, /deleteFile\(\{ fileList: \[uploadedAvatarFileId\] \}\)/);
  assert.match(settingsLogicText, /reminders\.request\(\)/);
  assert.doesNotMatch(settingsLogicText, /authorizeMonthlyReminder|enableMonthlyReminder|monthlyDue|monthlyReminder/);
  assert.match(settingsLogicText, /reminderCounts/);
  assert.match(settingsLogicText, /filterReminders/);
  assert.match(settingsLogicText, /REMINDER_FILTER_LABELS/);
  assert.match(settingsLogicText, /wx\.nextTick/);
  assert.match(settingsLogicText, /wx\.shareFileMessage/);
  assert.match(settingsLogicText, /getExportService/);
  assert.match(reportExportText, /wx\.canvasToTempFilePath/);
  assert.match(reportExportText, /wx\.env\.USER_DATA_PATH/);
  assert.match(reportExportText, /PAGE_SIZE/);
  assert.match(tabBarText, /class="add-button"/);
  assert.match(tabBarStyleText, /font-size: 26rpx/);
  assert.match(tabBarStyleText, /width: 76rpx/);
  assert.match(tabBarStyleText, /backdrop-filter: blur\(28rpx\)/);
  assert.doesNotMatch(tabBarStyleText, /\.tab-item-pressed/);
  assert.doesNotMatch(tabBarStyleText, /scale\(/);
  assert.doesNotMatch(tabBarLogicText, /switching:\s*false|setTimeout/);
});

test("all mini program pages expose privacy-safe sharing", async () => {
  const sharingSource = await readFile(new URL("miniprogram/utils/sharing.js", root), "utf8");
  assert.match(sharingSource, /wx\.showShareMenu/);
  assert.match(sharingSource, /shareAppMessage/);
  assert.match(sharingSource, /shareTimeline/);
  assert.match(sharingSource, /path: SHARE_PATH/);
  assert.match(sharingSource, /imageUrl: SHARE_IMAGE/);
  assert.match(sharingSource, /assets\/share\/dingxu-share-cover\.jpg/);
  assert.match(sharingSource, /\/pages\/index\/index\?source=share/);
  assert.doesNotMatch(sharingSource, /openid|subscription|amount|nickname|avatar/i);

  const pageNames = ["index", "calendar", "insights", "settings", "add"];
  const pageSources = await Promise.all(pageNames.map((name) => (
    readFile(new URL(`miniprogram/pages/${name}/${name}.js`, root), "utf8")
  )));
  pageSources.forEach((source) => {
    assert.match(source, /sharing\.enable\(\)/);
    assert.match(source, /onShareAppMessage\(\)/);
    assert.match(source, /onShareTimeline\(\)/);
  });
});

test("billing dates keep their month-end anchor instead of drifting down to the 28th", async () => {
  const utils = await loadSubscriptionUtils();

  // 31 号的月付订阅经过 2 月后必须回到 31 号，否则每年会永久提前几天扣款。
  const anchored = [1, 2, 3, 4].map((count) => utils.dateKey(
    utils.billingDateAt(new Date(2026, 0, 31), "monthly", count, 31),
  ));
  assert.deepEqual(anchored, ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);

  const april = utils.renewalsForMonth(
    [{ _id: "a", name: "锚定", amountCents: 100, billingCycle: "monthly", nextChargeDate: "2026-01-31", status: "active" }],
    2026,
    3,
  );
  assert.deepEqual(Array.from(april, (item) => item.nextChargeDate), ["2026-04-30"]);

  // 很久以前建的订阅也要在未来 6 个月里每月都出现，不能被推算循环的上限截断。
  const trend = utils.renewalTrend(
    [{ _id: "b", name: "老订阅", amountCents: 1000, billingCycle: "monthly", nextChargeDate: "2005-01-15", status: "active" }],
    6,
    new Date(2026, 7, 12),
  );
  assert.deepEqual(Array.from(trend, (bucket) => bucket.count), [1, 1, 1, 1, 1, 1]);

  // 逾期订阅不能显示成 “-7天后”。
  const today = new Date(2026, 7, 12);
  today.setHours(0, 0, 0, 0);
  const overdue = utils.decorate(
    { _id: "c", name: "逾期", amountCents: 1000, billingCycle: "monthly", nextChargeDate: "2026-08-05", status: "active" },
    today,
  );
  assert.equal(overdue.status, "pending_confirmation");
  assert.equal(overdue.daysText, "已逾期 7 天");
  assert.equal(overdue.remainingDays, -7);
});

test("the cloud renewal date advances on the stored billing anchor day", async () => {
  const source = await readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8");
  // 云函数每次续费都要把锚定日写回记录，客户端和云端的推算才会一致。
  assert.match(source, /data\.billingAnchorDay = anchorDay;/);
  assert.match(source, /billingAnchorDay: Number\(nextChargeDate\.slice\(8, 10\)\)/);
  assert.match(source, /nextFutureChargeDate\(current\.nextChargeDate, current\.billingCycle, today, anchorDay\)/);

  const advance = new Function(`${source.match(/function advanceDate[\s\S]*?\n}\n/)[0]}${source.match(/function isValidDateKey[\s\S]*?\n}\n/)[0]}return advanceDate;`)();
  assert.equal(advance("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(advance("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(advance("2026-02-28", "monthly"), "2026-03-28");
});
