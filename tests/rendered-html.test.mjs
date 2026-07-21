import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("subscription manager ships its core flows", async () => {
  const [page, app, api, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/subscription-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/subscriptions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<SubscriptionApp \/>/);
  assert.match(app, /本月订阅支出/);
  assert.match(app, /即将续费/);
  assert.match(app, /添加并开启提醒/);
  assert.match(app, /const fallbackSubscriptions: Subscription\[\] = \[\]/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.match(api, /export async function (GET|POST|PATCH)/);
  assert.doesNotMatch(api + app, /爱奇艺|iCloud|网易云|Apple Music|许同学|seedRows/);
  assert.match(layout, /og\.png/);
  assert.match(css, /@media \(max-width:620px\)/);
  assert.doesNotMatch(page + app + layout, /codex-preview|react-loading-skeleton|SkeletonPreview/);
});
