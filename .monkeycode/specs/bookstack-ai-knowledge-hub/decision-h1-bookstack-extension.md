# BookStack 前端挂载决策记录

- Status: `approved`
- Scope: H1 / B1 / B4
- Updated: 2026-07-04

## 已确认结论

- 顶部次入口固定为 `header-links-start` 首项。
- 页面主入口固定为 `pages.parts.show-sidebar-section-actions` 之后。
- 资源注入固定为“样式走 `head/`，脚本走 `base-body-end` 并显式带 `nonce`”。

## 背景

BookStack-AI 当前已经具备独立的扩展层接口、AI Gateway 骨架、索引链路骨架和流式问答协议，但还没有真正挂载到 BookStack 页面中。

当前阶段的实施策略已经明确为：

- 前端优先
- 低侵入挂载
- 暂缓真实模型

因此 H1 的目标是先在 BookStack 现有页面体系中，以升级影响尽量小的方式落下两个入口：

- 页面内的 AI 问答主入口
- 全局顶部的 AI 问答次入口

同时保留后续把 stub 推理替换为真实模型调用的空间。

## 备选方案

### 方案 A. 基于 Theme Module 的低侵入扩展

做法：

- 使用 BookStack 官方 theme/module 体系创建独立模块。
- 使用 `ThemeEvents::THEME_REGISTER_VIEWS` 向已有视图前后插入自定义视图。
- 使用占位视图 `layouts.parts.header-links-start`、`layouts.parts.base-body-end` 等低风险切入点补入口与资源加载。
- 使用模块 `head/` 和 `public/` 提供样式、脚本和静态资源。

优点：

- 与 BookStack 官方扩展机制一致。
- 可以避免直接改核心源码。
- 可以把顶部入口、侧边栏入口和资源注入拆开处理。
- 升级时冲突面更小，主要关注少量目标视图和 Theme API 是否变化。

风险：

- 依赖 BookStack 主题系统的半稳定能力，升级后仍需要回归验证。
- 页面级挂载点需要谨慎选择，避免与 BookStack 原有 tri-layout 侧栏冲突。

### 方案 B. 直接覆盖核心 Blade 视图

做法：

- 在主题里直接覆盖 `pages/show.blade.php`、`layouts/parts/header.blade.php`、`layouts/tri.blade.php` 等文件。

优点：

- 控制力最强。
- UI 结构可以一次性完全重排。

风险：

- 升级冲突面最大。
- 很容易把 BookStack 后续布局或交互更新全部吃进自定义维护成本。
- 当前阶段目标只是低侵入挂载，这个方案过重。

### 方案 C. 使用设置项里的自定义 Head HTML 注入

做法：

- 通过 BookStack 自带的 `app-custom-head` 注入脚本或样式，再在浏览器侧自行找 DOM 挂载。

优点：

- 最快。
- 部署时改动路径最少。

风险：

- 可维护性弱。
- DOM 选择器容易脆弱。
- 入口、状态和权限相关上下文难以形成清晰契约。

## 最终结论

当前采用方案 A：基于 Theme Module 的低侵入扩展。

具体落地方向如下：

1. 使用 BookStack 主题模块承载 AI 前端挂载能力。
2. 顶部次入口通过覆盖占位视图 `layouts.parts.header-links-start` 注入。
3. 页面主入口通过 `ThemeEvents::THEME_REGISTER_VIEWS` 在 `pages.parts.show-sidebar-section-actions` 之后插入独立 AI 侧栏区块。
4. 前端样式通过模块 `head/` 注入 `<link>`，前端脚本通过 `layouts.parts.base-body-end` 输出，并显式带上 CSP nonce。
5. 静态资源放入模块 `public/` 目录，并使用带命名空间的路径，例如 `/theme/<theme>/bookstack-ai/app.js`、`/theme/<theme>/bookstack-ai/app.css`，避免与其他主题资源冲突。

## 挂载点

### 1. 顶部次入口

目标位置：`layouts.parts.header-links-start`

依据：

- 该视图本身就是 BookStack 为视觉主题系统提供的占位文件。
- 它位于 `layouts.parts.header-links` 的最前面，适合插入全局导航入口。
- 不需要整体覆盖 `header.blade.php`。

推荐实现：

