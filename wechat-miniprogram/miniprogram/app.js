/* eslint-disable @typescript-eslint/no-require-imports */
/* global App, wx */
const config = require("./config");

App({
  globalData: {
    loginError: "",
    user: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      this.globalData.loginError = "当前微信版本不支持云开发，请升级微信后重试";
      this.loginPromise = Promise.reject(new Error(this.globalData.loginError));
      return;
    }

    const options = { traceUser: true };
    if (config.cloudEnvId) options.env = config.cloudEnvId;
    wx.cloud.init(options);
    this.loginPromise = wx.cloud.callFunction({
      name: "subscriptionService",
      data: { action: "login" },
    }).then(({ result }) => {
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "登录失败");
      this.globalData.user = result.user;
      return result.user;
    }).catch((error) => {
      this.globalData.loginError = error.message || "登录失败";
      throw error;
    });
  },

  ensureLogin() {
    return this.loginPromise;
  },
});
