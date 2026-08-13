/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, setTimeout, wx */
const service = require("../../services/subscriptions");
const reminders = require("../../services/reminders");
const pageData = require("../../services/pageData");
const sharing = require("../../utils/sharing");
const serviceActions = require("../../utils/serviceActions");
const utils = require("../../utils/subscriptions");

let avatarTempFileId = "";
let avatarTempUrl = "";
let avatarTempRequest = null;
let exportService = null;
const REMINDER_STATE_ORDER = { failed: 0, unauthorized: 1, sent: 2, enabled: 3 };
const REMINDER_FILTER_LABELS = {
  enabled: "已开启提醒",
  unauthorized: "尚未授权",
  sent: "已发送、需要重新开启",
  failed: "提醒失败",
};
const REMINDER_DESCRIPTIONS = {
  unauthorized: "尚未获得本次微信订阅消息授权",
  sent: "本期提醒已发送，下个周期需要重新开启",
  failed: "上次发送没有成功，请重新开启提醒",
};

function getExportService() {
  if (!exportService) exportService = require("../../services/reportExport");
  return exportService;
}

function emptySubscriptionData(loading = false) {
  return {
    activeCount: 0,
    expandedStat: "",
    exportAnnualText: "¥0",
    exportTotalCount: 0,
    exportMonthlyText: "¥0",
    historyCount: 0,
    loading,
    monthlyText: "¥0",
    monthlyValueText: "0",
    reminderCounts: { enabled: 0, failed: 0, sent: 0, unauthorized: 0 },
    reminderFilter: "",
    reminderFilterLabel: "",
    reminderTotal: 0,
    recentActionCount: 0,
    recentActionItems: [],
    recentActionsExpanded: false,
    renewalAmountEditing: false,
    renewalAmountValue: "",
    renewalFlowActive: false,
    renewalFlowComplete: false,
    renewalFlowCurrent: null,
    renewalFlowIndex: 0,
    renewalFlowProgress: 0,
    renewalFlowSummary: { cancelled: 0, paused: 0, postponed: 0, renewed: 0, savedText: "¥0" },
    renewalFlowTotal: 0,
    serviceCenterExpanded: false,
    serviceActionConfirming: false,
    serviceActionGuide: null,
    serviceActionId: "",
    serviceFilter: "",
    serviceCounts: { followUp: 0, upcoming: 0, urgent: 0 },
    serviceFocusCopy: "未来 30 天没有需要处理的订阅",
    serviceFocusTitle: "当前无需处理",
    serviceItems: [],
    serviceReminderGapCount: 0,
    serviceTaskCount: 0,
    statDetailCopy: "",
    statDetailItems: [],
    statDetailTitle: "",
    statDetailValue: "",
    totalCount: 0,
    visibleReminderItems: [],
  };
}

function recentActionData(items) {
  const tones = {
    cancel: "danger",
    pause: "warning",
    renew: "success",
    restore: "success",
    snooze: "warning",
  };
  return items.filter((item) => item.lastActionDateText && item.lastActionText).map((item) => ({
    _id: item._id,
    actionText: item.lastActionText,
    color: item.color,
    dateText: item.lastActionDateText,
    logoPath: item.logoPath,
    name: item.name,
    sortDate: item.lastActionDate,
    tone: tones[item.lastAction] || "neutral",
  })).sort((left, right) => String(right.sortDate).localeCompare(String(left.sortDate)) || left.name.localeCompare(right.name));
}

