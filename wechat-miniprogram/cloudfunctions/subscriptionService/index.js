/* eslint-disable @typescript-eslint/no-require-imports */
const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const subscriptions = db.collection("subscriptions");
const PROFILE_RECORD_TYPE = "profile";
const SUBSCRIPTION_RECORD_TYPE = "subscription";
const WEB_BINDING_RECORD_TYPE = "web_binding";
const WEB_SESSION_RECORD_TYPE = "web_session";
const MAX_SUBSCRIPTIONS = 100;
const WEB_BINDING_TTL_MS = 10 * 60 * 1000;
const WEB_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// 在小程序后台申请“续费提醒”订阅消息模板后填写。模板 ID 不是密钥，可以随代码部署。
const RENEWAL_TEMPLATE_ID = "Ow01SaqWnK-8zdsA9-PxYXcMD4zMP58zZ5QhFvrCu3k";
// 模板 5171“会员到期提醒”只包含到期时间和到期说明。
const RENEWAL_TEMPLATE_FIELDS = {
  time: "time1",
  description: "thing2",
};

const DEFAULT_COLOR = "#FFE46B";
const CATEGORIES = new Set(["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"]);
const PAYMENT_CHANNELS = new Set(["wechat", "alipay", "apple", "other"]);
const ICON_SEARCH_CACHE_TTL = 10 * 60 * 1000;
const EXCHANGE_RATE_CACHE_TTL = 30 * 60 * 1000;
const USD_CNY_RATE_URL = "https://open.er-api.com/v6/latest/USD";
const iconSearchCache = new Map();
let usdCnyRateCache = null;
let usdCnyRateRequest = null;

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext() || {};
    if (event.Type === "Timer") {
      if (OPENID) return { ok: false, error: "定时任务不能由客户端触发" };
      return sendRenewalReminders();
    }
    if (event.action === "webInternal") {
      return handleWebInternal(event.internalSecret, event.request);
    }
    if (!OPENID) return { ok: false, error: "无法识别当前微信用户" };

    switch (event.action) {
      case "login":
        return login(OPENID);
      case "reminderConfig":
        return { ok: true, templateId: RENEWAL_TEMPLATE_ID };
      case "saveProfile":
        return saveProfile(OPENID, event.profile);
      case "updatePreferences":
        return updatePreferences(OPENID, event.preferences);
      case "avatarUploadConfig":
        return { ok: true, pathPrefix: avatarPathPrefix(OPENID) };
      case "subscriptionIconUploadConfig":
        return { ok: true, pathPrefix: subscriptionIconPathPrefix(OPENID) };
      case "searchSubscriptionIcons":
        return searchSubscriptionIcons(event.query);
      case "adoptSubscriptionIcon":
        return adoptSubscriptionIcon(OPENID, event.trackId);
      case "exchangeRate":
        return exchangeRateQuote(Boolean(event.force));
      case "list":
        return listSubscriptions(OPENID);
      case "add":
        return addSubscription(OPENID, event.input);
      case "update":
        return updateSubscription(OPENID, event.id, event.input);
      case "enableReminder":
        return enableReminder(OPENID, event.id);
      case "updateStatus":
        return updateStatus(OPENID, event.id, event.operation, event.reminderEnabled, event.snoozeDays);
      case "delete":
        return deleteSubscription(OPENID, event.id);
      case "clearAll":
        return clearAll(OPENID);
      case "confirmWebBinding":
        return confirmWebBinding(OPENID, event.code);
      default:
        return { ok: false, error: "不支持的操作" };
    }
  } catch (error) {
    console.error("subscriptionService failed", { action: event.action, message: error.message });
    if (String(error.errCode || "").includes("COLLECTION_NOT_EXIST") || String(error.message || "").includes("collection not exists")) {
      return { ok: false, error: "请先在云开发数据库创建 subscriptions 集合" };
    }
    if (String(error.message || "").includes("美元汇率")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "服务暂时不可用，请稍后再试" };
  }
};

function hashWebToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function randomWebToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function secureEqual(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function validFutureIso(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

async function handleWebInternal(secret, request) {
  const expectedSecret = String(process.env.WEB_SYNC_INTERNAL_SECRET || "");
  if (expectedSecret.length < 32 || !secureEqual(secret, expectedSecret)) {
    return { ok: false, error: "网页同步服务未授权" };
  }
  const action = request && request.action;
  if (action === "createBinding") return createWebBinding();
  if (action === "checkBinding") return checkWebBinding(request.requestToken);
  if (action === "session") return handleWebSession(request.sessionToken, request.request);
  return { ok: false, error: "不支持的网页同步操作" };
}

async function createWebBinding() {
  const requestToken = randomWebToken();
  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
    const existing = await subscriptions.where({
      code: candidate,
      recordType: WEB_BINDING_RECORD_TYPE,
      status: "pending",
    }).limit(1).get();
    if (!existing.data.length) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("binding code unavailable");
  const expiresAt = new Date(Date.now() + WEB_BINDING_TTL_MS).toISOString();
  await subscriptions.add({ data: {
    code,
    createdAt: db.serverDate(),
    expiresAt,
    recordType: WEB_BINDING_RECORD_TYPE,
    requestTokenHash: hashWebToken(requestToken),
    status: "pending",
  } });
  return { ok: true, code, expiresAt, requestToken };
}

async function confirmWebBinding(ownerOpenid, inputCode) {
  const code = String(inputCode || "").replace(/\D/g, "").slice(0, 8);
  if (code.length !== 8) return { ok: false, error: "请输入 8 位网页绑定码" };
  const result = await subscriptions.where({
    code,
    recordType: WEB_BINDING_RECORD_TYPE,
    status: "pending",
  }).limit(1).get();
  const binding = result.data[0];
  if (!binding || !validFutureIso(binding.expiresAt)) {
    if (binding) await subscriptions.doc(binding._id).remove().catch(() => {});
    return { ok: false, error: "绑定码无效或已过期，请在网页重新生成" };
  }
  await subscriptions.doc(binding._id).update({ data: {
    confirmedAt: db.serverDate(),
    ownerOpenid,
    status: "confirmed",
  } });
  return { ok: true };
}

async function checkWebBinding(requestToken) {
  const tokenHash = hashWebToken(requestToken);
  const result = await subscriptions.where({
    recordType: WEB_BINDING_RECORD_TYPE,
    requestTokenHash: tokenHash,
  }).limit(1).get();
  const binding = result.data[0];
  if (!binding || !validFutureIso(binding.expiresAt)) {
    if (binding) await subscriptions.doc(binding._id).remove().catch(() => {});
    return { ok: false, error: "绑定请求已过期，请重新生成" };
  }
  if (binding.status !== "confirmed" || !binding.ownerOpenid) {
    return { ok: true, status: "pending" };
  }
  const sessionToken = randomWebToken();
  const expiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS).toISOString();
  await subscriptions.add({ data: {
    createdAt: db.serverDate(),
    expiresAt,
    ownerOpenid: binding.ownerOpenid,
    recordType: WEB_SESSION_RECORD_TYPE,
    sessionTokenHash: hashWebToken(sessionToken),
  } });
  await subscriptions.doc(binding._id).remove();
  return { ok: true, status: "confirmed", sessionToken, expiresAt };
}

async function handleWebSession(sessionToken, request) {
  const result = await subscriptions.where({
    recordType: WEB_SESSION_RECORD_TYPE,
    sessionTokenHash: hashWebToken(sessionToken),
  }).limit(1).get();
  const session = result.data[0];
  if (!session || !session.ownerOpenid || !validFutureIso(session.expiresAt)) {
    if (session) await subscriptions.doc(session._id).remove().catch(() => {});
    return { ok: false, error: "网页登录已过期，请重新绑定", authExpired: true };
  }
  const action = request && request.action;
  if (action === "bootstrap") {
    const [account, list] = await Promise.all([
      login(session.ownerOpenid),
      listSubscriptions(session.ownerOpenid),
    ]);
    return { ok: true, user: account.user, subscriptions: list.subscriptions };
  }
  if (action === "logout") {
    await subscriptions.doc(session._id).remove();
    return { ok: true };
  }
  if (action === "updateStatus") {
    const update = await updateStatus(
      session.ownerOpenid,
      request.id,
      request.operation,
      false,
      request.snoozeDays,
    );
    if (!update.ok) return update;
    const list = await listSubscriptions(session.ownerOpenid);
    return { ok: true, subscription: update.subscription, subscriptions: list.subscriptions };
  }
  if (action === "delete") {
    const removed = await deleteSubscription(session.ownerOpenid, request.id);
    if (!removed.ok) return removed;
    const list = await listSubscriptions(session.ownerOpenid);
    return { ok: true, id: removed.id, subscriptions: list.subscriptions };
  }
  return { ok: false, error: "当前网页版本不支持此操作" };
}

async function listSubscriptions(ownerOpenid) {
  const records = await fetchAll(subscriptions.where({
    ownerOpenid,
    recordType: SUBSCRIPTION_RECORD_TYPE,
  }));
  return {
    ok: true,
    subscriptions: records
      .sort((left, right) => String(left.nextChargeDate).localeCompare(String(right.nextChargeDate)))
      .map(publicSubscription),
  };
}

async function searchSubscriptionIcons(query) {
  const originalQuery = String(query || "").trim().slice(0, 60);
  const searchQuery = normalizeIconSearchQuery(originalQuery);
  if (searchQuery.length < 2) return { ok: true, candidates: [] };
  const cacheKey = normalizedSearchValue(searchQuery);
  const cached = iconSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < ICON_SEARCH_CACHE_TTL) {
    return { ok: true, candidates: cached.candidates };
  }

  const payload = await requestJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&country=cn&entity=software&limit=8`,
  );
  const results = Array.isArray(payload.results) ? payload.results : [];
  const ranked = results
    .filter((item) => (
      Number.isInteger(Number(item.trackId))
      && String(item.trackName || "").trim()
      && trustedArtworkUrl(item.artworkUrl100)
    ))
    .sort((left, right) => iconSearchScore(right, originalQuery) - iconSearchScore(left, originalQuery))
    .slice(0, 3);

  const resolved = await mapWithConcurrency(ranked, 3, async (item) => {
    try {
      const artwork = await requestBuffer(item.artworkUrl100, 96 * 1024);
      return {
        id: String(item.trackId),
        name: String(item.trackName || "").trim().slice(0, 60),
        publisher: String(item.sellerName || "").trim().slice(0, 60),
        previewDataUrl: `data:${artwork.contentType};base64,${artwork.buffer.toString("base64")}`,
      };
    } catch (error) {
      console.warn("icon candidate preview failed", {
        trackId: item.trackId,
        message: error.message,
      });
      return null;
    }
  });
  const candidates = resolved.filter(Boolean);
  if (iconSearchCache.size >= 30) {
    iconSearchCache.delete(iconSearchCache.keys().next().value);
  }
  iconSearchCache.set(cacheKey, { candidates, createdAt: Date.now() });
  return { ok: true, candidates };
}

async function adoptSubscriptionIcon(ownerOpenid, trackId) {
  const normalizedTrackId = String(trackId || "").trim();
  if (!/^\d{1,20}$/.test(normalizedTrackId)) return { ok: false, error: "图标候选无效" };
  const payload = await requestJson(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(normalizedTrackId)}&country=cn&entity=software`,
  );
  const item = Array.isArray(payload.results) ? payload.results[0] : null;
  if (!item || String(item.trackId) !== normalizedTrackId || !trustedArtworkUrl(item.artworkUrl100)) {
    return { ok: false, error: "该图标暂时不可用" };
  }

  const artworkUrl = String(item.artworkUrl100).replace(/\/100x100bb\./, "/256x256bb.");
  const artwork = await requestBuffer(artworkUrl, 2 * 1024 * 1024);
  const extension = artwork.contentType === "image/png"
    ? "png"
    : artwork.contentType === "image/webp"
      ? "webp"
      : "jpg";
  const cloudPath = `${subscriptionIconPathPrefix(ownerOpenid)}/matched-${normalizedTrackId}-${Date.now()}.${extension}`;
  const uploaded = await cloud.uploadFile({
    cloudPath,
    fileContent: artwork.buffer,
  });
  if (!uploaded.fileID) return { ok: false, error: "图标保存失败" };
  return {
    ok: true,
    fileId: uploaded.fileID,
    name: String(item.trackName || "").trim().slice(0, 60),
  };
}

