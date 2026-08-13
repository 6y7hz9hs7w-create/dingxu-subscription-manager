/* global wx */
/* eslint-disable @typescript-eslint/no-require-imports */
const subscriptions = require("./subscriptions");

let templateId = "";
let configLoaded = false;
let configRequest = null;

function preload() {
  if (configLoaded) return Promise.resolve(templateId);
  if (configRequest) return configRequest;
  configRequest = subscriptions.reminderConfig().then((value) => {
    templateId = value || "";
    configLoaded = true;
    return templateId;
  }).catch(() => {
    configLoaded = false;
    return "";
  }).finally(() => {
    configRequest = null;
  });
  return configRequest;
}

function request() {
  return preload().then((id) => {
    if (!id) return { enabled: false, reason: configLoaded ? "unconfigured" : "failed" };
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: [id],
        success(result) {
          resolve({ enabled: result[id] === "accept", reason: result[id] || "unknown" });
        },
        fail() {
          resolve({ enabled: false, reason: "failed" });
        },
      });
    });
  });
}

module.exports = { preload, request };