function serviceCenterData(items, now = new Date()) {
  const counts = { followUp: 0, upcoming: 0, urgent: 0 };
  let pendingCount = 0;
  let reminderGapCount = 0;
  const serviceItems = items.reduce((result, item) => {
    const days = item.status === "active" ? utils.daysUntil(item.nextChargeDate, now) : 0;
    if (["active", "pending_confirmation"].includes(item.status) && !item.taskAvailable) return result;
    if (item.status === "active" && (days < 0 || days > 30)) return result;
    if (!["active", "pending_confirmation", "cancel_pending", "paused"].includes(item.status)) return result;
    let copy = `${item.dateText}续费 · ${item.paymentChannelText}`;
    let label = days <= 7 ? "7 天内续费" : "30 天内续费";
    let rank = days <= 7 ? 1 : 4;
    let tone = days <= 7 ? "urgent" : "upcoming";
    let deadlineText = days === 0 ? "今天续费" : `${days} 天后续费`;
    if (item.status === "active" && item.reminderState !== "enabled") reminderGapCount += 1;
    if (item.status === "pending_confirmation") {
      const overdueDays = Math.abs(utils.daysUntil(item.nextChargeDate, now));
      copy = `${item.dateText}已到期 · 请选择续费、取消或延后`;
      deadlineText = overdueDays ? `已逾期 ${overdueDays} 天` : "今天到期";
      label = "待确认";
      pendingCount += 1;
      rank = 0;
      tone = "urgent";
    } else if (item.status === "cancel_pending") {
      const archiveDays = item.archiveDate ? utils.daysUntil(item.archiveDate, now) : 0;
      copy = item.archiveDateText
        ? `${item.paymentChannelText} · ${item.archiveDateText}自动归档`
        : `${item.paymentChannelText} · 等待归档`;
      deadlineText = item.archiveDate
        ? (archiveDays > 0 ? `${archiveDays} 天后归档` : "今天自动归档")
        : "等待自动归档";
      label = "计划取消";
      rank = 2;
      tone = "follow-up";
    } else if (item.status === "paused") {
      copy = `${item.paymentChannelText} · 可随时恢复`;
      deadlineText = "暂停保留，不会自动归档";
      label = "已暂停";
      rank = 3;
      tone = "follow-up";
    }
    if (tone === "urgent") counts.urgent += 1;
    else if (tone === "upcoming") counts.upcoming += 1;
    else counts.followUp += 1;
    // 这里只需要知道有没有指引；guideFor 会拼出完整步骤文案，展开时再算。
    const officialActionAvailable = ["active", "pending_confirmation"].includes(item.status)
      && Boolean(serviceActions.find(item.name));
    result.push({
      _id: item._id,
      actionText: item.status === "pending_confirmation" ? "处理" : "管理",
      color: item.color,
      copy,
      deadlineText,
      label,
      logoPath: item.logoPath,
      name: item.name,
      priceChangeText: item.priceChangeText,
      priceChangedDateText: item.priceChangedDateText,
      rank,
      restoreStartDate: utils.dateKey(now),
      sortDate: item.status === "cancel_pending" ? item.archiveDate || item.nextChargeDate : item.nextChargeDate,
      tone,
      status: item.status,
      officialActionAvailable,
    });
    return result;
  }, []).sort((left, right) => left.rank - right.rank || String(left.sortDate).localeCompare(String(right.sortDate)));
  let serviceFocusTitle = "当前无需处理";
  let serviceFocusCopy = "未来 30 天没有需要处理的订阅";
  if (pendingCount) {
    serviceFocusTitle = `先处理 ${pendingCount} 项待确认`;
    serviceFocusCopy = "续费日已过，请确认续费、取消或延后";
  } else if (reminderGapCount) {
    serviceFocusTitle = `${reminderGapCount} 项续费提醒待开启`;
    serviceFocusCopy = "开启一次，在本次续费前发送一次微信提醒";
  } else if (counts.urgent) {
    serviceFocusTitle = `本周有 ${counts.urgent} 项续费`;
    serviceFocusCopy = "建议提前核对金额和自动续费状态";
  } else if (counts.followUp) {
    serviceFocusTitle = `跟进 ${counts.followUp} 项状态`;
    serviceFocusCopy = "检查暂停与计划取消的订阅";
  } else if (counts.upcoming) {
    serviceFocusTitle = `未来 30 天有 ${counts.upcoming} 项续费`;
    serviceFocusCopy = "目前无需立即处理，可提前查看安排";
  }
  return {
    serviceCounts: counts,
    serviceFocusCopy,
    serviceFocusTitle,
    serviceItems,
    serviceReminderGapCount: reminderGapCount,
    serviceTaskCount: serviceItems.length,
  };
}

function serviceTaskActions(item) {
  if (!item) return { labels: [], operations: [] };
  if (item.status === "pending_confirmation") {
    return {
      labels: ["确认已续费", "确认已取消", "延后 1 天", "延后 3 天", "延后 7 天", "编辑订阅"],
      operations: ["renew", "cancel", "snooze:1", "snooze:3", "snooze:7", "edit"],
    };
  }
  if (item.status === "active") {
    const reminderMissing = item.reminderState !== "enabled";
    return {
      labels: reminderMissing
        ? [item.reminderState === "unauthorized" ? "开启微信提醒" : "重新开启微信提醒", "编辑订阅", "暂停订阅", "记录到期取消"]
        : ["编辑订阅", "暂停订阅", "记录到期取消"],
      operations: reminderMissing
        ? ["reminder", "edit", "pause", "cancel"]
        : ["edit", "pause", "cancel"],
    };
  }
  if (item.status === "paused") {
    return { labels: ["永久删除"], operations: ["delete"] };
  }
  return {
    labels: ["恢复订阅", "永久删除"],
    operations: ["restore", "delete"],
  };
}

function renewalUpdateInput(item, amountValue) {
  const sourceAmountCents = Math.round(Number(amountValue) * 100);
  return {
    amountCents: sourceAmountCents,
    billingCycle: item.billingCycle,
    category: item.category,
    color: item.color,
    currency: item.currency,
    iconFileId: item.iconFileId || "",
    name: item.name,
    nextChargeDate: item.nextChargeDate,
    note: item.note || "",
    paymentChannel: item.paymentChannel,
    reminderDays: item.reminderDays,
    reminderEnabled: item.reminderEnabled,
    sourceAmountCents,
  };
}

