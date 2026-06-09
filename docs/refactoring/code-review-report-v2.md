# 磐石 Admin — 代码重构审查报告 v2

> 审查日期：2026-06-09
> 审查范围：前端 Vue 3 组件 + Composables + CSS，后端 FastAPI 路由层
> 总览行数：前端 ~25,000 行，后端 ~7,500 行，CSS ~5,000 行

---

## 目录

1. [🔴 严重问题（P0）](#一-严重问题p0)
2. [🟡 中等问题（P1）](#二-中等问题p1)
3. [🟢 低优先级问题（P2）](#三-低优先级问题p2)
4. [推荐优先级矩阵](#四-推荐优先级矩阵)

---

## 一、🔴 严重问题（P0）

### 1.1 发布流程重复实现 5 次（后端）

**位置**：
- `backend/app/api/v1/cluster_routes.py` — publish/rollback（~168 行 + ~164 行）
- `backend/app/api/v1/cluster_upstreams.py` — publish（~172 行）
- `backend/app/api/v1/cluster_plugin_configs.py` — publish（~95 行）
- `backend/app/api/v1/cluster_global_rules.py` — publish（~82 行）
- `backend/app/api/v1/cluster_plugin_metadata.py` — publish（~112 行）

**问题**：版本号自增 → ConfigVersion 创建 → 逐节点 EdgeClient 调用 → 日志记录 → 响应构建，完整流程复制 5 次。每个发布函数 80-170 行。

**已有的解决方案**：`services/edge_sync.py` 中已有 `publish_to_nodes()` 和 `build_publish_response()`，但没有任何一个 route 文件使用它。

**建议**：
- 把 `edge_sync.publish_to_nodes()` 补充完整，涵盖版本管理和 ConfigVersion 创建
- 所有 5 个 route 文件的 publish handler 改为调用 `publish_to_nodes()`
- 预估消除 ~500 行重复代码

### 1.2 EdgeClient.vue 臃肿（1781 行）

**位置**：`frontend/src/views/EdgeClient.vue`

**问题**：6 个 Tab 面板各自独立实现完整的 CRUD + 进度弹窗 + 表格 + 列定义，完全不使用项目中已有的 composables（如 `executePublish`、`useClusterUtils`）。同一个进度弹窗模式重复 6 次。

**建议**：
- 抽取 `EdgeProgressLog.vue` 复用组件（消除 6 次重复）
- 使用 `executePublish` / `executeDeleteWithProgress`
- 合并 6 份列定义到共享 `tableColumns.ts`
- 预估消除 ~400 行

### 1.3 两种并行弹窗体系

**前端**：自定义指令式弹窗（`showDeleteConfirm` 用 `h()` + `render()`）与 Ant Design `Modal.confirm` / `Modal.info` 并行存在。

**后端**：部分 `except Exception` 兜底（cluster_upstreams），部分没有（cluster_plugin_configs）。

**建议**：
- 前端统一到 Ant Design Modal，移除自定义 DOM 操作（`createProgressModal`）
- 后端统一 publish 循环的异常捕获模式

### 1.4 PluginConfigFormModal ↔ GlobalRuleFormModal 95% 相同

**位置**：`frontend/src/composables/useClusterPluginConfigs.ts` / `useClusterGlobalRules.ts`

**问题**：插件组和全局规则的 CRUD 除了 API 端点不同，结构完全一样。包括 2 个 composable（212 + 167 行）和 2 个组件。

**建议**：合并成参数化的 `usePluginEntity(type, apiEndpoint)` composable，预估减少 ~400 行。

### 1.5 编辑路由时插件全删不生效（已修复）

`RouteFormModal.vue` 中 `if (form.plugins.length > 0 && routeId)` → 改为 `if (routeId)`。之前已修复。

---

## 二、🟡 中等问题（P1）

### 2.1 列配置 localStorage 模式重复 4 次

**位置**：`useClusterRoutes.ts` / `useClusterUpstreams.ts` / `useClusterNodes.ts`

**问题**：每个文件都有完全相同的：
```ts
const CFG_KEY = "panshi_xxx_columns"
const saved = localStorage.getItem(CFG_KEY)
watch(..., save => localStorage.setItem(CFG_KEY, ...))
```

**建议**：抽取 `useColumnConfig(key, defaults)` composable。

### 2.2 后端胖函数清单

| 函数 | 文件 | 行数 | 问题 |
|---|---|---|---|
| `diff_cluster_config` | cluster_nodes.py | 288 | 内嵌 8 个子函数 |
| `publish_upstream` | cluster_upstreams.py | 172 | 合并到 edge_sync |
| `publish_route` | cluster_routes.py | 168 | 同上 |
| `rollback_route` | cluster_routes.py | 164 | 同上 |
| `delete_cluster` | clusters.py | 117 | 级联删除内联 5 个类型 |
| `list_all_routes` | routes.py | 136 | 查询条件堆积 |

### 2.3 CSS Modal 重复 12 次

相同的 `.modal-overlay` / `.modal` / `.modal-header` / `.modal-body` / `.modal-footer` CSS 块在 12 个组件中各自定义一次，总计约 960 行重复。

**涉及的组件**：
ClusterFormModal / UpstreamFormModal / RouteFormModal / PluginConfigFormModal / GlobalRuleFormModal / VersionManagementModal / PublishConfirmModal / UserList / PluginMetadataList / ClusterList / NodeList / StaticResourceList

**建议**：抽取 `<BaseModal>` 组件，或把这些 CSS 移到 `style.css` 全局定义后删除 scoped 副本。

### 2.4 内置插件列表重复加载

`CentralList.vue` + 每个 composable 各自加载一次 `GET /plugins/builtin`。

### 2.5 ConfigProvider 主题与 CSS 变量脱节

`App.vue` 的 `ConfigProvider` 用硬编码 hex 值（`#1890ff`），`theme.css` 用 oklch 值。两者是近似匹配，改一个另一个不会同步。

**建议**：
```ts
// 从 CSS 变量读取 ConfigProvider token
const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent')
```

### 2.6 前端大型组件清单（>400 行）

| 文件 | 行数 | 建议 |
|---|---|---|
| EdgeClient.vue | 1781 | 抽取 6 个 Tab 为独立组件 |
| CentralList.vue | 1467 | 抽取 ClusterGroupCard / ExpandedCard |
| PluginEditorDrawer.vue | 1401 | 抽取 9 个字段类型渲染器 |
| UserList.vue | 1013 | 抽取 UserFormModal / ClusterPickerModal |
| EdgeImport.vue | 954 | 抽取 ImportPreviewSection |
| VersionManagementModal.vue | 842 | 抽取 DiffEngine 纯函数 |
| PluginSelector.vue | 785 | 抽取 PluginTree |
| NodeList.vue | 741 | — |
| PluginMetadata.vue | 731 | — |

### 2.7 3 份 `get_current_user`

| 位置 | 签名 |
|---|---|
| `clusters.py:20` | header → User |
| `users.py:49` | header → User (重复) |
| `auth.py:14` | token string → User (不同接口) |

---

## 三、🟢 低优先级问题（P2）

### 3.1 N+1 查询（后端）

`clusters.py` 的 `list_clusters` / `list_my_clusters` 对每个集群执行 8 次独立的 SELECT COUNT。20 个集群/页 = 160+ 次 DB 查询。

### 3.2 Select/Check/404 重复 40+ 次

```python
result = await db.execute(select(Model).where(Model.id == id, Model.cluster_id == cluster_id))
item = result.scalar_one_or_none()
if not item:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="XXX不存在")
```

**建议**：抽取 `get_or_404(db, Model, **filters)`。

### 3.3 `upstreamTargetKey` 模块级计数器（`useClusterUpstreams.ts`）

多实例共享计数器，可能导致 key 冲突。

### 3.4 5 个卡片列表页 CSS 重复

ClusterList / PluginConfigList / PluginMetadataList / GlobalRuleList / StaticResourceList 各有一套 `.X-card` / `.X-card-topbar` / `.X-card-actions`。

### 3.5 硬编码颜色值

| 值 | 出现次数 | 建议替换为 |
|---|---|---|
| `oklch(0% 0 0 / 40%)` | 12 个文件 | `--overlay` 变量 |
| `oklch(56% 0.16 210 / X%)` | 47 次 / 30 个文件 | `--accent-bg` 变量 |
| `#ff4d4f` | 6 个文件 | `var(--danger)` |
| `#52c41a` | 5 个文件 | `var(--success)` |
| `#666` | 6 个文件 | `var(--muted)` |

### 3.6 JSON 序列化重复 ~20 次

`json.dumps` 对 `vars` / `plugins` / `checks` / `timeout` / `keepalive_pool` 在每个 create/update handler 中重复。

---

## 四、推荐优先级矩阵

| 优先级 | 改动 | 预估减少代码 | 风险 | 涉及文件数 |
|---|---|---|---|---|
| **P0** | 合并 PluginConfigFormModal + GlobalRuleFormModal | -400 行 | 低 | 4 |
| **P0** | EdgeClient.vue 抽取进度弹窗、复用 composables | -400 行 | 中 | 2 |
| **P0** | 后端 publish 统一到 edge_sync.publish_to_nodes() | -500 行 | 高 | 6 |
| **P1** | 抽取 `useColumnConfig` composable | -200 行 | 低 | 4 |
| **P1** | CSS Modal 12 重复 → `<BaseModal>` | -800 行 | 低 | 13 |
| **P1** | 修复后端 N+1 查询 | 性能提升 | 低 | 1 |
| **P1** | ConfigProvider 链接 CSS 变量 | -5 行 | 低 | 1 |
| **P2** | 抽取 `get_or_404` | -200 行 | 低 | ~10 |
| **P2** | 修复 `upstreamTargetKey` 计数器 | 1 行 | 低 | 1 |
| **P2** | 统一卡片列表 CSS | -300 行 | 低 | 5 |

### 影响范围最大的 3 个改动

```
1. 后端 publish 统一  →  消除 5 个胖函数中的核心重复，减少 ~500 行，影响 6 个文件
2. CSS Modal 统一     →  消除 ~960 行重复 CSS，涉及 12 个组件，但纯 CSS 无业务风险
3. EdgeClient.vue 重构 →  消除最大文件中的 6 次重复，减少 ~400 行
```
