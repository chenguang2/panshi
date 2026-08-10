## Context

上游管理（`useClusterUpstreams.ts` + `ClusterUpstreams.vue`）支持编辑/删除/发布/版本管理，缺复制。路由管理已有成熟复制模式（`useClusterRoutes.ts` 的 `copyRouteByRecord`）：`copyingXxx` 标志 + `复制_` 前缀 + 表单填充 + `editingXxx = null` 使提交走 POST 新建分支。上游复制完全仿照此模式。

## Goals / Non-Goals

**Goals:**
- 上游操作按钮加「复制」
- 复制时表单填充源上游完整配置（含高级配置：checks/timeout/keepalive_pool/retries/retry_timeout/host/scheme）
- 名称加 `复制_` 前缀，提交走 POST 新建，不修改原上游
- 表单标题显示「复制上游」

**Non-Goals:**
- 后端改动（复制是纯前端新建流程）
- 批量复制
- 复制到其他集群

## Decisions

### Decision 1: 仿照路由的 `copying` 标志模式

`copyUpstreamByRecord(cluster, upstream)` 仿照 `copyRouteByRecord`：

```ts
const copyingUpstream = ref(false)

async function copyUpstreamByRecord(cluster: Cluster, upstream: Upstream) {
  await loadUpstreams(cluster)               // 拉最新数据（与路由一致）
  const list = cluster.upstreams || []
  const source = list.find(u => u.id === upstream.id) || upstream
  editingUpstream.value = null               // 关键：提交走 POST 新建
  copyingUpstream.value = true
  currentClusterId.value = cluster.id
  upstreamForm.name = `复制_${source.name}`   // 前缀
  fillUpstreamForm(source)                    // 填充全部字段（见 Decision 2）
  upstreamModalVisible.value = true
}
```

**关键**：`editingUpstream = null` 使 `handleUpstreamSubmit` 的 `if (editingUpstream.value)` 走 else（POST），无需改提交逻辑分支。

**状态复位（评审确认）**：`showAddUpstreamModal` 与 `editUpstreamByRecord` 均设 `copyingUpstream.value = false`（与路由 showAddRouteModal/editRoute 同款）——避免复制关闭后点「添加上游」标题仍显示「复制上游」、name 残留。

**loadUpstreams 保留（评审确认）**：复制时 `await loadUpstreams(cluster)` 拉最新数据；源上游若不在当前页则 `list.find` miss、fallback 到传入 record（后端列表 API 已返回完整字段 checks/timeout/keepalive_pool 等，无需额外请求）。

### Decision 2: 表单字段复用 `editUpstreamByRecord` 的填充逻辑

复制填充与编辑填充字段完全一致（load_balance/hash_on/key/checks/timeout/keepalive_pool/retries/retry_timeout/pass_host/scheme + 各 toggle 状态）。为避免重复，提取公共填充函数 `fillUpstreamForm(source)`，`editUpstreamByRecord` 与 `copyUpstreamByRecord` 都调用它——复制时仅额外设 `name = 复制_...` 与 `copyingUpstream = true`。

**提取边界（评审确认）**：`fillUpstreamForm(source)` **全部提取**编辑函数中的字段映射 + toggle 复位/checksMode/retriesRadio 等所有状态设置——编辑行为不变，复制自动完整覆盖高级配置。

**备选**：复制内联重复填充代码——否决，40+ 行字段映射重复，提取公共函数符合 DRY。

### Decision 2a: `defaultActions` 加 copy（评审确认）

`useColumnConfig` 的 `defaultActions` 当前为 `['edit', 'delete', 'publish', 'version']`（useClusterUpstreams.ts:214），且配置持久化到 localStorage。新增复制按钮后：
- **必须**将 `defaultActions` 改为 `['copy', 'edit', 'delete', 'publish', 'version']`（与路由 138 行一致）
- 否则老用户升级后 localStorage 无 copy → 复制按钮默认不可见，需手动在列配置勾选
- 新装/未配置用户默认可见

**注意**：已持久化配置的老用户仍可能看不到 copy（localStorage 优先于 defaultActions）——可接受，用户可在列配置中勾选；不做配置迁移（YAGNI）。

### Decision 3: 表单标题与按钮

- `ClusterUpstreams.vue` 表单标题：`{{ copyingUpstream ? '复制上游' : editingUpstream ? '编辑上游' : '添加上游' }}`
- `allUpstreamActionButtons` 加 `{ key: 'copy', title: '复制' }`（编辑后），`handleUpstreamAction` 加 `case 'copy'`
- 行操作按钮若基于 `allUpstreamActionButtons` 自动渲染则自动出现；否则在行操作区补「复制」

### Decision 3a: 全局上游管理页（UpstreamList + UpstreamFormModal）复制（评审确认）

**发现遗漏**：全局「上游管理」页（`UpstreamList.vue` + `UpstreamFormModal.vue`）是**独立的第二/三套上游表单实现**，不用 `useClusterUpstreams`，最初设计未覆盖。需补齐：

- `UpstreamFormModal` 加 `copyingUpstream: boolean` prop
- `populateForm()`：`props.copyingUpstream` 时填充 `props.editingUpstream` 的完整配置（同编辑分支），但 `form.name = 复制_${u.name}`
- 提交：`props.copyingUpstream` 时走 POST 新建（当前 `if (props.editingUpstream)` 走 PUT）
- `UpstreamList.vue`：`handleAction` 加 `case 'copy'`（设 editingUpstream=record + copying=true + 打开弹窗），操作菜单加「复制」项
- 标题：`copyingUpstream ? '复制上游' : editingUpstream ? '编辑上游' : '添加上游'`（与集群 Tab 三态一致）

**注意**：UpstreamFormModal 与 useClusterUpstreams 的表单字段映射独立实现，复制逻辑需在该组件内单独实现（不能复用 fillUpstreamForm）。

### Decision 4: targets 深层复制

`upstreamForm.targets` 是 `reactive` 数组，复制时需深拷贝避免与原上游共享引用：

```ts
upstreamForm.targets = source.targets.map(t => ({ ...t, key: ++upstreamTargetKey }))
```

## Risks / Trade-offs

- [字段遗漏] 复制需覆盖全部高级配置字段——`fillUpstreamForm` 全部提取，与编辑一致
- [引用共享] targets 直接赋值会共享对象——深拷贝 + 新 key
- [名称冲突] `复制_xxx` 重名——后端新建若唯一约束校验则提示，可接受
- [老用户配置] 已持久化列配置不含 copy——用户可在列配置手动勾选，不做配置迁移
- [状态残留] 复制关闭后 copyingUpstream 未复位——两个入口（showAdd/edit）均复位，与路由一致

## Migration Plan

无后端/DB 迁移。前端改动随上游管理页面发布；老用户复制按钮需在列配置中手动勾选（或首次未保存配置时默认可见）。

## Open Questions

无（评审确认：defaultActions 加 copy、两入口复位 copyingUpstream、fillUpstreamForm 全部提取、保留 loadUpstreams）。
