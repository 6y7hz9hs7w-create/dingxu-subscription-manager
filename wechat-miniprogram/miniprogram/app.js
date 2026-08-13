/* eslint-disable @typescript-eslint/no-require-imports */
/* global App, wx */
const config = require("./config");
const LOGIN_REFRESH_TTL = 60000;

App({
  globalData: {
    pendingSubscriptionEdit: null,
    pendingSubscriptionFocusId: "",
    pendingRenewalFlow: null,
    user: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      this.loginPromise = Promise.reject(new Error("当前微信版本不支持云开发，请升级微信后重试"));
      this.loginPromise.catch(() => {});
      return;
    }

    const options = { traceUser: true };
    if (config.cloudEnvId) options.env = config.cloudEnvId;
    wx.cloud.init(options);
    this.startLogin().catch(() => {});
  },

  startLogin() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = wx.cloud.callFunction({
      name: "subscriptionService",
      data: { action: "login" },
    }).then(({ result }) => {
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "登录失败");
      this.globalData.user = result.user;
      this.loginUpdatedAt = Date.now();
      return result.user;
    }).catch((error) => {
      this.loginPromise = null;
      throw error;
    });
    return this.loginPromise;
  },

  ensureLogin() {
    return this.startLogin();
  },

  refreshLogin(options) {
    const force = Boolean(options && options.force);
    if (!force && this.globalData.user && Date.now() - Number(this.loginUpdatedAt || 0) < LOGIN_REFRESH_TTL) {
      return Promise.resolve(this.globalData.user);
    }
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.globalData.user && this.loginPromise) return this.loginPromise;
    this.loginPromise = null;
    const request = this.startLogin();
    this.refreshPromise = request;
    return request.finally(() => {
      if (this.refreshPromise === request) this.refreshPromise = null;
    });
  },

  updateUser(user) {
    this.globalData.user = user;
    this.loginPromise = Promise.resolve(user);
    this.loginUpdatedAt = Date.now();
    this.refreshPromise = null;
    return user;
  },
});
