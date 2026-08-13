/* global wx */

const SHARE_TITLE = "订序｜个人订阅与续费管理";
const SHARE_PATH = "/pages/index/index?source=share";
const SHARE_IMAGE = "/assets/share/dingxu-share-cover.jpg";

function enable() {
  if (typeof wx.showShareMenu !== "function") return;
  wx.showShareMenu({
    menus: ["shareAppMessage", "shareTimeline"],
    withShareTicket: false,
  });
}

function appMessage() {
  return {
    imageUrl: SHARE_IMAGE,
    title: SHARE_TITLE,
    path: SHARE_PATH,
  };
}

function timeline() {
  return {
    imageUrl: SHARE_IMAGE,
    title: SHARE_TITLE,
    query: "source=timeline",
  };
}

module.exports = { appMessage, enable, timeline };