- 在主题或模块视图中覆盖 `layouts/parts/header-links-start.blade.php`。
- 注入一个全局 AI 入口链接或按钮，默认进入全局问答抽屉。

### 2. 页面主入口

目标位置：`pages.parts.show-sidebar-section-actions` 之后

依据：

- 页面展示页 `pages/show.blade.php` 使用 `layouts.tri`，右侧区域已有详情和操作区块。
- 将 AI 问答入口放在右侧区块可以最大程度复用现有页面信息架构。
- 使用 `renderAfter('pages.parts.show-sidebar-section-actions', ...)` 比整体覆盖 `pages/show.blade.php` 风险更低。

推荐实现：

- 在模块 `functions.php` 中监听 `ThemeEvents::THEME_REGISTER_VIEWS`。
- 调用 `renderAfter('pages.parts.show-sidebar-section-actions', 'bookstack-ai-sidebar-entry', 30)`。
- 在 `views/bookstack-ai-sidebar-entry.blade.php` 中输出 AI 问答挂载根节点和必要数据属性。

## 资源注入方式

### 样式

- 优先通过模块 `head/` 目录输出 `<link rel="stylesheet">`。
- 样式文件放在模块 `public/bookstack-ai/app.css`。

### 脚本

- 通过 `layouts.parts.base-body-end` 输出 `<script type="module">`。
- 外部脚本标签显式使用 `nonce="{{ $cspNonce }}"`，保持与主应用 CSP 一致。
- 模块 `head/` 继续只负责样式和轻量 head 元数据。
- 脚本文件放在模块 `public/bookstack-ai/app.js`。

### 数据传递

- 页面级上下文通过挂载根节点上的 `data-*` 属性传递，例如 `page_id`、`book_id`、`scope_mode`、`tenant_id`。
- 运行时调用当前仓库已有的扩展层接口，不在页面模板里直接写 AI 业务逻辑。

## 状态持久化方式

- 问答抽屉折叠状态和最近一次 `conversation_id` 继续由现有 `createSidebarStateController` 负责。
- 首期优先使用浏览器本地存储。
- 页面主入口与顶部次入口共享一套前端状态控制器，避免两套会话状态分裂。

## 样式隔离方式

- 首期采用 `bookstack-ai-*` 前缀类名和独立根节点容器做样式边界。
- 所有新增样式都收敛在模块 `public/bookstack-ai/app.css` 中。
- 选择器范围固定挂在 AI 根容器下，避免覆盖 BookStack 原生页面元素。
- 如后续交互复杂度继续上升，再评估 Shadow DOM 或更强的组件级样式隔离。

## 升级兼容性评估

低侵入方案的兼容性边界如下：

- 主要依赖 `ThemeEvents::THEME_REGISTER_VIEWS`、主题模块目录结构、`header-links-start` 占位视图、`pages.parts.show-sidebar-section-actions` 视图名。
- 升级回归重点检查：
  - `layouts.parts.header-links` 是否仍包含 `header-links-start`
  - 页面展示页是否仍使用 `pages.parts.show-sidebar-section-actions`
  - tri-layout 右侧栏结构是否仍存在
  - CSP nonce 注入机制是否保持不变

相对方案 B，这个方案把升级影响控制在少量目标视图和 Theme API 上，符合当前阶段要求。

## 风险

1. 页面侧栏结构如果在 BookStack 升级中调整，`renderAfter` 的目标视图可能需要同步改名。
2. 如果后续 AI 问答抽屉交互变重，右侧区块内嵌入口可能需要升级为全局浮层或独立面板。
3. 主题模块 `public/` 资源最终暴露在 `/theme/<theme>/...` 路径下，需要统一命名空间防止资源冲突。

## 落地任务引用

- B1: 完成真实 BookStack 前端接入，必须按本决策记录的挂载点与资源注入方式实施。
- B4: 补齐 Phase 1 验收测试，必须验证本决策记录中的顶部入口、页面主入口、状态持久化与故障隔离表现。

## 后续动作

1. 在 BookStack 主题目录中创建 BookStack-AI 模块骨架。
2. 先实现顶部入口和页面右侧入口的静态挂载。
3. 再接入当前仓库已有的 `createBookStackAiExtension` 与侧边栏状态控制逻辑。
