import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("subscription manager ships its core flows", async () => {
  const [page, app, api, auth, schema, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/subscription-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/subscriptions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /getChatGPTUser/);
  assert.match(page, /signInPath=/);
  assert.match(app, /本月订阅支出/);
  assert.match(app, /即将续费/);
  assert.match(app, /添加并开启提醒/);
  assert.match(app, /setShowCalendar\(true\)/);
  assert.match(app, /RENEWAL CALENDAR/);
  assert.match(app, /本月续费/);
  assert.match(app, /setShowInsights\(true\)/);
  assert.match(app, /SPENDING INSIGHTS/);
  assert.match(app, /消费结构/);
  assert.match(app, /className="color-picker"/);
  assert.match(app, /type="radio" name="color"/);
  assert.match(app, /ACCOUNT CENTER/);
  assert.match(app, /使用 ChatGPT 账号登录/);
  assert.match(app, /独立数据空间/);
  assert.doesNotMatch(app, /颜色 \{i \+ 1\}/);
  assert.match(app, /const fallbackSubscriptions: Subscription\[\] = \[\]/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.match(api, /export async function (GET|POST|PATCH)/);
  assert.match(api, /WHERE owner_email = \?/);
  assert.match(api, /AND owner_email = \?/);
  assert.match(api, /status: 401/);
  assert.match(auth, /oai-authenticated-user-email/);
  assert.match(schema, /ownerEmail: text\("owner_email"\)/);
  assert.doesNotMatch(app + api, /Resend|验证码|api\/auth\/email/);
  assert.doesNotMatch(api + app, /爱奇艺|iCloud|网易云|Apple Music|许同学|seedRows/);
  assert.match(app, /订序/);
  assert.doesNotMatch(app + page + layout, new RegExp("续" + "续|小" + "续"));
  assert.match(layout, /og-dingxu\.png/);
  assert.match(css, /@media \(max-width:620px\)/);
  assert.doesNotMatch(page + app + layout, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});

test("web sync uses a WeChat-confirmed server session without exposing OPENID", async () => {
  const [page, client, api, styles] = await Promise.all([
    readFile(new URL("../app/sync/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sync/web-sync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cloud-sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sync/sync.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /WebSync/);
  assert.match(client, /生成微信绑定码/);
  assert.match(client, /小程序确认/);
  assert.match(client, /订阅管理/);
  assert.match(client, /续费日历/);
  assert.match(client, /消费分析/);
  assert.match(client, /导出账单/);
  assert.match(client, /月均订阅支出/);
  assert.match(client, /订阅流水/);
  assert.match(api, /updateStatus/);
  assert.match(api, /delete/);
  assert.match(api, /httpOnly: true/);
  assert.match(api, /sameSite: "strict"/);
  assert.match(api, /CLOUDBASE_SYNC_SECRET/);
  assert.doesNotMatch(client + api, /ownerOpenid|OPENID/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
