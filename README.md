# 订序 · 微信小程序

个人订阅与续费管理小程序：记录订阅费用、续费日与处理状态，提供续费日历、消费分析、微信续费提醒，以及报告与 CSV 导出。数据存于微信云开发，按微信身份隔离。

## 目录结构

- `wechat-miniprogram/miniprogram/` — 小程序前端（页面、组件、services、utils）
- `wechat-miniprogram/cloudfunctions/subscriptionService/` — 云函数（数据读写、汇率、图标匹配、续费提醒定时任务）
- `tests/wechat-miniprogram.test.mjs` — 纯逻辑单元测试（工具函数、账单推算、状态机等）

## 开发与部署

1. 用微信开发者工具打开 `wechat-miniprogram/`，AppID：`wxa5a0b5d34c4f21fa`。
2. 在 `miniprogram/config.js` 配置云开发环境 ID。
3. 部署云函数 `subscriptionService`（选择云端安装依赖）。
4. 在公众平台「订阅消息」申请「续费提醒」模板，将模板 ID 填入 `cloudfunctions/subscriptionService/index.js` 的 `RENEWAL_TEMPLATE_ID`。
5. 在公众平台声明隐私协议（相册、用户信息），否则图片选择会被拦截。

## 测试

```bash
npm test
```

仅依赖 Node 内置 test runner（`>=22.13.0`），无需安装依赖。