async function exchangeRateQuote(force = false) {
  const quote = await currentUsdCnyRate(force);
  return Object.assign({ ok: true }, quote);
}

async function currentUsdCnyRate(force = false) {
  if (
    !force
    && usdCnyRateCache
    && Date.now() - usdCnyRateCache.fetchedAt < EXCHANGE_RATE_CACHE_TTL
  ) {
    return usdCnyRateCache.quote;
  }
  if (usdCnyRateRequest) return usdCnyRateRequest;
  usdCnyRateRequest = (async () => {
    try {
      const payload = await requestJson(USD_CNY_RATE_URL, "exchange-rate");
      const rate = Number(payload && payload.rates && payload.rates.CNY);
      if (payload.result !== "success" || !Number.isFinite(rate) || rate < 4 || rate > 12) {
        throw new Error("invalid exchange rate");
      }
      const updateTimestamp = Number(payload.time_last_update_unix) * 1000;
      const quote = {
        base: "USD",
        target: "CNY",
        rate: Math.round(rate * 1000000) / 1000000,
        updatedAt: Number.isFinite(updateTimestamp) && updateTimestamp > 0
          ? new Date(updateTimestamp).toISOString()
          : new Date().toISOString(),
        provider: "ExchangeRate-API",
      };
      usdCnyRateCache = { fetchedAt: Date.now(), quote };
      return quote;
    } catch (error) {
      console.warn("USD/CNY exchange rate request failed", error.message);
      throw new Error("暂时无法获取美元汇率，请稍后重试");
    } finally {
      usdCnyRateRequest = null;
    }
  })();
  return usdCnyRateRequest;
}

function convertToRmbCents(sourceAmountCents, rate) {
  const source = Math.round(Number(sourceAmountCents));
  const normalizedRate = Number(rate);
  if (!Number.isInteger(source) || source < 1 || source > 100000000) {
    throw new Error("invalid input");
  }
  if (!Number.isFinite(normalizedRate) || normalizedRate < 4 || normalizedRate > 12) {
    throw new Error("invalid exchange rate");
  }
  return Math.round(source * normalizedRate);
}

async function addSubscription(ownerOpenid, input) {
  const existing = await subscriptions.where({
    ownerOpenid,
    recordType: SUBSCRIPTION_RECORD_TYPE,
  }).count();
  if (Number(existing.total || 0) >= MAX_SUBSCRIPTIONS) {
    return { ok: false, error: `每个账号最多保存 ${MAX_SUBSCRIPTIONS} 项订阅` };
  }
  const item = await validateInput(input, ownerOpenid);
  const result = await subscriptions.add({
    data: Object.assign({}, item, {
      ownerOpenid,
      recordType: SUBSCRIPTION_RECORD_TYPE,
      status: "active",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }),
  });
  await recordRetention(ownerOpenid, "activation_3").catch(() => {});
  return {
    ok: true,
    id: result._id,
    subscription: publicSubscription(Object.assign({}, item, {
      _id: result._id,
      status: "active",
    })),
  };
}

