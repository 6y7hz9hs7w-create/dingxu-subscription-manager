const CHANNEL_STEPS = {
  wechat: [
    "打开微信，进入「我 → 服务 → 钱包 → 支付设置 → 自动续费」",
    "找到对应服务，核对商户名称与扣费金额",
    "按页面提示关闭自动续费，并保留关闭结果",
  ],
  alipay: [
    "打开支付宝，进入「我的 → 设置 → 支付设置 → 免密支付/自动扣款」",
    "找到对应服务，核对商户名称与扣费金额",
    "按页面提示关闭自动扣款，并保留关闭结果",
  ],
  apple: [
    "打开 iPhone「设置」，点顶部 Apple 账户",
    "进入「订阅」，找到对应服务",
    "选择取消订阅，并确认到期日期",
  ],
  other: [
    "打开对应服务，进入「我的 → 会员中心」",
    "查找「自动续费、续费管理或订阅管理」",
    "核对当前方案后关闭自动续费；若找不到，请检查实际扣款渠道",
  ],
};

const SERVICES = [
  ["腾讯视频", ["腾讯视频vip", "腾讯视频会员"]],
  ["爱奇艺", ["爱奇艺vip", "爱奇艺会员"]],
  ["优酷", ["优酷vip", "优酷会员"]],
  ["芒果TV", ["芒果tv会员", "芒果会员"]],
  ["哔哩哔哩大会员", ["bilibili", "哔哩哔哩", "b站大会员"]],
  ["QQ音乐", ["qq音乐会员", "qqmusic"]],
  ["网易云音乐", ["网易云", "黑胶vip"]],
  ["喜马拉雅", ["喜马拉雅会员"]],
  ["微信读书无限卡", ["微信读书", "无限卡"]],
  ["百度网盘", ["百度云", "百度网盘会员"]],
  ["叮咚买菜绿卡", ["叮咚买菜", "叮咚绿卡"]],
  ["夸克网盘", ["夸克", "夸克会员"]],
  ["WPS会员", ["wps", "wps超级会员"]],
  ["迅雷会员", ["迅雷"]],
  ["淘宝88VIP", ["88vip", "淘宝88vip"]],
  ["京东PLUS", ["京东plus会员", "京东会员"]],
  ["美团会员", ["美团"]],
  ["饿了么超级吃货卡", ["饿了么", "超级吃货卡"]],
  ["剪映VIP", ["剪映", "剪映会员"]],
  ["盒马X会员", ["盒马会员", "盒马x会员"]],
].map(([name, aliases]) => ({
  name,
  aliases: [name].concat(aliases),
  // 只有核验过的 appId 才可填写。空值必须回退到操作步骤，禁止猜测跳转目标。
  miniProgram: null,
}));

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s·_\-—()（）]+/g, "");
}

// 别名归一化只做一次；匹配会在每张订阅卡片上重复调用。
const NORMALIZED_ALIASES = SERVICES.map((service) => service.aliases.map(normalized));

function find(value) {
  const query = normalized(value);
  if (!query) return null;
  const index = NORMALIZED_ALIASES.findIndex((aliases) => aliases.some((candidate) => (
    query === candidate || query.includes(candidate) || candidate.includes(query)
  )));
  return index >= 0 ? SERVICES[index] : null;
}

function guideFor(item) {
  const service = find(item && item.name);
  if (!service) return null;
  const channel = CHANNEL_STEPS[item.paymentChannel] ? item.paymentChannel : "other";
  const cancelSteps = CHANNEL_STEPS[channel].map((step) => step.replace("对应服务", `「${service.name}」`));
  const renewSteps = [
    `打开「${service.name}」官方应用或小程序，进入会员中心`,
    "核对会员方案、实际价格、续费周期和优惠有效期",
    "通过官方页面完成续费；返回订序后再确认结果",
  ];
  return {
    name: service.name,
    cancelSteps,
    renewSteps,
    miniProgram: service.miniProgram,
    directSupported: Boolean(service.miniProgram && service.miniProgram.appId),
    copyText: [
      `${service.name}续费/取消指引`,
      "关闭自动续费：",
      ...cancelSteps.map((step, index) => `${index + 1}. ${step}`),
      "重新续费：",
      ...renewSteps.map((step, index) => `${index + 1}. ${step}`),
      "页面路径可能随服务商调整，请以官方页面为准。",
    ].join("\n"),
  };
}

module.exports = { SERVICES, find, guideFor };
