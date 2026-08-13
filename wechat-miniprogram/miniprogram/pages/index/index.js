/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, clearTimeout, getApp, setTimeout, wx */
const service = require("../../services/subscriptions");
const reminders = require("../../services/reminders");
const pageData = require("../../services/pageData");
const sharing = require("../../utils/sharing");
const utils = require("../../utils/subscriptions");
const VIEW_PREFERENCE_KEY = "overviewViewPreferenceV1";
const VALID_STATUS_FILTERS = ["all", "active", "pending_confirmation", "paused", "cancel_pending"];

function readViewPreference() {
  if (typeof wx.getStorageSync !== "function") return {};
  try {
    const value = wx.getStorageSync(VIEW_PREFERENCE_KEY) || {};
    const sortIndex = [0, 1, 2].includes(Number(value.sortIndex)) ? Number(value.sortIndex) : 0;
    return {
      expandedOverviewMetric: ["monthly", "yearly", "upcoming"].includes(value.expandedOverviewMetric) ? value.expandedOverviewMetric : "",
      sortIndex,
      sortLabel: ["按续费日", "金额降序", "按名称"][sortIndex],
      statusFilter: VALID_STATUS_FILTERS.includes(value.statusFilter) ? value.statusFilter : "all",
    };
  } catch {
    return {};
  }
}

function saveViewPreference(data) {
  if (typeof wx.setStorageSync !== "function") return;
  try {
    wx.setStorageSync(VIEW_PREFERENCE_KEY, {
      expandedOverviewMetric: data.expandedOverviewMetric,
      sortIndex: data.sortIndex,
      statusFilter: data.statusFilter,
    });
  } catch {}
}

function filterSubscriptions(subscriptions, query, statusFilter) {
  const keyword = String(query || "").trim().toLowerCase();
  return subscriptions.filter((item) => (
    (statusFilter === "all" || item.status === statusFilter)
    && (!keyword || [item.name, item.category, item.note]
      .some((value) => String(value || "").toLowerCase().includes(keyword)))
  ));
}

function sortSubscriptions(subscriptions, sortIndex) {
  const sorted = subscriptions.slice();
  if (sortIndex === 1) return sorted.sort((left, right) => Number(right.amountCents || 0) - Number(left.amountCents || 0));
  if (sortIndex === 2) return sorted.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"));
  return sorted.sort((left, right) => String(left.nextChargeDate || "").localeCompare(String(right.nextChargeDate || "")));
}

function visibleSubscriptions(subscriptions, query, sortIndex, statusFilter) {
  return sortSubscriptions(filterSubscriptions(subscriptions, query, statusFilter), sortIndex);
}

function batchSelectionData(subscriptions, selection) {
  const batchSelection = {};
  const selected = subscriptions.filter((item) => selection && selection[item._id]);
  selected.forEach((item) => { batchSelection[item._id] = true; });
  return {
    batchPausableCount: selected.filter((item) => item.status === "active").length,
    batchRestorableCount: selected.filter((item) => ["paused", "cancel_pending"].includes(item.status)).length,
    batchSelectedCount: selected.length,
    batchSelection,
  };
}

function overviewMetricDetail(type, subscriptions, upcoming) {
  const active = subscriptions.filter((item) => item.status === "active");
  if (type === "upcoming") {
    const items = upcoming
      .slice()
      .sort((left, right) => String(left.nextChargeDate).localeCompare(String(right.nextChargeDate)))
      .map((item) => ({
        _id: item._id,
        color: item.color,
        logoPath: item.logoPath,
        metaText: `${item.dateText} · ${item.daysText}`,
        name: item.name,
        valueText: item.amountText,
      }));
    return {
      overviewDetailCopy: "按未来 7 天内的实际续费日期统计",
      overviewDetailItems: items,
      overviewDetailTitle: "未来 7 天待扣",
      overviewDetailValue: utils.money(upcoming.reduce((sum, item) => sum + Number(item.amountCents || 0), 0)),
    };
  }
  const yearly = type === "yearly";
  const items = active
    .slice()
    .sort((left, right) => (
      yearly
        ? utils.annualCents(right) - utils.annualCents(left)
        : utils.monthlyCents(right) - utils.monthlyCents(left)
    ))
    .map((item) => ({
      _id: item._id,
      color: item.color,
      logoPath: item.logoPath,
      metaText: yearly
        ? `${item.billingCycle === "yearly" ? "每年支付一次" : "月付金额 × 12"} · ${item.dateText}续费`
        : `${item.billingCycle === "yearly" ? "年付金额 ÷ 12" : "按月续费"} · ${item.dateText}续费`,
      name: item.name,
      valueText: yearly
        ? `${utils.money(utils.annualCents(item))}/年`
        : `${utils.money(utils.monthlyCents(item))}/月`,
    }));
  return {
    overviewDetailCopy: yearly ? "假设当前生效订阅持续一年" : "月付金额与年付金额 ÷ 12 后相加",
    overviewDetailItems: items,
    overviewDetailTitle: yearly ? "一年预计花费" : "每月固定支出",
    overviewDetailValue: yearly
      ? utils.money(active.reduce((sum, item) => sum + utils.annualCents(item), 0))
      : utils.money(active.reduce((sum, item) => sum + utils.monthlyCents(item), 0)),
  };
}