async function updateSubscription(ownerOpenid, id, input) {
  const current = await ownedSubscription(ownerOpenid, id);
  if (!current) return { ok: false, error: "订阅不存在" };

  const item = await validateInput(input, ownerOpenid, current);
  const reminderScheduleChanged = (
    current.nextChargeDate !== item.nextChargeDate
    || Number(current.reminderDays || 3) !== item.reminderDays
  );
  const data = {
    amountCents: item.amountCents,
    billingCycle: item.billingCycle,
    category: item.category,
    color: item.color,
    currency: item.currency,
    exchangeRate: item.exchangeRate,
    exchangeRateDate: item.exchangeRateDate,
    iconFileId: item.iconFileId,
    mark: item.mark,
    name: item.name,
    nextChargeDate: item.nextChargeDate,
    note: item.note,
    paymentChannel: item.paymentChannel,
    reminderDays: item.reminderDays,
    reminderEnabled: Boolean(current.reminderEnabled && item.reminderEnabled),
    sourceAmountCents: item.sourceAmountCents,
    updatedAt: db.serverDate(),
  };
  if (reminderScheduleChanged) {
    data.lastReminderForDate = "";
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
  }
  await subscriptions.doc(id).update({ data });
  if (
    current.iconFileId
    && current.iconFileId !== item.iconFileId
    && isOwnedSubscriptionIconFileId(current.iconFileId, ownerOpenid)
  ) {
    await cloud.deleteFile({ fileList: [current.iconFileId] }).catch((error) => {
      console.warn("old subscription icon cleanup failed", error.message);
    });
  }
  return {
    ok: true,
    subscription: publicSubscription(Object.assign({}, current, data, {
      _id: id,
    })),
  };
}

async function enableReminder(ownerOpenid, id) {
  if (!RENEWAL_TEMPLATE_ID) return { ok: false, error: "微信提醒模板尚未配置" };
  const current = await ownedSubscription(ownerOpenid, id);
  if (!current) return { ok: false, error: "订阅不存在" };
  if (current.status !== "active") return { ok: false, error: "只有生效中的订阅可以开启提醒" };
  await subscriptions.doc(id).update({
    data: {
      reminderEnabled: true,
      lastReminderForDate: "",
      reminderFailureCode: "",
      reminderFailureForDate: "",
      updatedAt: db.serverDate(),
    },
  });
  await recordRetention(ownerOpenid, "reminder_enabled").catch(() => {});
  return {
    ok: true,
    subscription: publicSubscription(Object.assign({}, current, {
      reminderEnabled: true,
      lastReminderForDate: "",
      reminderFailureCode: "",
      reminderFailureForDate: "",
    })),
  };
}

async function updateStatus(ownerOpenid, id, operation, reminderEnabled, snoozeDays) {
  if (typeof id !== "string" || !id || !["cancel", "pause", "restore", "renew", "snooze"].includes(operation)) {
    return { ok: false, error: "操作无效" };
  }
  const current = await ownedSubscription(ownerOpenid, id);
  if (!current) return { ok: false, error: "订阅不存在" };
  const today = chinaDateKey();
  const isOverdueActive = current.status === "active" && current.nextChargeDate < today;
  if (operation === "renew" && !["active", "pending_confirmation"].includes(current.status)) {
    return { ok: false, error: "当前订阅不能确认续费" };
  }
  if (operation === "snooze" && current.status !== "pending_confirmation" && !isOverdueActive) {
    return { ok: false, error: "只有待确认的订阅可以稍后处理" };
  }

  const data = { updatedAt: db.serverDate() };
  if (operation === "cancel") {
    data.archiveDate = addDays(today, 7);
    data.status = "cancel_pending";
    data.reminderEnabled = false;
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
    data.serviceClosedAt = today;
  }
  if (operation === "pause") {
    data.archiveDate = "";
    data.status = "paused";
    data.reminderEnabled = false;
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
    data.serviceClosedAt = "";
  }
  if (operation === "restore") {
    data.archiveDate = "";
    data.status = "active";
    data.reminderEnabled = false;
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
    data.snoozedUntil = "";
    data.serviceClosedAt = "";
  }
  if (operation === "renew") {
    data.archiveDate = "";
    data.status = "active";
    data.nextChargeDate = nextFutureChargeDate(current.nextChargeDate, current.billingCycle, today);
    data.reminderEnabled = Boolean(RENEWAL_TEMPLATE_ID && reminderEnabled);
    data.lastReminderForDate = "";
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
    data.snoozedUntil = "";
    data.serviceClosedAt = "";
  }
  if (operation === "snooze") {
    const days = [1, 3, 7].includes(Number(snoozeDays)) ? Number(snoozeDays) : 1;
    data.status = "pending_confirmation";
    data.snoozedUntil = addDays(today, days);
    data.reminderEnabled = Boolean(RENEWAL_TEMPLATE_ID && reminderEnabled);
    data.lastReminderForDate = "";
    data.reminderFailureCode = "";
    data.reminderFailureForDate = "";
  }
  data.lastAction = operation;
  data.lastActionDate = today;
  await subscriptions.doc(id).update({ data });
  if (["renew", "cancel", "snooze"].includes(operation)) {
    await recordRetention(ownerOpenid, "reminder_handled").catch(() => {});
  }
  return {
    ok: true,
    subscription: publicSubscription(Object.assign({}, current, data, {
      _id: id,
    })),
  };
}