function accountStatDetail(type, subscriptions) {
  const active = subscriptions.filter((item) => item.status === "active");
  const cancelled = subscriptions.filter((item) => item.status === "cancel_pending");
  const paused = subscriptions.filter((item) => item.status === "paused");
  const pending = subscriptions.filter((item) => item.status === "pending_confirmation");
  const archived = subscriptions.filter((item) => item.status === "archived");
  const current = subscriptions.filter((item) => item.status !== "archived");
  const source = type === "history"
    ? archived
    : type === "all"
    ? current
    : active.slice().sort((left, right) => (
      type === "monthly"
        ? utils.monthlyCents(right) - utils.monthlyCents(left)
        : String(left.nextChargeDate).localeCompare(String(right.nextChargeDate))
    ));
  const statDetailItems = source.map((item) => ({
    _id: item._id,
    color: item.color,
    logoPath: item.logoPath,
    metaText: type === "monthly"
      ? `${item.billingCycle === "yearly" ? "年付，已平均到每月" : "按月续费"} · ${item.dateText}续费`
      : `${item.status === "active" ? `${item.dateText}续费` : item.statusLabel} · ${item.category}`,
    name: item.name,
    valueText: type === "monthly" ? `${utils.money(utils.monthlyCents(item))}/月` : item.amountText,
  }));
  if (type === "history") {
    return {
      statDetailCopy: "归档记录不参与支出、日历和提醒统计",
      statDetailItems,
      statDetailTitle: "历史记录",
      statDetailValue: `${archived.length} 项`,
    };
  }
  if (type === "all") {
    return {
      statDetailCopy: `生效 ${active.length} 项，待确认 ${pending.length} 项，暂停 ${paused.length} 项，计划取消 ${cancelled.length} 项`,
      statDetailItems,
      statDetailTitle: "全部订阅",
      statDetailValue: `${current.length} 项`,
    };
  }
  if (type === "active") {
    return {
      statDetailCopy: "按下一次续费日期排列",
      statDetailItems,
      statDetailTitle: "生效订阅",
      statDetailValue: `${active.length} 项`,
    };
  }
  return {
    statDetailCopy: "月付金额与年付金额 ÷ 12 后相加",
    statDetailItems,
    statDetailTitle: "月均支出构成",
    statDetailValue: utils.money(active.reduce((sum, item) => sum + utils.monthlyCents(item), 0)),
  };
}

function resolveAvatar(fileId) {
  if (!fileId || !fileId.startsWith("cloud://")) return Promise.resolve(fileId || "");
  if (fileId === avatarTempFileId && avatarTempUrl) return Promise.resolve(avatarTempUrl);
  if (fileId === avatarTempFileId && avatarTempRequest) return avatarTempRequest;
  avatarTempFileId = fileId;
  avatarTempUrl = "";
  avatarTempRequest = wx.cloud.getTempFileURL({ fileList: [fileId] }).then(({ fileList }) => {
    const item = fileList && fileList[0];
    avatarTempUrl = item && item.tempFileURL ? item.tempFileURL : "";
    return avatarTempUrl;
  }).catch(() => "").finally(() => {
    avatarTempRequest = null;
  });
  return avatarTempRequest;
}

