/* eslint-disable @typescript-eslint/no-require-imports */
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const subscriptions = db.collection("subscriptions");

const COLORS = new Set(["#FFE46B", "#B8DBFF", "#FFB9AE", "#CDEB7B", "#D8D2C6", "#FFC1D3"]);
const CATEGORIES = new Set(["影音娱乐", "音乐", "效率工具", "云存储", "健康运动", "其他"]);

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: "无法识别当前微信用户" };

  try {
    switch (event.action) {
      case "login":
        return { ok: true, user: { idHint: maskOpenId(OPENID) } };
      case "list":
        return listSubscriptions(OPENID);
      case "add":
        return addSubscription(OPENID, event.input);
      case "updateStatus":
        return updateStatus(OPENID, event.id, event.operation);
      case "clearAll":
        return clearAll(OPENID);
      default:
        return { ok: false, error: "不支持的操作" };
    }
  } catch (error) {
    console.error("subscriptionService failed", { action: event.action, message: error.message });
    if (String(error.errCode || "").includes("COLLECTION_NOT_EXIST") || String(error.message || "").includes("collection not exists")) {
      return { ok: false, error: "请先在云开发数据库创建 subscriptions 集合" };
    }
    return { ok: false, error: "服务暂时不可用，请稍后再试" };
  }
};

async function listSubscriptions(ownerOpenid) {
  const result = await subscriptions.where({ ownerOpenid }).orderBy("nextChargeDate", "asc").limit(100).get();
  return { ok: true, subscriptions: result.data.map(stripPrivateFields) };
}

async function addSubscription(ownerOpenid, input) {
  const item = validateInput(input);
  const result = await subscriptions.add({
    data: Object.assign({}, item, {
      ownerOpenid,
      status: "active",
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    }),
  });
  return { ok: true, id: result._id };
}

async function updateStatus(ownerOpenid, id, operation) {
  if (typeof id !== "string" || !id || !["cancel", "restore", "renew"].includes(operation)) {
    return { ok: false, error: "操作无效" };
  }
  const current = await subscriptions.doc(id).get();
  if (!current.data || current.data.ownerOpenid !== ownerOpenid) return { ok: false, error: "订阅不存在" };

  const data = { updatedAt: db.serverDate() };
  if (operation === "cancel") data.status = "cancel_pending";
  if (operation === "restore") data.status = "active";
  if (operation === "renew") {
    data.status = "active";
    data.nextChargeDate = advanceDate(current.data.nextChargeDate, current.data.billingCycle);
  }
  await subscriptions.doc(id).update({ data });
  return { ok: true };
}

async function clearAll(ownerOpenid) {
  const result = await subscriptions.where({ ownerOpenid }).limit(100).get();
  await Promise.all(result.data.map((item) => subscriptions.doc(item._id).remove()));
  return { ok: true, removed: result.data.length };
}

function validateInput(input) {
  if (!input || typeof input !== "object") throw new Error("invalid input");
  const name = String(input.name || "").trim().slice(0, 60);
  const category = CATEGORIES.has(input.category) ? input.category : "其他";
  const amountCents = Math.round(Number(input.amountCents));
  const billingCycle = input.billingCycle === "yearly" ? "yearly" : "monthly";
  const nextChargeDate = String(input.nextChargeDate || "");
  const reminderDays = [1, 3, 5, 7].includes(Number(input.reminderDays)) ? Number(input.reminderDays) : 3;
  const color = COLORS.has(input.color) ? input.color : "#FFE46B";
  const note = String(input.note || "").trim().slice(0, 120);

  if (!name || !Number.isInteger(amountCents) || amountCents < 1 || amountCents > 100000000) throw new Error("invalid input");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate) || Number.isNaN(new Date(`${nextChargeDate}T00:00:00`).getTime())) throw new Error("invalid input");
  return { name, category, amountCents, billingCycle, nextChargeDate, reminderDays, color, note, mark: name.slice(0, 1) };
}

function advanceDate(value, cycle) {
  const date = new Date(`${value}T00:00:00Z`);
  if (cycle === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function stripPrivateFields(item) {
  const safe = Object.assign({}, item);
  delete safe.ownerOpenid;
  delete safe._openid;
  return safe;
}

function maskOpenId(openid) {
  return `${openid.slice(0, 4)}••••${openid.slice(-4)}`;
}