async function deleteSubscription(ownerOpenid, id) {
  const current = await ownedSubscription(ownerOpenid, id);
  if (!current) return { ok: false, error: "订阅不存在" };
  if (!["cancel_pending", "paused", "archived"].includes(current.status)) {
    return { ok: false, error: "请先取消、暂停或归档订阅" };
  }

  await subscriptions.doc(id).remove();
  if (isOwnedSubscriptionIconFileId(current.iconFileId, ownerOpenid)) {
    await cloud.deleteFile({ fileList: [current.iconFileId] }).catch((error) => {
      console.warn("deleted subscription icon cleanup failed", error.message);
    });
  }
  return { ok: true, id };
}

async function clearAll(ownerOpenid) {
  const records = await fetchAll(subscriptions.where({ ownerOpenid }));
  const subscriptionRecords = records.filter((item) => item.recordType === SUBSCRIPTION_RECORD_TYPE);
  const ownedIconFileIds = [...new Set(subscriptionRecords
    .map((item) => item.iconFileId)
    .filter((fileId) => isOwnedSubscriptionIconFileId(fileId, ownerOpenid)))];
  for (let index = 0; index < ownedIconFileIds.length; index += 50) {
    await cloud.deleteFile({ fileList: ownedIconFileIds.slice(index, index + 50) }).catch((error) => {
      console.warn("subscription icon cleanup failed", error.message);
    });
  }
  await mapWithConcurrency(subscriptionRecords, 8, (item) => subscriptions.doc(item._id).remove());
  return { ok: true, removed: subscriptionRecords.length };
}

async function login(ownerOpenid) {
  const result = await subscriptions.where({ ownerOpenid, recordType: PROFILE_RECORD_TYPE }).limit(1).get();
  const profile = result.data[0];
  await recordRetention(ownerOpenid, "app_open", profile).catch(() => {});
  return { ok: true, user: publicUser(ownerOpenid, profile) };
}

async function updatePreferences(ownerOpenid, input) {
  const result = await subscriptions.where({ ownerOpenid, recordType: PROFILE_RECORD_TYPE }).limit(1).get();
  const current = result.data[0];
  const data = {
    analyticsEnabled: Boolean(input && input.analyticsEnabled),
    ownerOpenid,
    recordType: PROFILE_RECORD_TYPE,
    updatedAt: db.serverDate(),
  };
  if (current) await subscriptions.doc(current._id).update({ data });
  else {
    data.createdAt = db.serverDate();
    await subscriptions.add({ data });
  }
  if (data.analyticsEnabled) {
    await recordRetention(ownerOpenid, "activation_3").catch(() => {});
  }
  return { ok: true, user: publicUser(ownerOpenid, Object.assign({}, current || {}, data)) };
}

async function recordRetention(ownerOpenid, eventName, knownProfile) {
  const allowed = {
    app_open: "retentionLastOpenAt",
    activation_3: "retentionActivatedAt",
    reminder_enabled: "retentionReminderEnabledAt",
    reminder_handled: "retentionReminderHandledAt",
  };
  const field = allowed[eventName];
  if (!field) return;
  let profile = knownProfile;
  if (!profile) {
    const result = await subscriptions.where({ ownerOpenid, recordType: PROFILE_RECORD_TYPE }).limit(1).get();
    profile = result.data[0];
  }
  if (!profile || !profile.analyticsEnabled) return;
  if (eventName === "activation_3") {
    if (profile[field]) return;
    const items = await fetchAll(subscriptions.where({ ownerOpenid, recordType: SUBSCRIPTION_RECORD_TYPE }));
    if (items.length < 3) return;
  }
  await subscriptions.doc(profile._id).update({ data: { [field]: db.serverDate() } });
}

async function saveProfile(ownerOpenid, input) {
  const result = await subscriptions.where({ ownerOpenid, recordType: PROFILE_RECORD_TYPE }).limit(1).get();
  const current = result.data[0];
  const profile = validateProfile(input, ownerOpenid, current);
  const data = Object.assign({}, profile, {
    ownerOpenid,
    recordType: PROFILE_RECORD_TYPE,
    updatedAt: db.serverDate(),
  });

  if (current) {
    await subscriptions.doc(current._id).update({ data });
  } else {
    data.createdAt = db.serverDate();
    await subscriptions.add({ data });
  }

  if (
    current
    && current.avatarFileId
    && current.avatarFileId !== profile.avatarFileId
    && isOwnedAvatarFileId(current.avatarFileId, ownerOpenid)
  ) {
    await cloud.deleteFile({ fileList: [current.avatarFileId] }).catch((error) => {
      console.warn("old avatar cleanup failed", error.message);
    });
  }

  return { ok: true, user: publicUser(ownerOpenid, Object.assign({}, current || {}, profile)) };
}