Page({
  data: {
    accountState: "connecting",
    accountStatusText: "正在连接微信",
    actionBusy: false,
    activeCount: 0,
    activationCount: 0,
    activationProgress: 0,
    batchPausableCount: 0,
    batchRestorableCount: 0,
    batchSelectedCount: 0,
    batchSelection: {},
    expandedOverviewMetric: "",
    loading: true,
    managementNoteCopy: "",
    managementNoteTitle: "",
    monthlyText: "¥0",
    overviewDetailCopy: "",
    overviewDetailItems: [],
    overviewDetailTitle: "",
    overviewDetailValue: "",
    profileComplete: false,
    pendingCount: 0,
    searchQuery: "",
    selectionMode: false,
    sortIndex: 0,
    sortLabel: "按续费日",
    sortOptions: ["按续费日", "金额降序", "按名称"],
    statusFilter: "all",
    statusFilters: [
      { count: 0, label: "全部", value: "all" },
      { count: 0, label: "生效中", value: "active" },
      { count: 0, label: "待确认", value: "pending_confirmation" },
      { count: 0, label: "已暂停", value: "paused" },
      { count: 0, label: "计划取消", value: "cancel_pending" },
    ],
    subscriptionCount: 0,
    upcomingCount: 0,
    upcomingText: "¥0",
    visibleSubscriptions: [],
    yearlyText: "¥0",
  },

  onLoad(options) {
    this._focusSubscriptionId = options && options.focus ? String(options.focus) : "";
    this._focusPending = Boolean(options && options.pending);
    const preference = readViewPreference();
    if (this._focusPending) preference.expandedOverviewMetric = "upcoming";
    this.setData(preference);
  },

  onUnload() {
    clearTimeout(this._searchTimer);
  },

  onShow() {
    sharing.enable();
    pageData.selectTab(this, 0);
    reminders.preload();
    const app = getApp();
    if (app.globalData.pendingSubscriptionFocusId) {
      this._focusSubscriptionId = app.globalData.pendingSubscriptionFocusId;
      app.globalData.pendingSubscriptionFocusId = "";
    }
    this.syncAccountState();
    this.loadSubscriptions().then(() => this.focusRequestedContent());
  },

  syncAccountState() {
    const app = getApp();
    const cachedUser = app.globalData.user;
    if (cachedUser) {
      this.applyAccountState(cachedUser);
      app.refreshLogin().then((user) => this.applyAccountState(user)).catch(() => {});
      return;
    }
    this.setData({ accountState: "connecting", accountStatusText: "正在连接微信" });
    app.ensureLogin()
      .then((user) => this.applyAccountState(user))
      .catch(() => this.setData({
        accountState: "failed",
        accountStatusText: "微信连接失败",
        profileComplete: false,
      }));
  },

  applyAccountState(user) {
    if (this._accountUserSource === user) return;
    this._accountUserSource = user;
    const profileComplete = Boolean(user && user.profileComplete);
    this.setData({
      accountState: profileComplete ? "synced" : "identified",
      accountStatusText: profileComplete ? "微信云端已同步" : "微信身份已识别",
      profileComplete,
    });
  },

  onPullDownRefresh() {
    this.loadSubscriptions({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  applySubscriptions(items) {
    const summary = utils.summarize(items);
    const currentSubscriptions = summary.all.filter((item) => item.status !== "archived");
    // decorate 已经算过剩余天数，这里直接复用，避免每项再构造一次 Date。
    const upcoming = summary.active.filter((item) => item.remainingDays >= 0 && item.remainingDays <= 7);
    const statusCounts = currentSubscriptions.reduce((result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      return result;
    }, {});
    const cancelPendingCount = statusCounts.cancel_pending || 0;
    const pausedCount = statusCounts.paused || 0;
    const activationCount = Math.min(3, currentSubscriptions.length);
    const searchQuery = currentSubscriptions.length ? this.data.searchQuery : "";
    let managementNoteTitle = "取消会员前，先关闭自动续费";
    let managementNoteCopy = "先在对应服务商关闭自动续费，再在订阅卡片中标记“到期取消”。";
    if (cancelPendingCount || pausedCount) {
      managementNoteTitle = [
        cancelPendingCount ? `${cancelPendingCount} 项等待到期取消` : "",
        pausedCount ? `${pausedCount} 项已暂停` : "",
      ].filter(Boolean).join("，");
      managementNoteCopy = cancelPendingCount
        ? "请确认已在对应服务商关闭自动续费；已暂停的订阅不会参与统计或被定时删除。"
        : "暂停期间不参与支出统计、续费日历或提醒，也不会被定时自动删除。";
    }
    const viewData = {
      activeCount: summary.activeCount,
      activationCount,
      activationProgress: Math.round(activationCount / 3 * 100),
      loading: false,
      managementNoteCopy,
      managementNoteTitle,
      monthlyText: utils.money(summary.monthlyCents),
      pendingCount: summary.pendingActionable.length,
      searchQuery,
      statusFilters: this.data.statusFilters.map((filter) => Object.assign({}, filter, {
        count: filter.value === "all" ? currentSubscriptions.length : statusCounts[filter.value] || 0,
      })),
      subscriptionCount: currentSubscriptions.length,
      upcomingCount: upcoming.length,
      upcomingText: utils.money(upcoming.reduce((sum, item) => sum + item.amountCents, 0)),
      visibleSubscriptions: visibleSubscriptions(currentSubscriptions, searchQuery, this.data.sortIndex, this.data.statusFilter),
      yearlyText: utils.money(summary.yearlyCents),
    };
    // 完整列表只留在逻辑层：视图层已有 visibleSubscriptions，再传一份纯粹是 setData 负担。
    this._subscriptions = currentSubscriptions;
    this._upcoming = upcoming;
    if (this.data.selectionMode) Object.assign(viewData, batchSelectionData(currentSubscriptions, this.data.batchSelection));
    if (this.data.expandedOverviewMetric) {
      Object.assign(viewData, overviewMetricDetail(this.data.expandedOverviewMetric, summary.all, upcoming));
    }
    this.setData(viewData, () => this.focusRequestedContent());
  },

  // 逐字过滤会在每次按键重排整张列表；输入框先回显，列表延后一帧统一刷新。
  changeSearch(event) {
    const searchQuery = event.detail.value;
    this.setData({ searchQuery });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.refreshVisibleSubscriptions(), 120);
  },

  clearSearch() {
    clearTimeout(this._searchTimer);
    this.setData({ searchQuery: "" }, () => this.refreshVisibleSubscriptions());
  },

  refreshVisibleSubscriptions() {
    this.setData({
      visibleSubscriptions: visibleSubscriptions(
        this._subscriptions || [],
        this.data.searchQuery,
        this.data.sortIndex,
        this.data.statusFilter,
      ),
    });
  },

  changeSort(event) {
    const sortIndex = Number(event.detail.value) || 0;
    this.setData({
      sortIndex,
      sortLabel: this.data.sortOptions[sortIndex],
      visibleSubscriptions: visibleSubscriptions(this._subscriptions || [], this.data.searchQuery, sortIndex, this.data.statusFilter),
    }, () => saveViewPreference(this.data));
  },

  changeStatusFilter(event) {
    const statusFilter = event.currentTarget.dataset.status;
    if (!statusFilter || statusFilter === this.data.statusFilter) return;
    this.setData({
      statusFilter,
      visibleSubscriptions: visibleSubscriptions(this._subscriptions || [], this.data.searchQuery, this.data.sortIndex, statusFilter),
    }, () => saveViewPreference(this.data));
  },

  resetListFilters() {
    this.setData({
      searchQuery: "",
      sortIndex: 0,
      sortLabel: this.data.sortOptions[0],
      statusFilter: "all",
      visibleSubscriptions: visibleSubscriptions(this._subscriptions || [], "", 0, "all"),
    }, () => saveViewPreference(this.data));
  },

  setBatchSelection(batchSelection) {
    this.setData(batchSelectionData(this._subscriptions || [], batchSelection));
  },

  toggleSelectionMode() {
    if (this.data.actionBusy) return;
    const selectionMode = !this.data.selectionMode;
    this.setData(Object.assign(
      { selectionMode },
      batchSelectionData(this._subscriptions || [], {}),
    ));
  },

  toggleSubscriptionSelection(event) {
    const id = event.currentTarget.dataset.id;
    if (!id || !this.data.selectionMode) return;
    const batchSelection = Object.assign({}, this.data.batchSelection);
    if (batchSelection[id]) delete batchSelection[id];
    else if (this.data.batchSelectedCount >= 20) {
      wx.showToast({ title: "一次最多选择 20 项", icon: "none" });
      return;
    } else batchSelection[id] = true;
    this.setBatchSelection(batchSelection);
  },

  selectVisibleSubscriptions() {
    const batchSelection = Object.assign({}, this.data.batchSelection);
    let count = this.data.batchSelectedCount;
    let limitReached = false;
    this.data.visibleSubscriptions.forEach((item) => {
      if (!batchSelection[item._id] && count < 20) {
        batchSelection[item._id] = true;
        count += 1;
      } else if (!batchSelection[item._id]) limitReached = true;
    });
    this.setBatchSelection(batchSelection);
    if (limitReached) wx.showToast({ title: "一次最多选择 20 项", icon: "none" });
  },

  clearBatchSelection() {
    this.setBatchSelection({});
  },

  batchManageSubscriptions(event) {
    if (this.data.actionBusy) return;
    const operation = event.currentTarget.dataset.operation;
    if (!["pause", "restore"].includes(operation)) return;
    const eligibleStatuses = operation === "pause" ? ["active"] : ["paused", "cancel_pending"];
    const selected = (this._subscriptions || []).filter((item) => this.data.batchSelection[item._id]);
    const eligible = selected.filter((item) => eligibleStatuses.includes(item.status));
    if (!eligible.length) return;
    const action = operation === "pause" ? "暂停" : "恢复";
    const skipped = selected.length - eligible.length;
    wx.showModal({
      title: `批量${action} ${eligible.length} 项？`,
      content: `${operation === "pause" ? "暂停后不再计入支出、日历和提醒。" : "恢复后会重新计入支出、日历和提醒。"}${skipped ? `\n另有 ${skipped} 项状态不适用，不会改变。` : ""}`,
      confirmText: `确认${action}`,
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ actionBusy: true });
        wx.showLoading({ title: `正在${action}`, mask: true });
        eligible.reduce(
          (chain, item) => chain.then(() => service.updateStatus(item._id, operation, false)),
          Promise.resolve(),
        ).then(() => {
          this.setData(Object.assign(
            { selectionMode: false },
            batchSelectionData(this._subscriptions || [], {}),
          ));
          wx.showToast({ title: `已${action} ${eligible.length} 项`, icon: "none" });
          return this.loadSubscriptions({ force: true });
        }).catch((error) => {
          wx.showModal({ title: "批量操作未全部完成", content: `${error.message || "请稍后再试"}\n请刷新后核对订阅状态。`, showCancel: false });
          return this.loadSubscriptions({ force: true });
        }).finally(() => {
          this.setData({ actionBusy: false });
          wx.hideLoading();
        });
      },
    });
  },

  focusRequestedContent() {
    const selector = this._focusSubscriptionId
      ? `#subscription-${this._focusSubscriptionId}`
      : this._focusPending
        ? (this.data.pendingCount ? "#pending-renewals" : ".overview-detail")
        : "";
    if (!selector) return;
    this._focusSubscriptionId = "";
    this._focusPending = false;
    if (typeof wx.pageScrollTo === "function") wx.pageScrollTo({ selector, duration: 280 });
  },

  loadSubscriptions(options) {
    return pageData.load(this, {
      apply: (items) => this.applySubscriptions(items),
      hasContent: Boolean((this._subscriptions || []).length),
      request: options,
    });
  },

  addSubscription() {
    wx.switchTab({ url: "/pages/add/add" });
  },

  openAccount() {
    wx.switchTab({ url: "/pages/settings/settings" });
  },

  openRenewalCenter() {
    getApp().globalData.pendingRenewalFlow = { focusId: "" };
    wx.switchTab({ url: "/pages/settings/settings" });
  },

  editSubscription(event) {
    const item = (this._subscriptions || []).find((entry) => entry._id === event.currentTarget.dataset.id);
    if (!item) return;
    getApp().globalData.pendingSubscriptionEdit = Object.assign({}, item);
    wx.switchTab({ url: "/pages/add/add" });
  },

  toggleOverviewMetric(event) {
    const type = event.currentTarget.dataset.metric;
    if (!["monthly", "yearly", "upcoming"].includes(type)) return;
    if (this.data.expandedOverviewMetric === type) {
      this.setData({
        expandedOverviewMetric: "",
        overviewDetailCopy: "",
        overviewDetailItems: [],
        overviewDetailTitle: "",
        overviewDetailValue: "",
      }, () => saveViewPreference(this.data));
      return;
    }
    this.setData(Object.assign(
      { expandedOverviewMetric: type },
      overviewMetricDetail(type, this._subscriptions || [], this._upcoming || []),
    ), () => saveViewPreference(this.data));
  },

  manageSubscription(event) {
    if (this.data.actionBusy) return;
    const { id, operation } = event.currentTarget.dataset;
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
    if (!item) return;
    const copy = utils.subscriptionOperationCopy(operation, item);
    if (!copy) return;
    wx.showModal({
      title: copy.title,
      content: copy.content,
      confirmColor: copy.confirmColor,
      confirmText: copy.confirmText,
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ actionBusy: true });
        const authorization = operation === "renew" && item && !item.reminderEnabled
          ? reminders.request()
          : Promise.resolve({ enabled: Boolean(item && item.reminderEnabled) });
        authorization.then(({ enabled }) => {
          wx.showLoading({ title: "处理中", mask: true });
          return service.updateStatus(
            id,
            operation,
            enabled,
            0,
            { expectedNextChargeDate: item.nextChargeDate },
          ).then(() => enabled);
        }).then((enabled) => {
          wx.showToast({ title: operation === "renew" && !enabled ? "已续费，提醒未开启" : copy.success, icon: "none" });
          this.loadSubscriptions();
        }).catch((error) => wx.showModal({ title: "操作失败", content: error.message, showCancel: false }))
          .finally(() => {
            this.setData({ actionBusy: false });
            wx.hideLoading();
          });
      },
    });
  },

  snoozeSubscription(event) {
    if (this.data.actionBusy) return;
    const id = event.currentTarget.dataset.id;
    const current = (this._subscriptions || []).find((entry) => entry._id === id);
    if (current && !current.taskAvailable) {
      wx.showToast({ title: `已延后至 ${current.snoozeDateText}`, icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: ["1 天后提醒", "3 天后提醒", "7 天后提醒"],
      success: ({ tapIndex }) => {
        const days = [1, 3, 7][tapIndex];
        if (!days) return;
        this.setData({ actionBusy: true });
        service.updateStatus(id, "snooze", false, days)
          .then(() => {
            wx.showToast({ title: `已延后 ${days} 天`, icon: "none" });
            return this.loadSubscriptions();
          })
          .catch((error) => wx.showModal({ title: "操作失败", content: error.message, showCancel: false }))
          .finally(() => this.setData({ actionBusy: false }));
      },
    });
  },

  deleteSubscription(event) {
    if (this.data.actionBusy) return;
    const id = event.currentTarget.dataset.id;
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
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

  authorizeReminder(event) {
    const { id } = event.currentTarget.dataset;
    reminders.request().then(({ enabled, reason }) => {
      if (!enabled) {
        const title = reason === "unconfigured" ? "提醒模板尚未配置" : "未获得微信提醒授权";
        wx.showToast({ title, icon: "none" });
        return null;
      }
      wx.showLoading({ title: "正在开启", mask: true });
      return service.enableReminder(id).then(() => {
        wx.showToast({ title: "微信提醒已开启" });
        return this.loadSubscriptions();
      }).finally(() => wx.hideLoading());
    }).catch((error) => wx.showModal({ title: "开启失败", content: error.message, showCancel: false }));
  },

  onShareAppMessage() { return sharing.appMessage(); },

  onShareTimeline() { return sharing.timeline(); },
});
