import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../wechat-miniprogram/", import.meta.url);

test("WeChat mini program uses server-owned silent identity", async () => {
  const [projectText, appText, appConfigText, serviceText, cloudText, packageText, indexText, calendarText, insightsText, settingsText] = await Promise.all([
    readFile(new URL("project.config.json", root), "utf8"),
    readFile(new URL("miniprogram/app.js", root), "utf8"),
    readFile(new URL("miniprogram/app.json", root), "utf8"),
    readFile(new URL("miniprogram/services/subscriptions.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/index.js", root), "utf8"),
    readFile(new URL("cloudfunctions/subscriptionService/package.json", root), "utf8"),
    readFile(new URL("miniprogram/pages/index/index.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/calendar/calendar.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/insights/insights.wxml", root), "utf8"),
    readFile(new URL("miniprogram/pages/settings/settings.wxml", root), "utf8"),
  ]);

  const project = JSON.parse(projectText);
  const appConfig = JSON.parse(appConfigText);
  const cloudPackage = JSON.parse(packageText);
  assert.equal(project.appid, "wxa5a0b5d34c4f21fa");
  assert.equal(project.miniprogramRoot, "miniprogram/");
  assert.equal(project.cloudfunctionRoot, "cloudfunctions/");
  assert.equal(appConfig.tabBar.list.length, 4);
  assert.equal(cloudPackage.dependencies["wx-server-sdk"], "4.0.2");
  assert.match(appText, /wx\.cloud\.init/);
  assert.match(appText, /action: "login"/);
  assert.match(serviceText, /ensureLogin/);
  assert.match(cloudText, /cloud\.getWXContext\(\)/);
  assert.match(cloudText, /where\(\{ ownerOpenid \}\)/);
  assert.match(cloudText, /current\.data\.ownerOpenid !== ownerOpenid/);
  assert.doesNotMatch(cloudText + appText + serviceText, /AppSecret|appsecret|getPhoneNumber|phoneNumber/);
  assert.match(indexText, /添加订阅/);
  assert.match(calendarText, /续费日历/);
  assert.match(insightsText, /消费分析/);
  assert.match(settingsText, /无感登录已开启/);
  assert.match(settingsText, /不获取手机号/);
});