async function validateInput(input, ownerOpenid, current) {
  if (!input || typeof input !== "object") throw new Error("invalid input");
  const name = String(input.name || "").trim().slice(0, 60);
  const category = CATEGORIES.has(input.category) ? input.category : "其他";
  const currency = input.currency === "USD" ? "USD" : "CNY";
  const sourceAmountCents = Math.round(Number(
    input.sourceAmountCents === undefined ? input.amountCents : input.sourceAmountCents,
  ));
  let amountCents = sourceAmountCents;
  let exchangeRate = 1;
  let exchangeRateDate = "";
  if (currency === "USD") {
    const canKeepStoredRate = Boolean(
      current
      && current.currency === "USD"
      && Number(current.sourceAmountCents) === sourceAmountCents
      && Number.isFinite(Number(current.exchangeRate))
      && Number(current.exchangeRate) >= 4
      && Number(current.exchangeRate) <= 12
      && /^\d{4}-\d{2}-\d{2}$/.test(String(current.exchangeRateDate || "")),
    );
    if (canKeepStoredRate) {
      exchangeRate = Number(current.exchangeRate);
      exchangeRateDate = current.exchangeRateDate;
    } else {
      const quote = await currentUsdCnyRate();
      exchangeRate = quote.rate;
      exchangeRateDate = quote.updatedAt.slice(0, 10);
    }
    amountCents = convertToRmbCents(sourceAmountCents, exchangeRate);
  }
  const billingCycle = input.billingCycle === "yearly" ? "yearly" : "monthly";
  const nextChargeDate = String(input.nextChargeDate || "");
  const reminderDays = [1, 3, 5, 7].includes(Number(input.reminderDays)) ? Number(input.reminderDays) : 3;
  const reminderEnabled = Boolean(RENEWAL_TEMPLATE_ID && input.reminderEnabled);
  const color = normalizeColor(input.color);
  const iconFileId = String(input.iconFileId || "").trim();
  const unchangedIcon = Boolean(current && iconFileId && iconFileId === current.iconFileId);
  const note = String(input.note || "").trim().slice(0, 120);
  const paymentChannel = PAYMENT_CHANNELS.has(input.paymentChannel) ? input.paymentChannel : "other";

  if (
    !name
    || !Number.isInteger(sourceAmountCents)
    || sourceAmountCents < 1
    || sourceAmountCents > 100000000
    || !Number.isInteger(amountCents)
    || amountCents < 1
    || amountCents > 100000000
  ) throw new Error("invalid input");
  if (!isValidDateKey(nextChargeDate)) throw new Error("invalid input");
  if (iconFileId && !unchangedIcon && !isOwnedSubscriptionIconFileId(iconFileId, ownerOpenid)) {
    throw new Error("invalid input");
  }
  return {
    name,
    category,
    amountCents,
    billingCycle,
    currency,
    sourceAmountCents,
    exchangeRate,
    exchangeRateDate,
    nextChargeDate,
    reminderDays,
    reminderEnabled,
    lastReminderForDate: "",
    reminderFailureCode: "",
    reminderFailureForDate: "",
    color,
    iconFileId,
    note,
    paymentChannel,
    mark: name.slice(0, 1),
  };
}

async function ownedSubscription(ownerOpenid, id) {
  if (typeof id !== "string" || !id) return null;
  const result = await subscriptions.doc(id).get();
  const item = result.data;
  return item
    && item.ownerOpenid === ownerOpenid
    && item.recordType === SUBSCRIPTION_RECORD_TYPE
    ? item
    : null;
}

function normalizeColor(value) {
  const color = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
}

function advanceDate(value, cycle) {
  if (!isValidDateKey(value)) throw new Error("invalid date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (cycle === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function nextFutureChargeDate(value, cycle, today) {
  let next = advanceDate(value, cycle);
  let guard = 0;
  while (next <= today && guard < 240) {
    next = advanceDate(next, cycle);
    guard += 1;
  }
  return next;
}

function addDays(value, count) {
  if (!isValidDateKey(value)) throw new Error("invalid date");
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(count || 0));
  return date.toISOString().slice(0, 10);
}

function cancelledArchiveDate(item) {
  const explicitDate = String(item && item.archiveDate || "");
  if (isValidDateKey(explicitDate)) return explicitDate;
  const updatedAt = item && item.updatedAt;
  const updatedDate = updatedAt && typeof updatedAt.getTime === "function" ? updatedAt : new Date(updatedAt || "");
  const cancellationDate = Number.isNaN(updatedDate.getTime()) ? chinaDateKey() : chinaDateKey(updatedDate);
  return addDays(cancellationDate, 7);
}

function stripPrivateFields(item) {
  const safe = Object.assign({}, item);
  delete safe.ownerOpenid;
  delete safe._openid;
  delete safe.recordType;
  return safe;
}

function publicSubscription(item) {
  const safe = stripPrivateFields(item);
  if (safe.status === "cancel_pending" && !isValidDateKey(String(safe.archiveDate || ""))) {
    safe.archiveDate = cancelledArchiveDate(safe);
  }
  // 页面不会使用数据库时间戳；不传输它们可以缩小列表和本地缓存体积。
  delete safe.createdAt;
  delete safe.updatedAt;
  return safe;
}

