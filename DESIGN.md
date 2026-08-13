---
name: 订序轻盈云账本
description: 以电光紫、暖白玻璃与明确状态色组织个人订阅生命周期的微信小程序设计系统
colors:
  primary: "#5b5af7"
  primary-strong: "#4038c8"
  primary-soft: "#eeedff"
  secondary: "#8b5cf6"
  accent: "#22c7a9"
  success: "#12a678"
  success-soft: "#e5faf3"
  warning: "#c77a14"
  warning-soft: "#fff4cf"
  danger: "#e35468"
  danger-soft: "#fff0f3"
  ink: "#17152f"
  muted: "#706d82"
  line: "#e6e3f3"
  paper: "#f7f7ff"
  surface-muted: "#f2f1fb"
  white: "#ffffff"
typography:
  display:
    fontFamily: "sans-serif"
    fontSize: "54rpx"
    fontWeight: 900
    lineHeight: 1.14
    letterSpacing: "-2rpx"
  title:
    fontFamily: "sans-serif"
    fontSize: "29rpx"
    fontWeight: 850
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "sans-serif"
    fontSize: "25rpx"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "sans-serif"
    fontSize: "20rpx"
    fontWeight: 850
    lineHeight: 1.4
    letterSpacing: "3rpx"
rounded:
  field: "19rpx"
  icon: "24rpx"
  card: "28rpx"
  panel: "34rpx"
  nav: "38rpx"
  pill: "999rpx"
spacing:
  xs: "8rpx"
  sm: "12rpx"
  md: "18rpx"
  lg: "28rpx"
  xl: "34rpx"
  section: "48rpx"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    typography: "{typography.title}"
    rounded: "{rounded.pill}"
    height: "94rpx"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "88rpx"
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "10rpx 16rpx"
  surface-panel:
    backgroundColor: "rgba(255,255,255,.84)"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "28rpx"
---

# Design System: 订序轻盈云账本

## Overview

**Creative North Star: “会自动归位的轻盈订阅账本。”**

订序是一款服务个人用户的微信订阅管理工具。界面要同时具备账本的可信与年轻数字工具的轻盈：暖白页面承载内容，电光紫标识主操作与当前位置，薄荷、琥珀和柔红负责清楚表达订阅状态。视觉服务于“看清金额、看懂日期、立即处理”，不能压过信息本身。

现行系统只以微信小程序为实现基准。长列表保持轻量，液态玻璃只用于导航、表单区、日历、分析、账号中心等结构性表面，避免每张卡片都叠加模糊造成掉帧。

**Key Characteristics:**

- 明亮的紫色主轴，配合青绿点缀和柔和状态底色。
- 大标题、清晰金额、明确日期，说明文字不小于舒适阅读下限。
- 白色与半透明玻璃面板分层，圆角饱满但不臃肿。
- 动效只反馈点击和状态变化，不制造页面切换闪烁。

## Colors

### Primary

- `primary` 用于主按钮、当前导航、关键链接与选中态。
- `primary-strong` 用于需要更高对比的紫色文字和按压态。
- `primary-soft` 用于选中背景、次级按钮及柔和聚焦区域。

### Secondary

- `secondary` 只作为紫色层次补充，不与主操作争夺注意力。
- `accent` 用于新增、同步、安全等积极但非主流程的提示。

### Status

- `success` / `success-soft`：生效、已完成、已连接。
- `warning` / `warning-soft`：临近扣款、暂停、待确认。
- `danger` / `danger-soft`：取消、失败、删除等高风险动作。
- **The Text Plus Color Rule.** 状态不能只靠颜色表达，必须同时出现“生效中”“暂停中”“已取消”等文字。

### Neutral

- `paper` 是页面底色，`white` 是普通卡片底色，`surface-muted` 是输入区和弱分组底色。
- `ink` 承担标题、金额与重要操作；`muted` 承担说明；`line` 只做轻量分隔。
- 正文与底色保持至少 4.5:1 对比度，不使用低对比灰字模拟“高级感”。

## Typography

统一使用微信运行环境可用的系统无衬线字体 `sans-serif`，不下载第三方字体，不依赖有版权风险的字体文件。金额和数量应使用等宽数字能力时优先启用，但不改变中文排版。

### Hierarchy

