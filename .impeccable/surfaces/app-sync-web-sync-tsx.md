---
version: 1
slug: "app-sync-web-sync-tsx"
primary_target: "app/sync/web-sync.tsx"
related_targets: ["app/sync/sync.module.css","app/sync/page.tsx"]
---

# 网页同步账本

- **Scope / mode:** `/sync` 的操作型界面；已绑定时是订阅账本，未绑定时是一次性微信同步引导。
- **Audience / job:** 已使用订序小程序的个人用户，在桌面或手机浏览器快速核对订阅支出、续费日和状态。
- **Primary actions:** 生成并确认绑定码；绑定后处理订阅状态、查看日历和分析、导出账单。
- **Proof / content:** 真实云端订阅记录、金额、日期和状态；不制造商业数据。
- **Constraints:** 网页不能新增订阅或授权微信提醒；不展示 OPENID；移动端必须单列且无横向溢出。
- **Direction:** 深色金融封套包裹浅色数字账页；主金额贯穿两行，两个次指标上下归位，订阅以流水行呈现，紫/薄荷/黄/珊瑚承担行动和状态。
- **Memorable moment:** 首次进入时，账页像从封套中展开，摘要数字依次归位；切换页签时内容完成一次短促“对账”，而不是整页闪烁。
- **Unresolved:** 后续可在真实登录数据下继续验证超长订阅名称和 50–100 条记录的密度。