function maskOpenId(openid) {
  return `${openid.slice(0, 4)}••••${openid.slice(-4)}`;
}

function avatarPathPrefix(ownerOpenid) {
  const ownerKey = crypto.createHash("sha256").update(ownerOpenid).digest("hex").slice(0, 24);
  return `avatars/${ownerKey}`;
}

function subscriptionIconPathPrefix(ownerOpenid) {
  const ownerKey = crypto.createHash("sha256").update(ownerOpenid).digest("hex").slice(0, 24);
  return `subscription-icons/${ownerKey}`;
}

function isOwnedAvatarFileId(fileId, ownerOpenid) {
  return typeof fileId === "string"
    && fileId.startsWith("cloud://")
    && fileId.includes(`/${avatarPathPrefix(ownerOpenid)}/`);
}

function isOwnedSubscriptionIconFileId(fileId, ownerOpenid) {
  return typeof fileId === "string"
    && fileId.startsWith("cloud://")
    && fileId.includes(`/${subscriptionIconPathPrefix(ownerOpenid)}/`);
}

function validateProfile(input, ownerOpenid, current) {
  if (!input || typeof input !== "object") throw new Error("invalid profile");
  const nickname = String(input.nickname || "").trim().slice(0, 20);
  const avatarFileId = String(input.avatarFileId || "").trim();
  const unchangedAvatar = Boolean(current && avatarFileId && avatarFileId === current.avatarFileId);
  const validAvatar = !avatarFileId || unchangedAvatar || isOwnedAvatarFileId(avatarFileId, ownerOpenid);
  if (!nickname || !validAvatar) {
    throw new Error("invalid profile");
  }
  return { nickname, avatarFileId };
}

function publicUser(ownerOpenid, profile) {
  return {
    analyticsEnabled: Boolean(profile && profile.analyticsEnabled),
    idHint: maskOpenId(ownerOpenid),
    nickname: profile ? profile.nickname : "",
    avatarFileId: profile ? profile.avatarFileId : "",
    profileComplete: Boolean(profile && profile.nickname),
  };
}

function normalizeIconSearchQuery(value) {
  const query = String(value || "")
    .replace(/(?:超级)?会员|大会员|盐选|听书|超级吃货卡/gi, " ")
    .replace(/\b(?:plus|pro|premium|vip)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query || String(value || "").trim();
}

function normalizedSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s·._+\-—–()[\]（）【】]/g, "");
}

function iconSearchScore(item, query) {
  const target = normalizedSearchValue(query);
  const name = normalizedSearchValue(item.trackName);
  const publisher = normalizedSearchValue(item.sellerName);
  if (!target || !name) return 0;
  if (name === target) return 1000;
  if (name.startsWith(target) || target.startsWith(name)) return 700;
  if (name.includes(target) || target.includes(name)) return 500;
  if (publisher.includes(target)) return 250;
  return 0;
}

function trustedArtworkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && (url.hostname === "mzstatic.com" || url.hostname.endsWith(".mzstatic.com"));
  } catch {
    return false;
  }
}

function trustedRequestUrl(value, kind) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return false;
    if (kind === "exchange-rate") {
      return url.hostname === "open.er-api.com" && url.pathname === "/v6/latest/USD";
    }
    if (kind === "json") return url.hostname === "itunes.apple.com";
    return trustedArtworkUrl(url.toString());
  } catch {
    return false;
  }
}

function httpsRequest(url, maxBytes, kind, redirects = 0) {
  if (!trustedRequestUrl(url, kind)) return Promise.reject(new Error("untrusted icon source"));
  if (redirects > 3) return Promise.reject(new Error("too many redirects"));
  return new Promise((resolve, reject) => {
    const https = require("https");
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const request = https.get(url, {
      headers: {
        Accept: kind === "artwork" ? "image/avif,image/webp,image/png,image/jpeg" : "application/json",
        "User-Agent": "DingxuMiniProgram/2.2",
      },
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        const redirected = new URL(response.headers.location, url).toString();
        httpsRequest(redirected, maxBytes, kind, redirects + 1).then(
          (result) => finish(resolve, result),
          (error) => finish(reject, error),
        );
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        finish(reject, new Error(`icon source returned ${statusCode}`));
        return;
      }

      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error("icon source response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const contentType = String(response.headers["content-type"] || "").split(";")[0].toLowerCase();
        finish(resolve, { buffer: Buffer.concat(chunks), contentType });
      });
      response.on("error", (error) => finish(reject, error));
    });
    const timeoutMs = kind === "exchange-rate" ? 4500 : 7000;
    request.setTimeout(timeoutMs, () => request.destroy(new Error("remote source request timed out")));
    request.on("error", (error) => finish(reject, error));
  });
}

async function requestJson(url, kind = "json") {
  const maxBytes = kind === "exchange-rate" ? 256 * 1024 : 1024 * 1024;
  const response = await httpsRequest(url, maxBytes, kind);
  return JSON.parse(response.buffer.toString("utf8"));
}

async function requestBuffer(url, maxBytes) {
  const response = await httpsRequest(url, maxBytes, "artwork");
  if (!["image/jpeg", "image/png", "image/webp"].includes(response.contentType)) {
    throw new Error("icon source did not return an image");
  }
  return response;
}

