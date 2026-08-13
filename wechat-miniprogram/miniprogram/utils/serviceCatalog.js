const SERVICE_PLACEHOLDER = "请选择常用服务";
const CUSTOM_SERVICE = "自定义服务";

const logoByService = {
  "Apple Music": "/assets/services/applemusic.png",
  "Apple Fitness+": "/assets/services/applefitness.png",
  "Canva Pro": "/assets/services/canva.png",
  "ChatGPT Plus": "/assets/services/chatgpt.png",
  Dropbox: "/assets/services/dropbox.png",
  "iCloud+": "/assets/services/icloud.png",
  "Google One": "/assets/services/googleone.png",
  "Keep会员": "/assets/services/keep.png",
  "Microsoft 365": "/assets/services/microsoft365.png",
  Netflix: "/assets/services/netflix.png",
  Notion: "/assets/services/notion.png",
  OneDrive: "/assets/services/onedrive.png",
  Spotify: "/assets/services/spotify.png",
  Strava: "/assets/services/strava.png",
  "WPS会员": "/assets/services/wps.png",
  QQ音乐: "/assets/services/qqmusic.png",
  百度网盘: "/assets/services/baidu.png",
  阿里云盘: "/assets/services/alibabacloud.png",
  爱奇艺: "/assets/services/iqiyi.png",
  哔哩哔哩大会员: "/assets/services/bilibili.png",
  薄荷健康: "/assets/services/bohe.png",
  得到听书: "/assets/services/dedao.png",
  滴答清单: "/assets/services/ticktick.png",
  京东PLUS: "/assets/services/jd.png",
  酷狗音乐: "/assets/services/kugou.png",
  芒果TV: "/assets/services/mangotv.png",
  美团会员: "/assets/services/meituan.png",
  网易云音乐: "/assets/services/neteasecloudmusic.png",
  腾讯视频: "/assets/services/tencentvideo.png",
  淘宝88VIP: "/assets/services/taobao.png",
  喜马拉雅: "/assets/services/ximalaya.png",
  优酷: "/assets/services/youku.png",
  咕咚: "/assets/services/gudong.png",
  饿了么超级吃货卡: "/assets/services/eleme.png",
  知乎盐选会员: "/assets/services/zhihu.png",
};

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

const knownServiceNames = Object.keys(logoByService);

function optionsForCategory(category) {
  const services = servicesByCategory[category] || [];
  return [SERVICE_PLACEHOLDER].concat(services, CUSTOM_SERVICE);
}

function servicesForCategory(category) {
  return (servicesByCategory[category] || []).slice();
}

function logoForService(name) {
  const serviceName = String(name || "").trim();
  if (!serviceName) return "";
  if (logoByService[serviceName]) return logoByService[serviceName];
  const matchedName = knownServiceNames.find((knownName) => (
    serviceName.includes(knownName)
    || (serviceName.length >= 2 && knownName.includes(serviceName))
  ));
  return matchedName ? logoByService[matchedName] : "";
}

module.exports = {
  CUSTOM_SERVICE,
  logoForService,
  optionsForCategory,
  servicesForCategory,
};