Page({
  data: Object.assign(emptySubscriptionData(true), {
    actionBusy: false,
    avatarFileId: "",
    avatarUrl: "",
    identityReady: false,
    nickname: "",
    profileComplete: false,
    savingProfile: false,
    exporting: false,
    selectedAvatarPath: "",
  }),

  onLoad(options) {
    if (options && options.renewals) {
      this._renewalFlowRequested = true;
      this._renewalFocusId = options.focus ? String(options.focus) : "";
    }
  },

  onShow() {
    sharing.enable();
    const pendingFlow = getApp().globalData.pendingRenewalFlow;
    if (pendingFlow) {
      this._renewalFlowRequested = true;
      this._renewalFocusId = pendingFlow.focusId || "";
      getApp().globalData.pendingRenewalFlow = null;
    }
    if (this._renewalFlowRequested && this._subscriptions && this._subscriptions.length) {
      this._renewalFlowRequested = false;
      this.startRenewalFlow(this._renewalFocusId);
      this._renewalFocusId = "";
    }
    const syncPageState = () => this.syncPageState();
    if (typeof wx.nextTick === "function") wx.nextTick(syncPageState);
    else setTimeout(syncPageState, 0);
  },

  syncPageState() {
    pageData.selectTab(this, 4);
    const app = getApp();
    const cachedUser = app.globalData.user;
    if (cachedUser) this.applyAccountSession(cachedUser);
    app.refreshLogin().then((user) => {
      const shouldLoad = !cachedUser || (!cachedUser.profileComplete && user.profileComplete);
      this.applyAccountSession(user, shouldLoad);
    }).catch(() => {
      if (!cachedUser) this.setData({ loading: false });
    });
  },

  applyAccountSession(user, shouldLoad = true) {
    if (this._userSource !== user) {
      this._userSource = user;
      this.applyUser(user);
    }
    if (!user) {
      service.invalidate();
      this._subscriptions = [];
      this.applySubscriptions([]);
      return;
    }
    reminders.preload();
    if (!shouldLoad) return;
    pageData.load(this, {
      apply: (items) => this.applySubscriptions(items),
      hasContent: Boolean(this._subscriptions && this._subscriptions.length),
    });
  },

  applySubscriptions(items) {
    const summary = utils.summarize(items);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${utils.pad(now.getMonth() + 1)}`;
    const currentMonthItems = summary.active
      .filter((item) => String(item.nextChargeDate || "").startsWith(monthKey));
    const currentMonthCents = currentMonthItems
      .reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const reminderCounts = { enabled: 0, failed: 0, sent: 0, unauthorized: 0 };
    const reminderItems = summary.active.map((item) => {
      reminderCounts[item.reminderState] += 1;
      return {
        _id: item._id,
        color: item.color,
        dateText: item.dateText,
        logoPath: item.logoPath,
        name: item.name,
        reminderActionText: item.reminderState === "unauthorized" ? "开启" : "重新开启",
        reminderDescription: item.reminderState === "enabled"
          ? `将在续费前 ${item.reminderDays || 3} 天发送微信提醒`
          : REMINDER_DESCRIPTIONS[item.reminderState],
        reminderState: item.reminderState,
        reminderStatusText: item.reminderStatusText,
      };
    }).sort((left, right) => REMINDER_STATE_ORDER[left.reminderState] - REMINDER_STATE_ORDER[right.reminderState]);
    this._subscriptions = summary.all;
    this._reminderItems = reminderItems;
    const serviceCenter = serviceCenterData(summary.all, now);
    this._serviceItems = serviceCenter.serviceItems;
    const recentActionItems = recentActionData(summary.all);
    this._recentActionItems = recentActionItems;
    const viewData = {
      activeCount: summary.activeCount,
      exportAnnualText: utils.money(summary.yearlyCents),
      exportMonthlyText: utils.money(currentMonthCents),
      exportTotalCount: summary.all.length,
      historyCount: summary.archived.length,
      loading: false,
      monthlyText: utils.money(summary.monthlyCents),
      monthlyValueText: utils.money(summary.monthlyCents).replace(/^¥/, ""),
      reminderCounts,
      reminderTotal: reminderItems.length,
      recentActionCount: recentActionItems.length,
      recentActionItems: this.data.recentActionsExpanded ? recentActionItems : [],
      visibleReminderItems: this.data.reminderFilter
        ? reminderItems.filter((item) => item.reminderState === this.data.reminderFilter)
        : reminderItems,
      totalCount: summary.all.length - summary.archived.length,
    };
    Object.assign(viewData, serviceCenter, {
      serviceItems: this.data.serviceCenterExpanded
        ? serviceCenter.serviceItems.filter((item) => !this.data.serviceFilter || item.tone === this.data.serviceFilter)
        : [],
    });
    if (this.data.expandedStat) Object.assign(viewData, accountStatDetail(this.data.expandedStat, summary.all));
    this.setData(viewData, () => {
      if (this._renewalFlowRequested) {
        this._renewalFlowRequested = false;
        this.startRenewalFlow(this._renewalFocusId);
        this._renewalFocusId = "";
      }
    });
  },

  startRenewalFlow(focusId) {
    if (this.data.actionBusy) return;
    const items = this._subscriptions || [];
    const queue = items.filter((item) => (
      item.taskAvailable
      && (
        item.status === "pending_confirmation"
        || (item.status === "active" && item.reminderState === "sent")
        || item._id === focusId
      )
    )).sort((left, right) => (
      Number(right._id === focusId) - Number(left._id === focusId)
      || String(left.nextChargeDate).localeCompare(String(right.nextChargeDate))
    ));
    if (!queue.length) {
      wx.showToast({ title: "当前没有待处理续费", icon: "none" });
      return;
    }
    this._renewalFlowQueue = queue.map((item) => item._id);
    this._renewalFlowTotal = queue.length;
    this._renewalFlowStats = { cancelled: 0, paused: 0, postponed: 0, renewed: 0, savedCents: 0 };
    this.showRenewalFlowItem();
    if (typeof wx.pageScrollTo === "function") wx.pageScrollTo({ scrollTop: 0, duration: 220 });
  },

  showRenewalFlowItem() {
    const queue = this._renewalFlowQueue || [];
    const current = queue.length
      ? (this._subscriptions || []).find((item) => item._id === queue[0])
      : null;
    const stats = this._renewalFlowStats || { cancelled: 0, paused: 0, postponed: 0, renewed: 0, savedCents: 0 };
    this.setData({
      renewalAmountEditing: false,
      renewalAmountValue: current
        ? String(Number(current.currency === "USD" ? current.sourceAmountCents : current.amountCents) / 100)
        : "",
      renewalFlowActive: Boolean(current),
      renewalFlowComplete: !current,
      renewalFlowCurrent: current,
      renewalFlowIndex: current ? stats.cancelled + stats.paused + stats.postponed + stats.renewed + 1 : 0,
      renewalFlowProgress: current && this._renewalFlowTotal
        ? Math.round((stats.cancelled + stats.paused + stats.postponed + stats.renewed + 1) / this._renewalFlowTotal * 100)
        : 100,
      renewalFlowSummary: Object.assign({}, stats, { savedText: utils.money(stats.savedCents) }),
      renewalFlowTotal: (this._renewalFlowTotal || 0) || queue.length,
    });
    if (!this._renewalFlowTotal) this._renewalFlowTotal = queue.length;
  },

  closeRenewalFlow() {
    this._renewalFlowQueue = [];
    this._renewalFlowTotal = 0;
    this.setData({ renewalFlowActive: false, renewalFlowComplete: false, renewalFlowCurrent: null });
  },

  toggleRenewalAmount() {
    this.setData({ renewalAmountEditing: !this.data.renewalAmountEditing });
  },

  changeRenewalAmount(event) {
    this.setData({ renewalAmountValue: event.detail.value });
  },

  processRenewalFlow(event) {
    if (this.data.actionBusy) return;
    const operation = event.currentTarget.dataset.operation;
    const snoozeDays = Number(event.currentTarget.dataset.days || 0);
    const item = this.data.renewalFlowCurrent;
    if (!item || !["renew", "pause", "cancel", "snooze"].includes(operation)) return;
    const amountChanged = operation === "renew" && this.data.renewalAmountEditing;
    const amountValue = Number(this.data.renewalAmountValue);
    if (amountChanged && (!Number.isFinite(amountValue) || amountValue <= 0)) {
      wx.showToast({ title: "请输入正确金额", icon: "none" });
      return;
    }
    this.setData({ actionBusy: true });
    wx.showLoading({ title: "正在处理", mask: true });
    const update = amountChanged
      ? service.update(item._id, renewalUpdateInput(item, amountValue))
      : Promise.resolve(item);
    update.then((result) => {
      const updated = result && result.subscription ? result.subscription : item;
      const authorization = operation === "renew" && !item.reminderEnabled
        ? reminders.request()
        : Promise.resolve({ enabled: Boolean(item.reminderEnabled) });
      return authorization.then(({ enabled }) => service.updateStatus(
        item._id,
        operation,
        operation === "renew" && enabled,
        snoozeDays,
        { expectedNextChargeDate: updated.nextChargeDate },
      ));
    }).then(() => {
      const stats = this._renewalFlowStats;
      const statistic = { cancel: "cancelled", pause: "paused", renew: "renewed", snooze: "postponed" }[operation];
      stats[statistic] += 1;
      if (["pause", "cancel"].includes(operation)) stats.savedCents += utils.annualCents(item);
      this._renewalFlowQueue.shift();
      return service.list();
    }).then((items) => {
      this.applySubscriptions(items);
      this.showRenewalFlowItem();
    }).catch((error) => {
      wx.showModal({ title: "处理失败", content: error.message || "请稍后再试", showCancel: false });
    }).finally(() => {
      this.setData({ actionBusy: false });
      wx.hideLoading();
    });
  },

  restorePausedSubscription(event) {
    if (this.data.actionBusy) return;
    const id = event.currentTarget.dataset.id;
    const nextChargeDate = event.detail.value;
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
    if (!item || item.status !== "paused") return;
    this.setData({ actionBusy: true });
    service.updateStatus(id, "restore", false, 0, { nextChargeDate }).then(() => service.list()).then((items) => {
      this.applySubscriptions(items);
      wx.showToast({ title: "订阅已恢复", icon: "none" });
    }).catch((error) => wx.showModal({ title: "恢复失败", content: error.message || "请稍后再试", showCancel: false }))
      .finally(() => this.setData({ actionBusy: false }));
  },

  filterReminders(event) {
    const selectedState = event.currentTarget.dataset.state;
    const reminderFilter = this.data.reminderFilter === selectedState ? "" : selectedState;
    const reminderItems = this._reminderItems || [];
    this.setData({
      reminderFilter,
      reminderFilterLabel: REMINDER_FILTER_LABELS[reminderFilter] || "",
      visibleReminderItems: reminderFilter
        ? reminderItems.filter((item) => item.reminderState === reminderFilter)
        : reminderItems,
    });
  },

  clearReminderFilter() {
    this.setData({
      reminderFilter: "",
      reminderFilterLabel: "",
      visibleReminderItems: this._reminderItems || [],
    });
  },

  toggleServiceAction(event) {
    if (this.data.actionBusy) return;
    const id = event.currentTarget.dataset.id;
    if (id === this.data.serviceActionId) {
      this.setData({ serviceActionConfirming: false, serviceActionGuide: null, serviceActionId: "" });
      return;
    }
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
    const guide = serviceActions.guideFor(item);
    if (!guide) {
      wx.showToast({ title: "暂未收录这项服务的操作指引", icon: "none" });
      return;
    }
    this.setData({ serviceActionConfirming: false, serviceActionGuide: guide, serviceActionId: id });
  },

  copyServiceAction() {
    const guide = this.data.serviceActionGuide;
    if (!guide) return;
    wx.setClipboardData({
      data: guide.copyText,
      success: () => this.setData({ serviceActionConfirming: true }),
    });
  },

  confirmServiceAction(event) {
    const result = event.currentTarget.dataset.result;
    const item = (this._subscriptions || []).find((entry) => entry._id === this.data.serviceActionId);
    if (!item) return;
    if (result === "none") {
      this.setData({ serviceActionConfirming: false, serviceActionGuide: null, serviceActionId: "" });
      wx.showToast({ title: "订阅状态未改变", icon: "none" });
      return;
    }
    this.setData({ serviceActionConfirming: false, serviceActionGuide: null, serviceActionId: "" });
    this.runServiceTask(item, result === "renew" ? "renew" : "cancel", 0);
  },

  toggleRecentActions() {
    const recentActionsExpanded = !this.data.recentActionsExpanded;
    this.setData({
      recentActionsExpanded,
      recentActionItems: recentActionsExpanded ? (this._recentActionItems || []) : [],
    });
  },

  filterServiceCenter(event) {
    const selectedTone = event.currentTarget.dataset.tone;
    const serviceFilter = this.data.serviceFilter === selectedTone ? "" : selectedTone;
    const serviceItems = this._serviceItems || [];
    this.setData({
      serviceCenterExpanded: true,
      serviceFilter,
      serviceItems: serviceFilter ? serviceItems.filter((item) => item.tone === serviceFilter) : serviceItems,
    });
  },

  openServiceTask(event) {
    const id = event.currentTarget.dataset.id;
    const item = (this._subscriptions || []).find((entry) => entry._id === id);
    const actions = serviceTaskActions(item);
    if (!item || !actions.labels.length || this.data.actionBusy) return;
    if (item.status === "pending_confirmation") {
      this.startRenewalFlow(item._id);
      return;
    }
    wx.showActionSheet({
      itemList: actions.labels,
      success: ({ tapIndex }) => {
        const action = actions.operations[tapIndex];
        if (!action) return;
        if (action === "edit") {
          getApp().globalData.pendingSubscriptionEdit = Object.assign({}, item);
          wx.switchTab({ url: "/pages/add/add" });
          return;
        }
        if (action === "reminder") {
          this.enableSubscriptionReminder(item._id);
          return;
        }
        const [operation, days] = action.split(":");
        this.confirmServiceTask(item, operation, Number(days || 0));
      },
    });
  },

  confirmServiceTask(item, operation, snoozeDays) {
    if (operation === "delete") {
      wx.showModal({
        title: `永久删除 ${item.name}？`,
        content: "删除后无法恢复，订阅记录和自定义图标也会一并清除。",
        confirmText: "永久删除",
        confirmColor: "#B44335",
        success: ({ confirm }) => {
          if (confirm) this.runServiceTask(item, operation, snoozeDays);
        },
      });
      return;
    }
    if (operation === "snooze") {
      this.runServiceTask(item, operation, snoozeDays);
      return;
    }
    const copy = utils.subscriptionOperationCopy(operation, item);
    if (!copy) return;
    wx.showModal({
      title: copy.title,
      content: copy.content,
      confirmColor: copy.confirmColor,
      confirmText: copy.confirmText,
      success: ({ confirm }) => {
        if (confirm) this.runServiceTask(item, operation, snoozeDays);
      },
    });
  },

  runServiceTask(item, operation, snoozeDays) {
    if (this.data.actionBusy) return;
    this.setData({ actionBusy: true });
    wx.showLoading({ title: "处理中", mask: true });
    const needsReminder = operation === "renew" && !item.reminderEnabled;
    const authorization = needsReminder
      ? reminders.request()
      : Promise.resolve({ enabled: Boolean(item.reminderEnabled) });
    const request = operation === "delete"
      ? service.remove(item._id)
      : authorization.then(({ enabled }) => service.updateStatus(
        item._id,
        operation,
        operation === "renew" && enabled,
        snoozeDays,
        { expectedNextChargeDate: item.nextChargeDate },
      ));
    request.then(() => service.list()).then((items) => {
      this.applySubscriptions(items);
      const text = operation === "renew" ? "续费日已顺延"
        : operation === "cancel" ? "已记录取消"
          : operation === "pause" ? "订阅已暂停"
            : operation === "restore" ? "订阅已恢复"
              : operation === "delete" ? "订阅已删除"
                : `已延后 ${snoozeDays} 天`;
      wx.showToast({ title: text, icon: "none" });
    }).catch((error) => {
      wx.showModal({ title: "操作失败", content: error.message || "请稍后再试", showCancel: false });
    }).finally(() => {
      this.setData({ actionBusy: false });
      wx.hideLoading();
    });
  },

  applyUser(user) {
    const avatarFileId = user.avatarFileId || "";
    const localPreview = this.data.selectedAvatarPath || "";
    const currentPreview = this.data.avatarFileId === avatarFileId ? this.data.avatarUrl : "";
    const cachedPreview = avatarFileId === avatarTempFileId ? avatarTempUrl : "";
    this.setData({
      avatarFileId,
      avatarUrl: localPreview || cachedPreview || currentPreview || (avatarFileId.startsWith("cloud://") ? "" : avatarFileId),
      identityReady: Boolean(user),
      nickname: user.nickname || "",
      profileComplete: Boolean(user.profileComplete),
      selectedAvatarPath: "",
    });
    if (avatarFileId.startsWith("cloud://")) {
      resolveAvatar(avatarFileId).then((url) => {
        if (url && this.data.avatarFileId === avatarFileId && this.data.avatarUrl !== url) {
          this.setData({ avatarUrl: url });
        }
      });
    }
  },

  chooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ avatarUrl, selectedAvatarPath: avatarUrl }, () => {
      if (this.data.profileComplete && this.data.nickname) this.saveProfile(this.data.nickname);
    });
  },

  authorizeWithNickname(event) {
    const nickname = String((event.detail && event.detail.value) || "").trim();
    if (!nickname) return;
    this.setData({ nickname });
    this.saveProfile(nickname);
  },

  saveProfile(nicknameValue) {
    if (this.data.savingProfile) return;
    const wasComplete = this.data.profileComplete;
    const nickname = String(nicknameValue || this.data.nickname || "").trim();
    if (!nickname) return wx.showToast({ title: "请填写微信昵称", icon: "none" });

    let uploadedAvatarFileId = "";
    this.setData({ savingProfile: true });
    wx.showLoading({ title: "正在保存", mask: true });
    getApp().ensureLogin().then(() => this.uploadAvatarIfNeeded()).then(({ fileId, uploaded }) => {
      if (uploaded) uploadedAvatarFileId = fileId;
      return wx.cloud.callFunction({
        name: "subscriptionService",
        data: { action: "saveProfile", profile: { nickname, avatarFileId: fileId } },
      });
    }).then(({ result }) => {
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "资料保存失败");
      getApp().updateUser(result.user);
      service.invalidate();
      this.applyAccountSession(result.user);
      wx.showToast({ title: wasComplete ? "资料已更新" : "资料已保存" });
    }).catch((error) => {
      if (uploadedAvatarFileId) {
        wx.cloud.deleteFile({ fileList: [uploadedAvatarFileId] }).catch(() => {});
      }
      wx.showModal({ title: "登录失败", content: error.message || "请稍后重试", showCancel: false });
    }).finally(() => {
      this.setData({ savingProfile: false });
      wx.hideLoading();
    });
  },

  uploadAvatarIfNeeded() {
    if (!this.data.selectedAvatarPath) {
      return Promise.resolve({ fileId: this.data.avatarFileId, uploaded: false });
    }
    const match = this.data.selectedAvatarPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const extension = match ? match[1].toLowerCase() : "jpg";
    const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
    return service.avatarUploadConfig().then((pathPrefix) => {
      if (!/^avatars\/[a-f0-9]{24}$/.test(pathPrefix)) throw new Error("头像上传配置无效");
      const cloudPath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExtension}`;
      return wx.cloud.uploadFile({ cloudPath, filePath: this.data.selectedAvatarPath });
    })
      .then(({ fileID }) => {
        if (!fileID) throw new Error("头像上传失败");
        return { fileId: fileID, uploaded: true };
      });
  },

  showAccountStat(event) {
    const type = event.currentTarget.dataset.stat;
    const subscriptions = this._subscriptions || [];
    if (this.data.expandedStat === type) {
      this.setData({
        expandedStat: "",
        statDetailCopy: "",
        statDetailItems: [],
        statDetailTitle: "",
        statDetailValue: "",
      });
      return;
    }
    this.setData(Object.assign({ expandedStat: type }, accountStatDetail(type, subscriptions)));
  },

  manageHistorySubscription(event) {
    if (this.data.actionBusy) return;
    const { id, operation } = event.currentTarget.dataset;
    const item = (this._subscriptions || []).find((entry) => entry._id === id && entry.status === "archived");
    if (!item || !["restore", "delete"].includes(operation)) return;
    const deleting = operation === "delete";
    wx.showModal({
      title: deleting ? `永久删除 ${item.name}？` : `恢复 ${item.name}？`,
      content: deleting
        ? "删除后无法恢复，订阅记录和自定义图标也会一并清除。"
        : "恢复后会重新计入总览、续费日历和消费分析。",
      confirmText: deleting ? "永久删除" : "恢复订阅",
      confirmColor: deleting ? "#B44335" : "#276553",
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ actionBusy: true });
        const request = deleting ? service.remove(id) : service.updateStatus(id, "restore");
        request.then(() => service.list()).then((items) => {
          this.applySubscriptions(items);
          wx.showToast({ title: deleting ? "历史记录已删除" : "订阅已恢复", icon: "none" });
        }).catch((error) => {
          wx.showModal({ title: "操作失败", content: error.message || "请稍后再试", showCancel: false });
        }).finally(() => this.setData({ actionBusy: false }));
      },
    });
  },

  authorizeReminder(event) {
    this.enableSubscriptionReminder(event.currentTarget.dataset.id);
  },

  enableSubscriptionReminder(id) {
    if (!id || this.data.actionBusy) return;
    let loadingShown = false;
    this.setData({ actionBusy: true });
    reminders.request().then(({ enabled, reason }) => {
      if (!enabled) {
        const title = reason === "unconfigured" ? "提醒模板尚未配置" : reason === "failed" ? "暂时无法申请授权" : "尚未获得微信提醒授权";
        wx.showToast({ title, icon: "none" });
        return null;
      }
      loadingShown = true;
      wx.showLoading({ title: "正在开启", mask: true });
      return service.enableReminder(id).then(() => service.list()).then((items) => {
        this.applySubscriptions(items);
        wx.showToast({ title: "提醒已开启" });
      });
    }).catch((error) => {
      wx.showModal({ title: "开启失败", content: error.message || "请稍后再试", showCancel: false });
    }).finally(() => {
      if (loadingShown) wx.hideLoading();
      this.setData({ actionBusy: false });
    });
  },

  exportReport(event) {
    if (this.data.exporting) return;
    const type = event.currentTarget.dataset.report;
    const report = getExportService().buildReport(type, this._subscriptions || []);
    wx.showActionSheet({
      itemList: ["生成报告图片", "导出 CSV 文件"],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.exportReportImages(report);
        if (tapIndex === 1) this.exportReportCsv(report);
      },
    });
  },

  exportReportCsv(report) {
    this.setData({ exporting: true });
    wx.showLoading({ title: "正在导出", mask: true });
    getExportService().writeCsv(report).then((filePath) => {
      wx.hideLoading();
      if (typeof wx.shareFileMessage === "function") {
        wx.shareFileMessage({
          fileName: report.fileName,
          filePath,
          fail: (error) => {
            if (!String(error.errMsg || "").includes("cancel")) {
              wx.setClipboardData({ data: report.csv, success: () => wx.showToast({ title: "CSV 已复制" }) });
            }
          },
        });
        return;
      }
      wx.setClipboardData({
        data: report.csv,
        success: () => wx.showToast({ title: "CSV 已复制" }),
      });
    }).catch((error) => {
      wx.hideLoading();
      wx.showModal({ title: "导出失败", content: error.errMsg || error.message || "请稍后再试", showCancel: false });
    }).finally(() => {
      this.setData({ exporting: false });
    });
  },

  exportReportImages(report) {
    wx.showLoading({ title: "生成图片中", mask: true });
    // 画布只在导出期间挂载，必须等这次 setData 渲染完成后再查询节点。
    new Promise((resolve) => this.setData({ exporting: true }, resolve))
      .then(() => getExportService().createImages(this, report))
      .then((paths) => {
        wx.hideLoading();
        wx.previewImage({
          current: paths[0],
          urls: paths,
          success: () => wx.showToast({ title: paths.length > 1 ? `共 ${paths.length} 张` : "长按图片可保存", icon: "none" }),
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showModal({ title: "图片生成失败", content: error.errMsg || error.message || "请稍后再试", showCancel: false });
      })
      .finally(() => {
        this.setData({ exporting: false });
      });
  },

  clearCache() {
    if (this.data.clearingCache) return;
    service.invalidate();
    avatarTempFileId = "";
    avatarTempUrl = "";
    avatarTempRequest = null;
    this.setData({ clearingCache: true });
    wx.showLoading({ title: "正在刷新", mask: true });
    Promise.all([
      getApp().refreshLogin({ force: true }),
      service.list({ force: true }),
    ]).then(([user, items]) => {
      this._userSource = user;
      this.applyUser(user);
      this.applySubscriptions(items);
      wx.showToast({ title: "缓存已清除" });
    }).catch((error) => {
      wx.showModal({
        title: "缓存已清除",
        content: `云端数据暂时未刷新：${error.message || "请稍后重试"}`,
        showCancel: false,
      });
    }).finally(() => {
      wx.hideLoading();
      this.setData({ clearingCache: false });
    });
  },

  clearAll() {
    if (!this.data.exportTotalCount) return wx.showToast({ title: "当前没有订阅数据", icon: "none" });
    wx.showModal({
      title: "清空全部数据？",
      content: "这会永久删除当前微信账号下的所有订阅，且无法恢复。",
      confirmColor: "#b05243",
      success: ({ confirm }) => {
        if (!confirm) return;
        wx.showLoading({ title: "正在清空", mask: true });
        service.clearAll().then(() => {
          this._subscriptions = [];
          this.setData(emptySubscriptionData());
          return getApp().refreshLogin({ force: true }).then((user) => {
            this._userSource = user;
            this.applyUser(user);
          }).catch(() => {});
        }).then(() => {
          wx.showToast({ title: "数据已清空" });
        }).catch((error) => wx.showModal({ title: "清空失败", content: error.message, showCancel: false }))
          .finally(() => wx.hideLoading());
      },
    });
  },

  onShareAppMessage() { return sharing.appMessage(); },

  onShareTimeline() { return sharing.timeline(); },
});
