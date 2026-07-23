const SERVICE_PLACEHOLDER = "请选择常用服务";
const CUSTOM_SERVICE = "自定义服务";

const servicesByCategory = {
  影音娱乐: [
    "腾讯视频",
    "爱奇艺",
    "优酷",
    "哔哩哔哩大会员",
    "芒果TV",
    "网易云音乐",
    "QQ音乐",
    "Netflix",
  ],
  音乐: [
    "网易云音乐",
    "QQ音乐",
    "Apple Music",
    "Spotify",
    "酷狗音乐",
    "喜马拉雅",
  ],
  效率工具: [
    "ChatGPT Plus",
    "Notion",
    "WPS会员",
    "Microsoft 365",
    "滴答清单",
    "Canva Pro",
  ],
  云存储: [
    "iCloud+",
    "百度网盘",
    "阿里云盘",
    "OneDrive",
    "Google One",
    "Dropbox",
  ],
  健康运动: [
    "Keep会员",
    "Apple Fitness+",
    "Strava",
    "咕咚",
    "薄荷健康",
  ],
  其他: [
    "京东PLUS",
    "淘宝88VIP",
    "美团会员",
    "饿了么超级吃货卡",
    "知乎盐选会员",
    "得到听书",
  ],
};

function optionsForCategory(category) {
  const services = servicesByCategory[category] || [];
  return [SERVICE_PLACEHOLDER].concat(services, CUSTOM_SERVICE);
}

module.exports = {
  CUSTOM_SERVICE,
  SERVICE_PLACEHOLDER,
  optionsForCategory,
  servicesByCategory,
};