async function sendRenewalReminders() {
  const today = chinaDateKey();
  const lifecycle = await reconcileSubscriptionStates(today);
  if (!RENEWAL_TEMPLATE_ID) {
    console.warn("renewal reminder skipped: template id is empty");
    return {
      ok: true,
      skipped: true,
      reason: "template_not_configured",
      lifecycle,
    };
  }

  const activeRecords = await fetchAll(subscriptions.where({
    recordType: SUBSCRIPTION_RECORD_TYPE,
    status: "active",
    reminderEnabled: true,
  }));
  const pendingRecords = await fetchAll(subscriptions.where({
    recordType: SUBSCRIPTION_RECORD_TYPE,
    status: "pending_confirmation",
    reminderEnabled: true,
  }));
  const records = activeRecords.concat(pendingRecords);
  const dueRecords = records.filter((item) => item.status === "pending_confirmation"
    ? item.snoozedUntil && item.snoozedUntil <= today
    : (
    subtractDays(item.nextChargeDate, item.reminderDays) <= today
    && item.nextChargeDate >= today
    && item.lastReminderForDate !== item.nextChargeDate
  ));
  const groups = Object.values(dueRecords.reduce((result, item) => {
    if (!result[item.ownerOpenid]) result[item.ownerOpenid] = [];
    result[item.ownerOpenid].push(item);
    return result;
  }, {}));
  const summary = {
    ok: true,
    checked: records.length,
    due: dueRecords.length,
    groups: groups.length,
    sent: 0,
    failed: 0,
    lifecycle,
  };

  await mapWithConcurrency(groups, 6, async (group) => {
    const first = group[0];
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: first.ownerOpenid,
        page: group.length === 1 ? `pages/index/index?focus=${first._id}` : "pages/index/index?pending=1",
        templateId: RENEWAL_TEMPLATE_ID,
        data: reminderTemplateData(group),
      });
      await mapWithConcurrency(group, 6, (item) => subscriptions.doc(item._id).update({
          data: {
            lastReminderForDate: item.nextChargeDate,
            reminderEnabled: false,
            reminderFailureCode: "",
            reminderFailureForDate: "",
            reminderSentAt: db.serverDate(),
            updatedAt: db.serverDate(),
          },
        }));
      summary.sent += 1;
    } catch (error) {
      console.error("renewal reminder send failed", {
        ids: group.map((item) => item._id),
        errCode: error.errCode,
        message: error.message,
      });
      await mapWithConcurrency(group, 6, (item) => subscriptions.doc(item._id).update({ data: {
          reminderEnabled: false,
          reminderFailureCode: String(error.errCode || "unknown").slice(0, 40),
          reminderFailureForDate: item.nextChargeDate,
          reminderFailedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        } }));
      summary.failed += 1;
    }
  });
  return summary;
}

async function reconcileSubscriptionStates(today) {
  const cancelled = await fetchAll(subscriptions.where({
    recordType: SUBSCRIPTION_RECORD_TYPE,
    status: "cancel_pending",
  }));
  const toArchive = cancelled.filter((item) => {
    try {
      return cancelledArchiveDate(item) <= today;
    } catch {
      console.warn("cancelled subscription has invalid expiry date", { id: item._id });
      return false;
    }
  });
  const active = await fetchAll(subscriptions.where({
    recordType: SUBSCRIPTION_RECORD_TYPE,
    status: "active",
  }));
  const toConfirm = active.filter((item) => item.nextChargeDate < today);
  await mapWithConcurrency(toArchive, 8, (item) => subscriptions.doc(item._id).update({ data: {
    archivedAt: db.serverDate(),
    reminderEnabled: false,
    status: "archived",
    updatedAt: db.serverDate(),
  } }));
  await mapWithConcurrency(toConfirm, 8, (item) => subscriptions.doc(item._id).update({ data: {
    reminderEnabled: false,
    status: "pending_confirmation",
    updatedAt: db.serverDate(),
  } }));
  return { archived: toArchive.length, pending: toConfirm.length };
}

function reminderTemplateData(items) {
  const group = Array.isArray(items) ? items : [items];
  const first = group[0] || {};
  const data = {};
  data[RENEWAL_TEMPLATE_FIELDS.time] = { value: formatTemplateTime(first.nextChargeDate) };
  data[RENEWAL_TEMPLATE_FIELDS.description] = {
    value: group.length === 1
      ? `${String(first.name || "订阅服务")}，预计扣款¥${(Number(first.amountCents || 0) / 100).toFixed(2)}`.slice(0, 20)
      : `${group.length}项订阅待处理：${group.map((item) => item.name).join("、")}`.slice(0, 20),
  };
  return data;
}

async function fetchAll(query) {
  const records = [];
  let offset = 0;
  while (true) {
    const result = await query.skip(offset).limit(100).get();
    const page = result.data || [];
    records.push(...page);
    if (page.length < 100) break;
    offset += page.length;
  }
  return records;
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function formatTemplateTime(value) {
  const parts = String(value || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "续费日 09:00";
  return `${parts[0]}年${parts[1]}月${parts[2]}日 09:00`;
}

function subtractDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function chinaDateKey(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
