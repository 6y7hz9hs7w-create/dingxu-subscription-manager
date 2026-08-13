/* global setTimeout, wx */
/* eslint-disable @typescript-eslint/no-require-imports */
const reports = require("../utils/reports");
const PAGE_SIZE = 14;
const WIDTH = 375;
const HEIGHT = 680;
const SCALE = 2;

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(context, x, y, width, height, radius, color) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = color;
  context.fill();
}

function fittedText(context, text, maxWidth) {
  const value = String(text || "");
  if (context.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (output.length && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
  return `${output}…`;
}

function drawPage(canvas, report, rows, pageIndex, pageCount) {
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  context.scale(SCALE, SCALE);
  context.fillStyle = "#f6f3eb";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  fillRoundedRect(context, 18, 18, 339, 162, 22, "#124c3e");
  context.fillStyle = "#93b4a8";
  context.font = "700 9px sans-serif";
  context.fillText("订序 · SUBSCRIPTION REPORT", 36, 43);
  context.textAlign = "right";
  context.fillText(`${pageIndex + 1} / ${pageCount}`, 339, 43);
  context.textAlign = "left";
  context.fillStyle = "#ffffff";
  context.font = "800 25px sans-serif";
  context.fillText(fittedText(context, report.title, 300), 36, 77);
  context.fillStyle = "#bbd0c8";
  context.font = "500 11px sans-serif";
  context.fillText(fittedText(context, report.subtitle, 300), 36, 99);
  context.fillStyle = "#f4d46f";
  context.font = "800 29px sans-serif";
  context.fillText(report.metricValue, 36, 143);
  context.fillStyle = "#b9cec6";
  context.font = "600 10px sans-serif";
  context.fillText(report.metricLabel, 36, 162);

  if (!rows.length) {
    fillRoundedRect(context, 18, 202, 339, 116, 18, "#ffffff");
    context.fillStyle = "#264d41";
    context.font = "800 16px sans-serif";
    context.textAlign = "center";
    context.fillText("当前没有符合条件的订阅", 187.5, 255);
    context.fillStyle = "#829089";
    context.font = "500 11px sans-serif";
    context.fillText("之后新增或续费的订阅会出现在这里", 187.5, 280);
    context.textAlign = "left";
  } else {
    rows.forEach((row, index) => {
      const column = index >= 7 ? 1 : 0;
      const rowIndex = index % 7;
      const x = column ? 192 : 18;
      const y = 202 + rowIndex * 62;
      fillRoundedRect(context, x, y, 165, 54, 14, "#ffffff");
      context.fillStyle = "#153f34";
      context.font = "800 12px sans-serif";
      context.fillText(fittedText(context, row.title, 91), x + 12, y + 20);
      context.fillStyle = "#2f6755";
      context.font = "800 10px sans-serif";
      context.textAlign = "right";
      context.fillText(fittedText(context, row.value, 55), x + 153, y + 20);
      context.textAlign = "left";
      context.fillStyle = "#7f8c86";
      context.font = "500 8px sans-serif";
      context.fillText(fittedText(context, row.meta, 141), x + 12, y + 40);
    });
  }

  context.fillStyle = "#89948f";
  context.font = "500 8px sans-serif";
  context.fillText("数据由订序根据当前订阅记录生成", 18, 659);
  context.textAlign = "right";
  context.fillText(new Date().toLocaleDateString("zh-CN"), 357, 659);
  context.textAlign = "left";
}

function writeCsv(report) {
  const filePath = `${wx.env.USER_DATA_PATH}/${report.fileName}`;
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      data: report.csv,
      encoding: "utf8",
      filePath,
      fail: reject,
      success: () => resolve(filePath),
    });
  });
}

function canvasNode(page) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select("#reportCanvas").fields({ node: true, size: true }).exec((result) => {
      const canvas = result && result[0] && result[0].node;
      if (canvas) resolve(canvas);
      else reject(new Error("报告画布尚未准备好"));
    });
  });
}

function canvasFile(canvas) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: "png",
        quality: 1,
        fail: reject,
        success: ({ tempFilePath }) => resolve(tempFilePath),
      });
    }, 30);
  });
}

async function createImages(page, report) {
  const canvas = await canvasNode(page);
  const paths = [];
  const pageCount = Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const rows = report.rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
    drawPage(canvas, report, rows, pageIndex, pageCount);
    paths.push(await canvasFile(canvas));
  }
  return paths;
}

module.exports = { buildReport: reports.buildReport, createImages, writeCsv };
