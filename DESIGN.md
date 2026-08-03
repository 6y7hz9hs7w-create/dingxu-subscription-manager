---
name: 订序数字账本
description: 年轻、清晰、可持续维护的个人订阅账本设计系统
colors:
  electric-violet: "#5d4df5"
  violet-deep: "#3528be"
  ledger-ink: "#201d32"
  secondary-ink: "#6c687a"
  paper-white: "#fffefd"
  ledger-canvas: "#f1f0f6"
  divider: "#dedbe9"
  fresh-mint: "#bdf0d0"
  due-yellow: "#ffd86a"
  action-coral: "#ff8f7b"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(32px, 5vw, 50px)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.45
rounded:
  control: "10px"
  panel: "14px"
  shell: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  xl: "44px"
components:
  button-primary:
    backgroundColor: "{colors.electric-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.panel}"
    height: "56px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "{colors.ledger-ink}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 18px"
  card-ledger:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.ledger-ink}"
    rounded: "{rounded.shell}"
    padding: "44px"
  chip-active:
    backgroundColor: "{colors.fresh-mint}"
    textColor: "#176342"
    rounded: "{rounded.pill}"
    padding: "5px 9px"
---

# Design System: 订序数字账本

## Overview

**Creative North Star: "会自己归位的高定数字账本"**

订序把记账网站的可信和年轻工具的鲜活放进“深色金融封套 + 浅色账页”的材质关系里。金额、续费日和状态永远先于装饰；电紫负责行动与导航，薄荷、黄色和珊瑚色像账页索引一样快速区分生命周期。

视觉保持清晰、克制且有深浅层级，不使用模糊玻璃、堆叠指标墙或与数据无关的装饰。桌面端像一本从深色封套中展开的账页，移动端则自然折叠为单列操作流。

**Key Characteristics:**
- 金额优先、状态可扫读、操作风险明确。
- 深色封套、暖白账页和精细边界建立高级但可信的记账场景。
- 高饱和色只承担行动或状态，不覆盖大段正文。
- 系统无衬线字体保证中文清晰且无额外字体授权负担。

## Colors

主色克制而鲜明，辅助色承担账单状态，不把颜色当作纯装饰。

### Primary
- **电光紫：** 主操作、选中导航和同步绑定流程。
- **深账本墨：** 主要文字与高权重金额区域。

### Secondary
- **清新薄荷：** 生效中、已连接和稳定状态。
- **到期黄：** 暂停、待关注和年度账单等中性提醒。
- **行动珊瑚：** 取消、待确认和危险操作。

### Neutral
- **纸张白：** 主工作区。
- **账页灰：** 页面背景与横线承载层。
- **次要墨：** 说明文字。
- **分隔线：** 流水、标签页和时间线边界。

**The Status Has a Color Rule.** 相同状态在指标、列表和操作提示中使用同一颜色语义；不要为同一状态创造第二套颜色。

## Typography

**Display Font:** 系统无衬线字体栈
**Body Font:** 系统无衬线字体栈

**Character:** 紧凑、直接、可读；金额使用等宽数字特性，标题通过字重和负字距形成年轻感，而不是依赖装饰字体。

### Hierarchy
- **Display：** 页面主标题与绑定主张，短句，不超过约 15 个汉字宽度。
- **Title：** 区块标题和关键账目标题。
- **Body：** 说明和操作引导，保持舒适行高。
- **Label：** 状态、金额标题和导航，使用较高字重提高扫读效率。

**The Number First Rule.** 金额和数量的字号层级必须高于其说明文字；人民币金额使用制表数字对齐。

## Layout

桌面端使用最大 1160px 的单一账本工作区，深色页头、摘要、导航和流水按纵向阅读顺序展开。摘要采用左侧主金额贯穿两行、右侧两个紧凑指标上下排列的非等权布局。移动端在 760px 以下切为单列：主金额独占一行，次指标并排，操作按钮保持至少 42px 高。常用节奏为 8px 倍数，区块间距明显大于组件内部间距。

## Elevation & Depth

系统以边界和色块分层为主，只在整页容器、主操作和临时保存提示上使用柔和环境阴影。列表项和内容面板保持平整，以维持账本的连续性。

### Shadow Vocabulary
- **工作区环境影：** `0 34px 90px rgba(0, 0, 0, .42)`，仅用于桌面端深色背景上的主账页。
- **主操作浮层影：** `0 14px 30px rgba(108, 85, 255, .25)`，用于主按钮及其悬停反馈。

**The Flat Ledger Rule.** 流水记录在静止状态不使用卡片阴影；层级由分隔线、留白和状态色条完成。

## Shapes

外层账页使用 20px 圆角；功能面板和金额块使用 14px；按钮与输入使用 10–12px；状态使用胶囊形。品牌标记保留一个削弱的左下角，制造可识别的手账标签轮廓。

## Motion

动效表达“账目自动归位”，不承担装饰。首次进入时，账页从深色封套中以裁切方式展开；三个摘要指标依次归位；切换订阅、日历和分析时，内容以短距离位移与裁切保持上下文连续。图表只在进入分析页时从左向右完成一次对账动画。常规反馈控制在 140–380ms，首次账页展开不超过 720ms；全部动效使用 CSS，并在 `prefers-reduced-motion` 下关闭。

## Components

### Buttons
- **Shape:** 10–12px 圆角，主要按钮高度 56px，移动端保持可点击面积。
- **Primary:** 电光紫底、白字，承担绑定和确认操作。
- **Hover / Focus:** 悬停轻微上移并增加柔和阴影；键盘焦点使用清晰紫色外轮廓。
- **Secondary:** 深墨色底，用于导出等高权重但非主流程动作。
- **Danger:** 珊瑚浅底配深红文字，永不与普通操作共用颜色。

### Chips
- **Style:** 胶囊形、紧凑内边距；状态色直接对应订阅生命周期。

### Cards / Containers
- **Corner Style:** 外层 20px，内部数据块 14px。
- **Background:** 纸张白为基础，薄荷、黄色和深墨用于高权重摘要。
- **Shadow Strategy:** 仅外层工作区有环境影，列表和面板保持平整。
- **Border:** 使用单像素冷灰分隔线。

### Navigation
- 横向文字标签配底部紫色短线；移动端可横向滚动但不显示滚动条。

### Subscription Ledger Row
- 每项订阅是一条流水：左侧服务缩写，中间名称与分类，右侧金额与状态。
- 最左侧 5px 状态色条用于快速扫描，状态文字仍需完整显示，不能只依赖颜色。

## Do's and Don'ts

### Do:
- **Do** 让金额、日期和状态保持首屏可见。
- **Do** 在相同状态之间复用同一种颜色和文案。
- **Do** 优先使用分隔线和留白组织长列表。
- **Do** 在 760px 以下切换为单列并保持按钮可点击尺寸。

### Don't:
- **Don't** 把所有数字做成相同权重的企业仪表盘卡片。
- **Don't** 使用模糊玻璃、发光边缘或无意义渐变削弱账单可读性。
- **Don't** 只用颜色表达取消、暂停或失败状态。
- **Don't** 把危险操作做成与确认操作相同的样式。
