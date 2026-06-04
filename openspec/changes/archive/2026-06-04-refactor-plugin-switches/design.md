## Context

当前插件开关页面是一个简单的 Ant Design Vue 表格，仅显示插件名称、说明和开关。设计稿 `docs/ui/Live-Artifact-3/plugins.html` 要求卡片网格布局，包含分类筛选、搜索、状态筛选、schema 预览等丰富功能。

设计稿：`docs/ui/Live-Artifact-3/plugins.html`

## Page Layout

```
┌──────────────────────────────────────────────────────┐
│  PageHeader: 插件管理                                 │
│  管理内置插件的启用/禁用状态，查看插件配置 schema       │
├──────────────────────────────────────────────────────┤
│  Status Bar:  已启用 12 / 18 个插件                   │
│              [全部启用] [全部禁用]                     │
├──────────────────────────────────────────────────────┤
│  Category Pills: [全部] [安全] [流量控制] [可观测] ... │
├──────────────────────────────────────────────────────┤
│  Filter Bar:  [🔍 搜索插件名称...] [全部状态 ▼] 共18个│
├──────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │ Card 1       │  │ Card 2       │  │ Card 3       ││
│  │ 限流  流量控制│  │ CORS  安全   │  │ Prometheus   ││
│  │ 描述文字...  │  │ 描述文字...  │  │ 描述文字...  ││
│  │ limit-req    │  │ cors         │  │ prometheus   ││
│  │ ⚙ schema [○]│  │ ⚙ schema [●]│  │ ⚙ schema [○]││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│  (CSS Grid, auto-fill, minmax 320px)                 │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                  │
│  │ Card 4       │  │ Card 5       │                  │
│  │ ...          │  │ ...          │                  │
│  └──────────────┘  └──────────────┘                  │
├──────────────────────────────────────────────────────┤
│  Save Area: [有未保存的更改]  [保存配置]              │
└──────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 前端 UI 完全匹配设计稿（CSS Grid + 分类筛选 + 搜索 + schema 预览 + 开关）
- 后端补充插件元数据（display_name, category）
- 启用/禁用状态持久化到后端

**Non-Goals:**
- 不改变 PluginEnabled 数据模型
- 不改变已有的 API 路由结构
- PluginSwitches 不涉及路由级/插件组级插件配置（那是 PluginSelector 的职责）

## Decisions

| 决策 | 选择 | 理由 |
|---|---|---|
| 前端框架 | Vue 3 Composition API + Ant Design Vue | 保持项目一致 |
| 布局方式 | CSS Grid（auto-fill, minmax 320px） | 设计稿是 grid 布局 |
| 插件数据源 | 后端 `plugin_definitions.py` 补充字段 | 统一管理插件元数据 |
| 状态管理 | 前端局部状态 + API 持久化 | 不需要 Pinia store |
| 未保存检测 | 深拷贝原始数据 + 逐项比较 | 与设计稿 JS 实现逻辑一致 |
| 分类筛选 | pill 标签点击筛选 | 设计稿中的 plugin-cat 元素 |
| schema 预览 | 卡片底部"⚙ schema"点击展开/收起 | 设计稿中的 plugin-schema-box |
| 状态筛选 | 下拉框（全部/已启用/已禁用） | 设计稿中的 statusFilter |

## Design Review — 逻辑漏洞与边缘情况

以下 10 个问题在实现前已逐一讨论确认：

| # | 问题 | 结论 |
|---|---|---|
| 1 | 分类双数据源（PluginSelector 硬编码 vs 后端字段） | PluginSelector 改为消费后端返回的 `category`，统一数据源 |
| 2 | 禁用已配置的插件后，已有路由/插件组引用如何处理 | 不禁用已有配置（Edge 照常运行）；保存时扫描引用列表并弹警告 |
| 3 | PUT /plugin-switches 清空再插入有数据丢失风险 | 改为 `async with db.begin()` 事务包裹 + 异常处理 |
| 4 | 新增插件后，开关页显示"已启用"但选择器看不到 | 后端 `GET /plugins/builtin` 过滤逻辑：无 PluginEnabled 记录视为已启用 |
| 5 | version 字段无实际数据来源 | 去掉 version，卡片不展示版本号 |
| 6 | 有未保存更改时离开页面无保护 | 加 `beforeRouteLeave` 导航守卫 |
| 7 | PUT API 入参 `list[dict]` 缺少校验 | 加 `PluginSwitchItem` Pydantic schema + 校验 plugin_name 合法性 |
| 8 | display_name 引入后 PluginSelector 不一致 | PluginSelector 优先显示 `display_name`，fallback 到 `name` |
| 9 | 加载/空/错误状态未定义 | 沿用当前 loading + error toast 模式，加简单空状态展示 |
| 10 | 设计稿 16 个插件 vs 实际 25 个分类归属 | 在 `plugin_definitions.py` 中统一为全部 25 个插件定义 `category` |

## Components

### PluginCard
每个插件卡片包含：
- **Header**: `display_name` + `category` 标签（小字，边框圆角）
- **Body**: 描述文字（12px, muted, line-height: 1.5）
- **Footer**:
  - 左: `name`（等宽字体，灰色）+ "⚙ schema" 点击切换
  - 右: Toggle Switch（开/关）
- **Schema Box**: 初始隐藏，点击展开显示 JSON schema（等宽字体，滚动区域）

### FilterBar
- 分类 pill：从插件数据的 `category` 字段动态生成
- 搜索输入框：按 `display_name` / `name` 实时过滤
- 状态下拉框：全部/已启用/已禁用
- 计数："共 N 个插件"

### StatusBar
- 计数："已启用 X / N 个插件"
- 批量操作按钮：全部启用 / 全部禁用

### SaveArea
- "有未保存的更改" 提示（仅在有变更时显示）
- "保存配置" 按钮（调用 PUT /plugin-switches）

## Data Flow

1. `onMounted` → `GET /plugin-switches` + `GET /plugins/builtin?all=1` 并行请求
2. 合并数据：后端开关状态覆盖默认 enabled=true
3. 深拷贝保存 `originalPlugins` 用于脏检测
4. 用户切换开关 → 更新本地 `plugins` → `hasUnsavedChanges` 自动更新
5. 点击保存 → `PUT /plugin-switches` → 后端扫描引用 → 返回警告
6. 保存成功 → 更新 `originalPlugins` → 脏状态清除

## Risks / Trade-offs

- 设计稿（plugins.html）中没有"保存配置"按钮（toggle 直接保存到本地 state）。但我们实际需要持久化到后端，所以保留保存按钮和未保存提示。
- 设计稿中使用的是 demo 数据（18 个示例插件），实际项目有 25 个内置插件，分类标签会动态适配。
- schema 预览仅在插件有 schema 定义时展示。目前部分插件的 schema 较大（如 limit_req），需要控制显示高度（max-height: 150px + 滚动）。

## Responsive

- ≤768px: Grid 变为 1 列，filter bar 纵向排列，分类 pill 横向滚动
