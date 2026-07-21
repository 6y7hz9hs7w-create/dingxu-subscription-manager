/* global getApp, wx */
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

module.exports = {
  add(input) { return call("add", { input }); },
  clearAll() { return call("clearAll"); },
  list() { return call("list").then((result) => result.subscriptions || []); },
  updateStatus(id, operation) { return call("updateStatus", { id, operation }); },
};