- Display：54rpx / 900，用于页面主标题。
- Title：约 29rpx / 850，用于卡片标题、金额和主要操作。
- Body：25rpx / 1.6，用于说明和表单内容。
- Label：20rpx / 850 / 3rpx 字距，用于英文眉题和小型分组标签。
- **The Number First Rule.** 金额、日期、任务数量先于说明文字，单位降低一级但保持同行对齐。
- 小字说明原则上不低于 22rpx；关键状态和操作不低于 24rpx。

## Layout

- 页面水平内边距为 28rpx，顶部常规留白 34rpx，底部预留自定义导航和安全区。
- 主要内容采用单列信息流；仅统计摘要、短操作组可使用 2–3 列网格。
- 同组操作必须等高、等宽并完整落在卡片边界内，不允许按钮溢出或因为换行形成孤立第二行。
- 金额、服务名、周期和日期分别占据稳定区域；长名称必须省略或合理换行，不能挤压金额。
- **The One Task Per Surface Rule.** 一张面板只承担一个主要任务，次级信息通过分隔线和间距组织，不套多层卡片。

## Elevation & Depth

- 普通内容卡片以白色背景、轻边框和极弱阴影为主。
- 结构性面板使用半透明白色渐变、22rpx 模糊与柔和紫灰环境影，形成克制的液态玻璃层次。
- 总览主卡、消费汇总和账号卡可使用更深的紫色环境影，其他列表项不重复使用重阴影。
- **The Structural Glass Rule.** 模糊只用于结构表面；长列表中的每个订阅卡片保持实色，避免性能下降和视觉噪声。

## Shapes

- 输入框 19rpx，图标容器 24rpx，卡片约 28rpx，主面板 34rpx，底部导航 38rpx。
- 主次按钮和状态标签使用胶囊圆角；服务图标保持 24rpx 圆角或继承图标本身形状。
- 圆形只用于底栏新增按钮、小型状态点和必要的图标操作，不把所有内容做成圆形徽章。

## Components

### Buttons

- 主按钮使用紫色渐变、白色高字重文字和轻紫阴影，最低高度 94rpx。
- 次按钮使用 `primary-soft` 背景和 `primary-strong` 文字，最低高度 88rpx。
- 危险按钮使用柔红底、深红文字与清晰边界；不能只靠细红字表达删除操作。
- 按压反馈为 180ms 内轻微缩小和透明度变化，不改变布局尺寸。

### Chips

- 状态标签用低饱和底色搭配对应深色文字，保持短句且禁止仅放颜色点。
- 分类和筛选标签默认白底或弱紫底，选中后使用紫色实底或明显边框。

### Cards / Containers

- 订阅卡片必须在首屏露出服务图标、名称、人民币金额、账单周期和当前状态。
- 暂停卡片使用柔黄，计划取消卡片使用柔红，生效卡片使用白色或柔绿；状态变化要整卡可辨但不降低文字对比。
- 历史记录与归档信息使用中性表面，明确说明其不参与支出、日历和提醒统计。

### Inputs / Fields

- 输入区使用 `surface-muted` 或半透明浅紫底，边界在聚焦时转为 `primary`。
- 金额、币种、日期和周期应形成清晰成组关系；错误信息直接显示在字段附近，不用模态框代替表单校验。
- 可点击区域不小于 88rpx 高，选择图片、色盘、服务匹配等操作必须有加载和失败反馈。

### Navigation

- 自定义底栏使用半透明玻璃容器；当前文字位于紫色渐变胶囊内，新增按钮使用青绿到紫色渐变。
- 底栏文字 26rpx，四个页面入口与中间新增按钮保持视觉居中，不上浮、不闪烁。

### Renewal Flow

- 待确认、已续费、已取消、延后处理是订序的核心交互。主动作优先，次动作弱化，危险动作独立着色。
- 同一天多项续费可以合并提醒，但卡片详情必须逐项可管理。
- 取消后 7 天自动归档的日期必须直接显示，暂停状态不参与自动归档。

## Do's and Don'ts

### Do:

- Do 让金额、续费日期和订阅状态在扫视时立即可见。
- Do 使用同一套状态色贯穿总览、日历、分析、提醒中心和历史记录。
- Do 保持按钮、数字基线、卡片边界和多列摘要视觉对齐。
- Do 在低性能设备上优先保证滚动和点击响应。

### Don't:

- Don't 回退到旧版深色主题、奶油绿色账本或混用衬线金额字体。
- Don't 为装饰在长列表中重复使用模糊、复杂阴影或持续动画。
- Don't 使用弹窗展示本可直接展开或在页面内呈现的统计详情。
- Don't 通过修改账号隔离、提醒权限或数据逻辑来迁就视觉样式。
