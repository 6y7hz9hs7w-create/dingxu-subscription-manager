/* eslint-disable @typescript-eslint/no-require-imports */
/* global Page, getApp, wx */
const service = require("../../services/subscriptions");
const reminders = require("../../services/reminders");
const pageData = require("../../services/pageData");
const catalog = require("../../utils/serviceCatalog");
const sharing = require("../../utils/sharing");
const utils = require("../../utils/subscriptions");

const categories = ["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"];
const paymentChannels = ["微信支付", "支付宝", "Apple 订阅", "其他渠道"];
const paymentChannelValues = ["wechat", "alipay", "apple", "other"];
const DEFAULT_COLOR = "#FFE46B";
const iconSearchCache = new Map();
const ICON_SEARCH_CACHE_LIMIT = 6;
const presetColors = [
  "#FFE46B",
  "#FF9F43",
  "#FF6B6B",
  "#F78FB3",
  "#A55EEA",
  "#5F6AF8",
  "#45AAF2",
  "#2BCBBA",
  "#26A65B",
  "#A3CB38",
  "#8D7866",
  "#CAD3C8",
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function componentToHex(value) {
  return Math.round(value * 255).toString(16).padStart(2, "0").toUpperCase();
}

function hsvToHex(hue, saturation, brightness) {
  const normalizedHue = ((Number(hue) % 360) + 360) % 360;
  const chroma = brightness * saturation;
  const section = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (section < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, secondary];
  else if (section < 4) [red, green, blue] = [0, secondary, chroma];
  else if (section < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];
  const offset = brightness - chroma;
  return `#${componentToHex(red + offset)}${componentToHex(green + offset)}${componentToHex(blue + offset)}`;
}

function hexToHsv(color) {
  const normalized = /^#[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_COLOR;
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return {
    brightness: max,
    color: normalized,
    hue: hue < 0 ? hue + 360 : hue,
    saturation: max ? delta / max : 0,
  };
}

function colorPickerState(color) {
  const value = hexToHsv(color);
  return {
    colorBrightness: value.brightness,
    colorCursorStyle: `left:${Math.round(value.saturation * 1000) / 10}%;top:${Math.round((1 - value.brightness) * 1000) / 10}%`,
    colorHue: value.hue,
    colorSaturation: value.saturation,
    hueColor: hsvToHex(value.hue, 1, 1),
    hueCursorStyle: `left:${Math.round(value.hue / 3.6 * 10) / 10}%`,
    selectedColor: value.color,
  };
}

function defaultNextChargeDate() {
  return utils.dateKey(utils.addBillingPeriod(new Date(), "monthly"));
}

function amountInputValue(amountCents) {
  const amount = Number(amountCents || 0) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function exchangeRateText(rate) {
  const value = Number(rate || 0);
  return value > 0 ? value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : "";
}

function exchangeRateDateText(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[2])}月${Number(match[3])}日更新` : "";
}

function convertedAmountText(amount, rate) {
  const sourceAmount = Number(amount);
  const exchangeRate = Number(rate);
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0 || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return "";
  }
  return (Math.round(sourceAmount * exchangeRate * 100) / 100).toFixed(2);
}

function exchangeRateState(quote, amount) {
  const rate = Number(quote && quote.rate || 0);
  const date = String(quote && quote.updatedAt || "").slice(0, 10);
  return {
    convertedAmountText: convertedAmountText(amount, rate),
    exchangeRate: rate,
    exchangeRateDate: date,
    exchangeRateDateText: exchangeRateDateText(date),
    exchangeRateError: "",
    exchangeRateLoading: false,
    exchangeRateText: exchangeRateText(rate),
  };
}

function imageExtension(path) {
  const match = String(path || "").match(/\.([a-z0-9]+)(?:\?|$)/i);
  const extension = match ? match[1].toLowerCase() : "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
}

function isAutoMatchedIconFileId(fileId) {
  return /\/matched-\d+-\d+\.(?:jpe?g|png|webp)(?:\?|$)/i.test(String(fileId || ""));
}

function cacheIconSearch(query, candidates) {
  if (iconSearchCache.has(query)) iconSearchCache.delete(query);
  iconSearchCache.set(query, candidates);
  if (iconSearchCache.size > ICON_SEARCH_CACHE_LIMIT) {
    iconSearchCache.delete(iconSearchCache.keys().next().value);
  }
}

function editFormState(item) {
  const categoryIndex = Math.max(0, categories.indexOf(item.category));
  const serviceLogoPath = catalog.logoForService(item.name);
  const reminderIndex = [1, 3, 5, 7].indexOf(Number(item.reminderDays));
  const currencyIndex = item.currency === "USD" ? 1 : 0;
  const sourceAmountCents = currencyIndex === 1
    ? Number(item.sourceAmountCents || 0)
    : Number(item.amountCents || 0);
  const exchangeRate = currencyIndex === 1 ? Number(item.exchangeRate || 0) : 0;
  const paymentIndex = Math.max(0, paymentChannelValues.indexOf(item.paymentChannel || "other"));
  return {
    amount: amountInputValue(sourceAmountCents),
    billingIndex: item.billingCycle === "yearly" ? 1 : 0,
    categoryIndex,
    convertedAmountText: currencyIndex === 1
      ? convertedAmountText(sourceAmountCents / 100, exchangeRate)
      : "",
    currencyIndex,
    customService: !serviceLogoPath,
    customIconFileId: item.iconFileId || "",
    customIconLocalPath: "",
    customIconPreviewPath: item.iconFileId || "",
    editingId: item._id,
    editingCurrency: currencyIndex === 1 ? "USD" : "CNY",
    editingReminderEnabled: Boolean(item.reminderEnabled),
    editingSourceAmountCents: sourceAmountCents,
    exchangeRate,
    exchangeRateDate: item.exchangeRateDate || "",
    exchangeRateDateText: exchangeRateDateText(item.exchangeRateDate),
    exchangeRateError: "",
    exchangeRateLoading: false,
    exchangeRateText: exchangeRateText(exchangeRate),
    iconApplying: false,
    iconCandidates: [],
    iconSearchFailed: false,
    iconSearchMessage: "",
    iconSearching: false,
    matchedIconName: "",
    nextChargeDate: item.nextChargeDate,
    note: item.note || "",
    pendingMatchedIconFileId: "",
    paymentIndex,
    reminderIndex: reminderIndex < 0 ? 1 : reminderIndex,
    serviceLogoPath,
    serviceName: item.name,
    serviceOptions: catalog.servicesForCategory(categories[categoryIndex]),
    showColorPalette: false,
    ...colorPickerState(item.color || DEFAULT_COLOR),
  };
}

Page({
  data: {
    amount: "",
    billingCycles: ["每月", "每年"],
    billingIndex: 0,
    categories,
    categoryIndex: 0,
    convertedAmountText: "",
    currencies: ["人民币 CNY", "美元 USD"],
    currencyIndex: 0,
    currencySymbols: ["¥", "$"],
    presetColors,
    customService: false,
    customIconFileId: "",
    customIconLocalPath: "",
    customIconPreviewPath: "",
    editingId: "",
    editingCurrency: "",
    editingReminderEnabled: false,
    editingSourceAmountCents: 0,
    exchangeRate: 0,
    exchangeRateDate: "",
    exchangeRateDateText: "",
    exchangeRateError: "",
    exchangeRateLoading: false,
    exchangeRateText: "",
    iconApplying: false,
    iconCandidates: [],
    iconSearchFailed: false,
    iconSearchMessage: "",
    iconSearching: false,
    matchedIconName: "",
    nextChargeDate: "",
    note: "",
    pendingMatchedIconFileId: "",
    paymentChannels,
    paymentIndex: 0,
    reminderDays: [1, 3, 5, 7],
    reminderIndex: 1,
    reminderAvailable: false,
    showColorPalette: false,
    ...colorPickerState(DEFAULT_COLOR),
    serviceLogoPath: "",
    serviceName: "",
    serviceOptions: catalog.servicesForCategory(categories[0]),
    submitting: false,
  },

  onLoad() {
    this.setData({ nextChargeDate: defaultNextChargeDate() });
    reminders.preload().then((templateId) => {
      this.setData({ reminderAvailable: Boolean(templateId) });
    });
  },

  onShow() {
    sharing.enable();
    pageData.selectTab(this, 2);
    pageData.requireAccount(this, { redirectOnRequired: true }).then((allowed) => {
      if (!allowed) return;
      const app = getApp();
      const pendingEdit = app.globalData.pendingSubscriptionEdit;
      if (pendingEdit) {
        app.globalData.pendingSubscriptionEdit = null;
        this.setData(editFormState(pendingEdit));
      }
      this.preloadExchangeRate();
    }).catch(() => {});
  },

  onUnload() {
    clearTimeout(this._iconSearchTimer);
    clearTimeout(this._colorUpdateTimer);
    this._exchangeRateSequence = Number(this._exchangeRateSequence || 0) + 1;
    this._pendingColorState = null;
    this.cleanupPendingMatchedIcon();
  },

  preloadExchangeRate() {
    const cachedQuote = service.peekExchangeRate();
    if (cachedQuote) {
      this._preloadedUsdQuote = cachedQuote;
      return Promise.resolve(cachedQuote);
    }
    if (this._exchangeRatePreload) return this._exchangeRatePreload;
    this._exchangeRatePreload = service.exchangeRate().then((quote) => {
      this._preloadedUsdQuote = quote;
      if (this.data.currencyIndex === 1 && !this.data.exchangeRate && !this.data.exchangeRateLoading) {
        this.setData(exchangeRateState(quote, this.data.amount));
      }
      return quote;
    }).catch(() => null).finally(() => {
      this._exchangeRatePreload = null;
    });
    return this._exchangeRatePreload;
  },

  toggleColorPalette() {
    this._colorPlaneRect = null;
    this._hueSliderRect = null;
    this.setData({ showColorPalette: !this.data.showColorPalette });
  },

  choosePresetColor(event) {
    this.flushColorState();
    this.setData(colorPickerState(event.currentTarget.dataset.color));
  },

  queueColorState(state) {
    this._pendingColorState = Object.assign(this._pendingColorState || {}, state);
    if (this._colorUpdateTimer) return;
    this._colorUpdateTimer = setTimeout(() => this.flushColorState(), 16);
  },

  flushColorState() {
    clearTimeout(this._colorUpdateTimer);
    this._colorUpdateTimer = null;
    if (!this._pendingColorState) return;
    const state = this._pendingColorState;
    this._pendingColorState = null;
    this.setData(state);
  },

  colorStateValue(key) {
    if (this._pendingColorState && this._pendingColorState[key] !== undefined) {
      return this._pendingColorState[key];
    }
    return this.data[key];
  },

  setColorFromPlane(clientX, clientY) {
    const rect = this._colorPlaneRect;
    if (!rect || !rect.width || !rect.height) return;
    const saturation = clamp((clientX - rect.left) / rect.width, 0, 1);
    const brightness = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    this.queueColorState({
      colorBrightness: brightness,
      colorCursorStyle: `left:${Math.round(saturation * 1000) / 10}%;top:${Math.round((1 - brightness) * 1000) / 10}%`,
      colorSaturation: saturation,
      selectedColor: hsvToHex(this.colorStateValue("colorHue"), saturation, brightness),
    });
  },

  startColorTouch(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    this.createSelectorQuery().select("#color-plane").boundingClientRect((rect) => {
      this._colorPlaneRect = rect;
      this.setColorFromPlane(point.x, point.y);
    }).exec();
  },

  moveColorTouch(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (touch) this.setColorFromPlane(touch.clientX, touch.clientY);
  },

  setHueFromPoint(clientX) {
    const rect = this._hueSliderRect;
    if (!rect || !rect.width) return;
    const hue = clamp((clientX - rect.left) / rect.width, 0, 1) * 359;
    this.queueColorState({
      colorHue: hue,
      hueColor: hsvToHex(hue, 1, 1),
      hueCursorStyle: `left:${Math.round(hue / 3.59 * 10) / 10}%`,
      selectedColor: hsvToHex(hue, this.colorStateValue("colorSaturation"), this.colorStateValue("colorBrightness")),
    });
  },

  startHueTouch(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return;
    const clientX = touch.clientX;
    this.createSelectorQuery().select("#hue-slider").boundingClientRect((rect) => {
      this._hueSliderRect = rect;
      this.setHueFromPoint(clientX);
    }).exec();
  },

  moveHueTouch(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (touch) this.setHueFromPoint(touch.clientX);
  },

  changeCategory(event) {
    clearTimeout(this._iconSearchTimer);
    const categoryIndex = Number(event.detail.value);
    this.setData({
      categoryIndex,
      iconCandidates: [],
      iconSearchFailed: false,
      iconSearchMessage: this.data.customService && this.data.serviceName ? "可联网匹配对应图标" : "",
      iconSearching: false,
      serviceOptions: catalog.servicesForCategory(this.data.categories[categoryIndex]),
    });
  },

  resetAutoMatchedIcon() {
    const pendingFileId = this.data.pendingMatchedIconFileId;
    const autoMatched = Boolean(
      this.data.matchedIconName
      || pendingFileId
      || isAutoMatchedIconFileId(this.data.customIconFileId),
    );
    if (!autoMatched) return {};
    if (pendingFileId) {
      wx.cloud.deleteFile({ fileList: [pendingFileId] }).catch(() => {});
    }
    return {
      customIconFileId: "",
      customIconLocalPath: "",
      customIconPreviewPath: "",
      matchedIconName: "",
      pendingMatchedIconFileId: "",
    };
  },

  chooseSuggestedService(event) {
    clearTimeout(this._iconSearchTimer);
    this._iconSearchSequence = Number(this._iconSearchSequence || 0) + 1;
    const serviceName = String(event.currentTarget.dataset.name || "");
    this.setData(Object.assign({
      customService: false,
      iconCandidates: [],
      iconSearchFailed: false,
      iconSearchMessage: "已匹配到内置服务图标",
      iconSearching: false,
      serviceLogoPath: catalog.logoForService(serviceName),
      serviceName,
    }, this.resetAutoMatchedIcon()));
  },

  changeServiceName(event) {
    const serviceName = event.detail.value;
    const normalizedName = serviceName.trim();
    const serviceLogoPath = catalog.logoForService(serviceName);
    const serviceChanged = String(this.data.serviceName || "").trim() !== normalizedName;
    const shouldSearch = !serviceLogoPath && normalizedName.length >= 2;
    if (!shouldSearch) {
      clearTimeout(this._iconSearchTimer);
      this._iconSearchSequence = Number(this._iconSearchSequence || 0) + 1;
    }
    this.setData(Object.assign({
      customService: Boolean(normalizedName && !serviceLogoPath),
      iconCandidates: [],
      iconSearchFailed: false,
      iconSearchMessage: serviceLogoPath ? "已匹配到内置服务图标" : shouldSearch ? "正在查找合适的图标…" : "继续输入即可自动匹配",
      iconSearching: shouldSearch,
      serviceLogoPath,
      serviceName,
    }, serviceChanged ? this.resetAutoMatchedIcon() : {}));
    if (shouldSearch) this.scheduleIconSearch(normalizedName, { skipSearchingState: true });
  },

  scheduleIconSearch(query, options) {
    clearTimeout(this._iconSearchTimer);
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery.length < 2) {
      if (!options || !options.skipSearchingState) this.setData({ iconSearching: false });
      return;
    }
    this._iconSearchSequence = Number(this._iconSearchSequence || 0) + 1;
    const sequence = this._iconSearchSequence;
    if (!options || !options.skipSearchingState) this.setData({ iconSearching: true });
    this._iconSearchTimer = setTimeout(() => {
      this.runIconSearch(normalizedQuery, sequence);
    }, 550);
  },

  applyIconSearchResult(query, sequence, candidates) {
    if (
      sequence !== this._iconSearchSequence
      || query !== String(this.data.serviceName || "").trim()
    ) return false;
    this.setData({
      iconCandidates: candidates,
      iconSearchFailed: false,
      iconSearchMessage: candidates.length ? "请选择最符合的图标" : "暂未找到匹配图标，可继续使用自定义图片",
      iconSearching: false,
    });
    return true;
  },

  runIconSearch(query, sequence, options) {
    const cachedCandidates = iconSearchCache.get(query);
    if (!(options && options.force) && Array.isArray(cachedCandidates)) {
      this.applyIconSearchResult(query, sequence, cachedCandidates);
      return Promise.resolve(cachedCandidates);
    }
    return service.searchIcons(query).then((candidates) => {
      cacheIconSearch(query, candidates);
      this.applyIconSearchResult(query, sequence, candidates);
      return candidates;
    }).catch(() => {
      if (
        sequence !== this._iconSearchSequence
        || query !== String(this.data.serviceName || "").trim()
      ) return [];
      this.setData({
        iconCandidates: [],
        iconSearchFailed: true,
        iconSearchMessage: "联网匹配暂不可用，可重试或选择本地图片",
        iconSearching: false,
      });
      return [];
    });
  },

  retryIconSearch() {
    const query = String(this.data.serviceName || "").trim();
    if (query.length < 2) {
      wx.showToast({ title: "请至少输入两个字", icon: "none" });
      return;
    }
    clearTimeout(this._iconSearchTimer);
    this._iconSearchSequence = Number(this._iconSearchSequence || 0) + 1;
    const sequence = this._iconSearchSequence;
    this.setData({
      iconCandidates: [],
      iconSearchFailed: false,
      iconSearchMessage: "正在重新匹配图标…",
      iconSearching: true,
    }, () => this.runIconSearch(query, sequence, { force: true }));
  },

  cleanupPendingMatchedIcon(exceptFileId) {
    const fileId = this.data.pendingMatchedIconFileId;
    if (!fileId || fileId === exceptFileId) return Promise.resolve();
    this.setData({ pendingMatchedIconFileId: "" });
    return wx.cloud.deleteFile({ fileList: [fileId] }).catch(() => {});
  },

  selectMatchedIcon(event) {
    if (this.data.iconApplying) return;
    const trackId = String(event.currentTarget.dataset.id || "");
    const candidate = this.data.iconCandidates.find((item) => item.id === trackId);
    if (!candidate) return;
    this.setData({ iconApplying: true });
    wx.showLoading({ title: "正在应用图标", mask: true });
    service.adoptMatchedIcon(trackId).then((fileId) => {
      if (!fileId) throw new Error("图标保存失败");
      return this.cleanupPendingMatchedIcon(fileId).then(() => {
        this.setData({
          customIconFileId: fileId,
          customIconLocalPath: "",
          customIconPreviewPath: fileId,
          iconCandidates: [],
          iconSearchFailed: false,
          iconSearchMessage: `已匹配：${candidate.name}`,
          matchedIconName: candidate.name,
          pendingMatchedIconFileId: fileId,
        });
      });
    }).catch((error) => {
      wx.showToast({ title: error.message || "图标应用失败", icon: "none" });
    }).finally(() => {
      wx.hideLoading();
      this.setData({ iconApplying: false });
    });
  },

  applySubscriptionIcon(result) {
    const file = result && result.tempFiles && result.tempFiles[0];
    const originalPath = String(
      (file && (file.tempFilePath || file.path))
      || (result && result.tempFilePaths && result.tempFilePaths[0])
      || "",
    );
    if (!originalPath) {
      wx.showToast({ title: "没有读取到图片", icon: "none" });
      return;
    }
    if (Number((file && file.size) || 0) > 5 * 1024 * 1024) {
      wx.showToast({ title: "图片不能超过 5MB", icon: "none" });
      return;
    }
    const applyIcon = (path) => {
      this.cleanupPendingMatchedIcon();
      this.setData({
        customIconFileId: "",
        customIconLocalPath: path,
        customIconPreviewPath: path,
        iconCandidates: [],
        iconSearchFailed: false,
        iconSearchMessage: "已选择本地图片",
        matchedIconName: "",
      });
    };
    if (typeof wx.cropImage !== "function") {
      applyIcon(originalPath);
      return;
    }
    wx.cropImage({
      src: originalPath,
      cropScale: "1:1",
      success: ({ tempFilePath }) => applyIcon(tempFilePath || originalPath),
      fail: () => applyIcon(originalPath),
    });
  },

  handleSubscriptionIconPickerError(error) {
    const message = String(error && error.errMsg || "");
    if (/cancel/i.test(message)) return;
    console.warn("subscription icon picker failed", error);
    const privacyBlocked = /privacy|permission|authorize|scope|隐私|权限/i.test(message);
    wx.showModal({
      title: "暂时无法选择图片",
      content: privacyBlocked
        ? "请先在小程序隐私保护指引中声明“选中的照片或视频”，并允许微信访问照片后重试。"
        : "请检查微信的照片权限后重试，也可以使用真机预览选择图片。",
      showCancel: false,
    });
  },

  openSubscriptionIconPicker() {
    const success = (result) => this.applySubscriptionIcon(result);
    const fail = (error) => this.handleSubscriptionIconPickerError(error);

    // chooseImage 在旧版基础库和开发者工具中兼容性更好，真机端也只会展示图片。
    if (typeof wx.chooseImage === "function") {
      wx.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album"],
        success,
        fail,
      });
      return;
    }
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        success,
        fail,
      });
      return;
    }
    fail({ errMsg: "image picker is unavailable" });
  },

  requestSubscriptionIconPrivacy() {
    if (
      typeof wx.getPrivacySetting !== "function"
      || typeof wx.requirePrivacyAuthorize !== "function"
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      wx.getPrivacySetting({
        success: ({ needAuthorization }) => {
          if (!needAuthorization) {
            resolve();
            return;
          }
          wx.requirePrivacyAuthorize({
            success: resolve,
            fail: reject,
          });
        },
        // 老基础库查询失败时，继续交由图片接口自身处理并返回明确错误。
        fail: resolve,
      });
    });
  },

  chooseSubscriptionIcon() {
    this.requestSubscriptionIconPrivacy()
      .then(() => this.openSubscriptionIconPicker())
      .catch((error) => this.handleSubscriptionIconPickerError(error));
  },

  removeSubscriptionIcon() {
    this.cleanupPendingMatchedIcon();
    this.setData({
      customIconFileId: "",
      customIconLocalPath: "",
      customIconPreviewPath: "",
      iconSearchMessage: this.data.customService && this.data.serviceName
        ? "可重新联网匹配或选择本地图片"
        : "",
      matchedIconName: "",
    });
  },

  uploadSubscriptionIcon() {
    const localPath = this.data.customIconLocalPath;
    if (!localPath) {
      return Promise.resolve({
        fileId: this.data.customIconFileId || "",
        uploaded: false,
      });
    }
    return service.subscriptionIconUploadConfig().then((pathPrefix) => {
      if (!pathPrefix) throw new Error("暂时无法上传图标");
      const cloudPath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageExtension(localPath)}`;
      return wx.cloud.uploadFile({ cloudPath, filePath: localPath });
    }).then(({ fileID }) => {
      if (!fileID) throw new Error("图标上传失败");
      return { fileId: fileID, uploaded: true };
    });
  },

  changeAmount(event) {
    const amount = event.detail.value;
    this.setData({
      amount,
      convertedAmountText: this.data.currencyIndex === 1
        ? convertedAmountText(amount, this.data.exchangeRate)
        : "",
    });
  },
  changeCurrency(event) {
    const currencyIndex = Number(event.currentTarget.dataset.index);
    if (![0, 1].includes(currencyIndex) || currencyIndex === this.data.currencyIndex) return;
    this._exchangeRateSequence = Number(this._exchangeRateSequence || 0) + 1;
    const sequence = this._exchangeRateSequence;
    const cachedQuote = currencyIndex === 1
      ? this._preloadedUsdQuote || service.peekExchangeRate()
      : null;
    const nextState = {
      amount: "",
      convertedAmountText: "",
      currencyIndex,
      exchangeRate: 0,
      exchangeRateDate: "",
      exchangeRateDateText: "",
      exchangeRateError: "",
      exchangeRateLoading: currencyIndex === 1 && !cachedQuote,
      exchangeRateText: "",
    };
    this.setData(cachedQuote
      ? Object.assign(nextState, exchangeRateState(cachedQuote, ""))
      : nextState);
    if (currencyIndex === 1 && !cachedQuote) {
      this.loadExchangeRate({ loadingStarted: true, sequence });
    }
  },
  retryExchangeRate() {
    this._exchangeRateSequence = Number(this._exchangeRateSequence || 0) + 1;
    this.loadExchangeRate({ force: true, sequence: this._exchangeRateSequence });
  },
  loadExchangeRate(options) {
    const settings = options || {};
    if (this.data.exchangeRateLoading && !settings.loadingStarted) return Promise.resolve(null);
    const sequence = Number(settings.sequence || 0) || (Number(this._exchangeRateSequence || 0) + 1);
    this._exchangeRateSequence = sequence;
    if (!settings.loadingStarted) {
      this.setData({ exchangeRateError: "", exchangeRateLoading: true });
    }
    return service.exchangeRate({ force: Boolean(settings.force) }).then((quote) => {
      if (!Number.isFinite(quote.rate) || quote.rate <= 0) throw new Error("汇率数据无效");
      this._preloadedUsdQuote = quote;
      if (sequence !== this._exchangeRateSequence || this.data.currencyIndex !== 1) return quote;
      this.setData(exchangeRateState(quote, this.data.amount));
      return quote;
    }).catch((error) => {
      if (sequence !== this._exchangeRateSequence || this.data.currencyIndex !== 1) return null;
      this.setData({
        convertedAmountText: "",
        exchangeRate: 0,
        exchangeRateDate: "",
        exchangeRateDateText: "",
        exchangeRateError: error.message || "暂时无法获取汇率",
        exchangeRateLoading: false,
        exchangeRateText: "",
      });
      return null;
    }).finally(() => {
      if (
        sequence === this._exchangeRateSequence
        && this.data.currencyIndex === 1
        && this.data.exchangeRateLoading
      ) this.setData({ exchangeRateLoading: false });
    });
  },
  changeBilling(event) { this.setData({ billingIndex: Number(event.detail.value) }); },
  changePaymentChannel(event) { this.setData({ paymentIndex: Number(event.detail.value) }); },
  changeReminder(event) { this.setData({ reminderIndex: Number(event.detail.value) }); },
  changeDate(event) { this.setData({ nextChargeDate: event.detail.value }); },
  changeNote(event) { this.setData({ note: event.detail.value }); },

  resetForm(options) {
    const keepMatchedIcon = Boolean(options && options.keepMatchedIcon);
    clearTimeout(this._iconSearchTimer);
    this._iconSearchSequence = Number(this._iconSearchSequence || 0) + 1;
    if (!keepMatchedIcon) this.cleanupPendingMatchedIcon();
    this.setData({
      amount: "",
      billingIndex: 0,
      categoryIndex: 0,
      convertedAmountText: "",
      currencyIndex: 0,
      customService: false,
      customIconFileId: "",
      customIconLocalPath: "",
      customIconPreviewPath: "",
      editingId: "",
      editingCurrency: "",
      editingReminderEnabled: false,
      editingSourceAmountCents: 0,
      exchangeRate: 0,
      exchangeRateDate: "",
      exchangeRateDateText: "",
      exchangeRateError: "",
      exchangeRateLoading: false,
      exchangeRateText: "",
      iconApplying: false,
      iconCandidates: [],
      iconSearchFailed: false,
      iconSearchMessage: "",
      iconSearching: false,
      matchedIconName: "",
      nextChargeDate: defaultNextChargeDate(),
      note: "",
      pendingMatchedIconFileId: "",
      paymentIndex: 0,
      reminderIndex: 1,
      showColorPalette: false,
      serviceLogoPath: "",
      serviceName: "",
      serviceOptions: catalog.servicesForCategory(categories[0]),
      ...colorPickerState(DEFAULT_COLOR),
    });
  },

  cancelEdit() {
    this.resetForm();
    wx.switchTab({ url: "/pages/index/index" });
  },

  submit(event) {
    if (this.data.submitting) return;
    pageData.requireAccount(this, { redirectOnRequired: true }).then((allowed) => {
      if (allowed) this.submitAuthorized(event);
    }).catch(() => {});
  },

  submitAuthorized(event) {
    const values = event.detail.value;
    const amount = Number(values.amount);
    const serviceName = String(this.data.serviceName || "").trim();
    if (!serviceName) return wx.showToast({ title: "请选择或填写服务名称", icon: "none" });
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: "请填写有效金额", icon: "none" });

    const editing = Boolean(this.data.editingId);
    let uploadedIconFileId = "";
    this.setData({ submitting: true });
    const sourceAmountCents = Math.round(amount * 100);
    const authorization = editing
      ? Promise.resolve({ enabled: this.data.editingReminderEnabled })
      : reminders.request();
    const currency = this.data.currencyIndex === 1 ? "USD" : "CNY";
    const keepStoredRate = Boolean(
      editing
      && currency === "USD"
      && this.data.editingCurrency === "USD"
      && sourceAmountCents === Number(this.data.editingSourceAmountCents)
      && Number(this.data.exchangeRate) > 0
    );
    const quoteRequest = keepStoredRate
      ? Promise.resolve({
        rate: Number(this.data.exchangeRate),
        updatedAt: this.data.exchangeRateDate,
      })
      : currency === "USD"
      ? service.exchangeRate().then((quote) => {
        if (!Number.isFinite(quote.rate) || quote.rate <= 0) throw new Error("美元汇率数据无效");
        return quote;
      })
      : Promise.resolve({ rate: 1, updatedAt: "" });
    Promise.all([authorization, quoteRequest]).then(([{ enabled }, quote]) => {
      wx.showLoading({ title: editing ? "正在保存" : "正在添加", mask: true });
      return this.uploadSubscriptionIcon().then(({ fileId, uploaded }) => {
        if (uploaded) uploadedIconFileId = fileId;
        const input = {
          amountCents: currency === "USD"
            ? Math.round(sourceAmountCents * quote.rate)
            : sourceAmountCents,
          billingCycle: this.data.billingIndex === 1 ? "yearly" : "monthly",
          category: this.data.categories[this.data.categoryIndex],
          color: this.data.selectedColor,
          currency,
          exchangeRate: quote.rate,
          exchangeRateDate: String(quote.updatedAt || "").slice(0, 10),
          iconFileId: fileId,
          name: serviceName,
          nextChargeDate: this.data.nextChargeDate,
          note: String(values.note || "").trim(),
          paymentChannel: paymentChannelValues[this.data.paymentIndex] || "other",
          reminderDays: this.data.reminderDays[this.data.reminderIndex],
          reminderEnabled: enabled,
          sourceAmountCents,
        };
        return editing
          ? service.update(this.data.editingId, input)
          : service.add(input);
      }).then(() => {
        wx.showToast({
          title: editing ? "修改已保存" : enabled ? "微信提醒已开启" : "订阅已添加",
        });
        wx.switchTab({
          url: "/pages/index/index",
          complete: () => this.resetForm({ keepMatchedIcon: true }),
        });
      });
    }).catch((error) => {
      if (uploadedIconFileId) {
        wx.cloud.deleteFile({ fileList: [uploadedIconFileId] }).catch(() => {});
      }
      return wx.showModal({
        title: editing ? "保存失败" : "添加失败",
        content: error.message,
        showCancel: false,
      });
    })
      .finally(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
      });
  },

  onShareAppMessage() { return sharing.appMessage(); },

  onShareTimeline() { return sharing.timeline(); },
});
