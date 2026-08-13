/* global getApp, wx */
const CACHE_TTL = 60000;
const EXCHANGE_RATE_CACHE_TTL = 10 * 60 * 1000;
const ICON_URL_BATCH_SIZE = 50;

let listCache = null;
let listFetchedAt = 0;
let listRequest = null;
let listRequestVersion = 0;
let listSignature = "";
let exchangeRateCache = null;
let exchangeRateFetchedAt = 0;
let exchangeRateRequest = null;
const iconUrlCache = new Map();

const STATUS_RANK = { pending_confirmation: 0, active: 1, cancel_pending: 2, paused: 3, archived: 4 };

function compareSubscriptions(left, right) {
  return (
    (STATUS_RANK[left.status] === undefined ? 9 : STATUS_RANK[left.status])
    - (STATUS_RANK[right.status] === undefined ? 9 : STATUS_RANK[right.status])
    || String(left.nextChargeDate || "").localeCompare(String(right.nextChargeDate || ""))
    || String(left._id || "").localeCompare(String(right._id || ""))
  );
}

function subscriptionListSignature(items) {
  return JSON.stringify((items || []).slice().sort(compareSubscriptions));
}

function normalizeExchangeRate(result) {
  return {
    base: result.base || "USD",
    provider: result.provider || "ExchangeRate-API",
    rate: Number(result.rate || 0),
    target: result.target || "CNY",
    updatedAt: result.updatedAt || "",
  };
}

function call(action, data) {
  return getApp().ensureLogin().then(() => wx.cloud.callFunction({
    name: "subscriptionService",
    data: Object.assign({ action }, data || {}),
  })).then(({ result }) => {
    if (!result || !result.ok) {
      throw new Error(result && result.error ? result.error : "服务暂时不可用");
    }
    return result;
  });
}

function invalidate() {
  listCache = null;
  listFetchedAt = 0;
  listRequestVersion += 1;
  listSignature = "";
}

function commitList(items) {
  listCache = (items || [])
    .slice()
    .sort(compareSubscriptions);
  listFetchedAt = Date.now();
  listSignature = JSON.stringify(listCache);
  return listCache;
}

function upsertCachedSubscription(item) {
  if (!listCache || !item || !item._id) return false;
  const index = listCache.findIndex((entry) => entry._id === item._id);
  const next = listCache.slice();
  if (index >= 0) next[index] = item;
  else next.push(item);
  commitList(next);
  return true;
}

function removeCachedSubscription(id) {
  if (!listCache || !id) return false;
  const next = listCache.filter((item) => item._id !== id);
  if (next.length === listCache.length) return false;
  commitList(next);
  return true;
}

function warmIconUrls(items) {
  if (!wx.cloud || typeof wx.cloud.getTempFileURL !== "function") return;
  const fileIds = [...new Set((items || [])
    .map((item) => item.iconFileId)
    .filter((fileId) => typeof fileId === "string" && fileId.startsWith("cloud://") && !iconUrlCache.has(fileId)))];
  if (!fileIds.length) return;
  const batches = [];
  for (let index = 0; index < fileIds.length; index += ICON_URL_BATCH_SIZE) {
    batches.push(fileIds.slice(index, index + ICON_URL_BATCH_SIZE));
  }
  Promise.all(batches.map((fileList) => wx.cloud.getTempFileURL({ fileList })))
    .then((responses) => responses.flatMap((response) => response.fileList || []))
    .then((fileList) => {
      fileList.forEach((file) => {
        if (file.fileID && file.tempFileURL) iconUrlCache.set(file.fileID, file.tempFileURL);
      });
      if (listCache) {
        listCache = listCache.map((item) => {
          const iconUrl = iconUrlCache.get(item.iconFileId);
          return iconUrl ? Object.assign({}, item, { iconUrl }) : item;
        });
        listSignature = subscriptionListSignature(listCache);
      }
    })
    .catch(() => {});
}

function mutate(action, data) {
  return call(action, data).then((result) => {
    const cacheUpdated = result.subscription
      ? upsertCachedSubscription(result.subscription)
      : action === "delete"
        ? removeCachedSubscription(result.id || (data && data.id))
        : false;
    // 兼容尚未部署新版云函数的环境：没有返回变更记录时仍按原流程重新读取。
    if (!cacheUpdated) invalidate();
    return result;
  });
}

module.exports = {
  add(input) { return mutate("add", { input }); },
  avatarUploadConfig() {
    return call("avatarUploadConfig").then((result) => result.pathPrefix || "");
  },
  clearAll() {
    return call("clearAll").then((result) => {
      commitList([]);
      return result;
    });
  },
  enableReminder(id) { return mutate("enableReminder", { id }); },
  exchangeRate(options) {
    const force = Boolean(options && options.force);
    const cacheIsFresh = exchangeRateCache
      && Date.now() - exchangeRateFetchedAt < EXCHANGE_RATE_CACHE_TTL;
    if (!force && cacheIsFresh) return Promise.resolve(exchangeRateCache);
    if (exchangeRateRequest) return exchangeRateRequest;
    exchangeRateRequest = call("exchangeRate", { force }).then((result) => {
      exchangeRateCache = normalizeExchangeRate(result);
      exchangeRateFetchedAt = Date.now();
      return exchangeRateCache;
    }).finally(() => {
      exchangeRateRequest = null;
    });
    return exchangeRateRequest;
  },
  invalidate,
  list(options) {
    const force = Boolean(options && options.force);
    const cacheIsFresh = listCache && Date.now() - listFetchedAt < CACHE_TTL;
    if (!force && cacheIsFresh) return Promise.resolve(listCache);
    // 下拉刷新不能复用在途的普通请求，否则拿到的仍是刷新前发起的那份数据。
    if (listRequest && !force) return listRequest;
    const requestVersion = ++listRequestVersion;
    const request = call("list").then((result) => {
      const nextList = result.subscriptions || [];
      // A forced refresh can overtake an older request. Do not let the older
      // response overwrite fresh data or reset the active request lock.
      if (requestVersion !== listRequestVersion) return listCache || nextList;
      const nextSignature = subscriptionListSignature(nextList);
      if (listCache && nextSignature === listSignature) {
        listFetchedAt = Date.now();
        warmIconUrls(listCache);
        return listCache;
      }
      const committed = commitList(nextList);
      warmIconUrls(committed);
      return committed;
    }).finally(() => {
      if (listRequest === request) listRequest = null;
    });
    listRequest = request;
    return listRequest;
  },
  peekExchangeRate() {
    return exchangeRateCache
      && Date.now() - exchangeRateFetchedAt < EXCHANGE_RATE_CACHE_TTL
      ? exchangeRateCache
      : null;
  },
  peek() { return listCache; },
  reminderConfig() { return call("reminderConfig").then((result) => result.templateId || ""); },
  searchIcons(query) {
    return call("searchSubscriptionIcons", { query }).then((result) => result.candidates || []);
  },
  adoptMatchedIcon(trackId) {
    return call("adoptSubscriptionIcon", { trackId }).then((result) => result.fileId || "");
  },
  subscriptionIconUploadConfig() {
    return call("subscriptionIconUploadConfig").then((result) => result.pathPrefix || "");
  },
  remove(id) { return mutate("delete", { id }); },
  update(id, input) { return mutate("update", { id, input }); },
  updateStatus(id, operation, reminderEnabled, snoozeDays, options) {
    return mutate("updateStatus", Object.assign(
      { id, operation, reminderEnabled, snoozeDays },
      options || {},
    ));
  },
};
