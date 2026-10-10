# plugin-group-ux-close-loop Design

## Context

上游资源已于 change `2026-10-09-upstream-ux-close-loop` 落地完整的「保存→待发布→发布→已发布」闭环，基础设施全部就绪且均为单点：

- `edge_sync.derive_pending_publish`（edge_sync.py:276）——pending 推导共享 helper，含 None 守卫；
- `create_config_version` 内 `hasattr(entity, "updated_at")` 时间对齐（edge_sync.py:359-360）——插件组发布后 pending 自然回 False，**免费获得**；
- `publish_resource` 内 `hasattr(resource, "last_publish_status")` partial 写回（edge_sync.py:213-214）——**加列即自动接入**；
- `PublishStatusTag` 组件已支持四态，`pending` 为消费方显式 prop。

插件组侧经核实：`PluginConfig` 模型已有 `updated_at`（naive UTC + onupdate，models/cluster.py:178）；全局 `plugin_configs.py` 仅有 `GET ""` 跨集群列表（只读，路径前缀 `/plugin_configs`），**已有**内联 publish-map 回查（:74-82，未走 `load_publish_time_map` 单点），全部写操作在 `cluster_plugin_configs.py`；PLG-07 删除守卫在 `cluster_plugin_configs.py:93-112`，比对键为 `Route.plugin_config_ids`（JSON TEXT，存 **edge_uuid** 而非 id）。逐节点结果真实状态枚举（edge_sync.py:424-517、:120）：`pending`（初始）→ `success` / `failed`；无活跃节点 → `skipped`；顶层 `no_nodes_status` 默认 `error`（route 域可覆盖 `ok`）；数据库腿 `success`。前端现状：两条保存路径并存——主页面 `PluginEntityFormModal`（:127/:130「已更新/已创建」）与集群子页 `useClusterPluginEntity`（:140/:143「已更新/已添加」）；主页面删除在 `PluginConfigList.vue:238` **直接调**共享确认弹窗，集群子页经 `useClusterPluginEntity → core`（`confirmDelete` 走注入 deps）链路。

## Goals / Non-Goals

- **Goals**：插件组接入既有发布状态闭环（接线，不新造）；表单三处交互缺陷；删除引用前置可视化；低成本文案/状态一致性。
- **Non-Goals**：见 proposal「不做」清单（M1 双实现收敛另立项；M8 待角色矩阵确认；L9 后端唯一性约束另立项）。

## Decisions

### D1. 发布状态接线全部走既有单点，禁止插件组侧本地推导

两个列表端点（`GET /clusters/{id}/plugin_configs`、`GET /api/v1/plugin_configs`）均经 `derive_pending_publish` + publish-map 回查推导 `pending_publish`，与上游同口径；全局端点的内联 publish-map 回查换用 `load_publish_time_map` 单点，消除两端口径漂移。前端 MUST NOT 本地推导（与 `UpstreamResponse` 的注释约定一致，schemas/cluster.py:148）。回滚经 `rollback_resource` 恢复字段 + commit，`updated_at` onupdate 自然置 pending——与上游语义一致，**不特判**。

### D2. `last_publish_status` 列按上游同款三件套接入

`PluginConfig` 补 nullable `String(16)` 列 → 注册 `COLUMN_MIGRATIONS`（约定 #118，漏注册将启动 crash-loop）→ `publish_resource` 既有能力探测自动写回，零代码。合入前跑 PG 方言冒烟（约定 #31/#103）。

### D3. 引用检查抽共享 helper + 只读端点；被引用时阻断式提示（不动共享弹窗）

把 PLG-07 的「遍历同集群路由、解析 `plugin_config_ids`（畸形 JSON 按不含引用处理）、比对 `edge_uuid`」抽为模块级 helper（`cluster_plugin_configs.py` 内函数即可，暂不进 services/——唯一消费方是本文件两处），删除守卫与新端点 `GET .../references` 共用，保证**提示展示的引用清单与后端删除时的拦截判定永远同语义**。端点返回 `{ name, referenced_by: [{ route_id, route_name }] }`。只读端点无需 ROUTE_MAP 条目（仅 mutating 路由参与校验），但必须补 `tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 采样（约定 #19）。

**被引用时的交互（用户已确认，决策 A）**：共享删除确认弹窗不支持禁用勾选（useClusterUtils.ts 已核实无 disabled 逻辑），为其扩展将波及全站——改为引用非空时**不弹共享确认**，经 `useOverlayModal` 阻断式提示（列出引用路由名，超 3 条折叠为「等」，说明需先解除引用），仅提供「仅删除 Edge 记录」（照常走共享 Edge-scope 删除进度流程）与「取消」，不提供删除数据库记录的入口。**两页均接入（决策 B）**：主页面在调用点（PluginConfigList.vue 直接调处）拉取引用后分流；集群子页在 `useClusterPluginEntity` 传入 core 的 deps 处包装（不改 `useClusterResourceCore` 本体）。无引用时行为与现状完全一致。跨集群引用不在检查范围（与 PLG-07 守卫同口径，已知局限——路由表单仅提供同集群插件组，跨集群引用只可能来自 API 直调/导入脏数据）。

### D4. 表单三缺陷一次修完（主页面 `PluginEntityFormModal.vue`；toast 两条保存路径都改）

- 校验失败 → `activeTab` 切回「基础配置」+ `message.warning('请完善「基础配置」：名称与所属集群为必填')`；
- catch 分支 → `getApiErrorMessage(error)`（对齐 `useClusterPluginEntity.ts:150` 先例），文案兜底「保存失败」；
- 误关保护 → 对齐 `UpstreamFormModal` dirty 确认先例（有未保存变更时关闭前确认）；保存成功后**先清 dirty 标记再关窗**，避免误弹确认；
- 保存成功 toast「配置尚未发布，需发布后才会在 Edge 节点生效」两条保存路径**四处分支**全覆盖（决策 C：主页面 modal 两分支 + 集群子页 `useClusterPluginEntity` 两分支），且保存成功后刷新列表使「待发布」立即可见。

### D5. 共享层改动保持向后兼容（L5/M5）

- 发布确认标题参数化（实施落点修正：共享**确认**弹窗实为 `PublishConfirmModal.vue` 组件，非 useClusterUtils——后者只承载进度弹窗）：`PublishConfirmModal` 新增可选 `currentVersion` prop（显示「本次发布将创建新版本 v(N+1)」）+ `useClusterResourceCore` deps 可选第三参与 opt-in 配置 `publishVersionHint`，插件组开启；其他资源保持两参调用，默认行为不变。
- 状态值中文映射：`handleResult` 显示层映射**以 edge_sync 真实产出为准**（枚举见 Context）：逐节点 `success→成功`、`failed→失败`、`skipped→跳过`、`pending→执行中`（兜底），顶层无活跃节点 `error/ok→失败/成功`；与终态汇总既有映射用词对齐；仅改展示不改数据结构。按约定 #51④，回归范围必须覆盖同域既有测试（useClusterUtils 单测 + 插件组/上游/路由视图测试），且验收落在用户实际操作的页面。

### D6. 回滚清除 `last_publish_status`（共享单点能力探测，用户决策 D）

partial 后回滚时，四态判定顺序（partial 优先于 pending）会以「⚠ 发布未完全生效」掩盖「待发布」，但回滚后用户恰恰需要被提示重新发布。修法：`rollback_resource` 内 `hasattr(resource, "last_publish_status")` 探测清除该字段（置 NULL）——无此列的资源不受影响，upstream 同病同修；`updated_at` onupdate 置 pending 的自然语义不变（D1「不特判」仅针对 pending 输入，二者正交）。附共享单点回归测试（upstream 与插件组路径各一条）。

### D7. 验收必须落在真实页面（约定 #51②）

组件/API 断言不能替代页面验收：主页面与集群子页都要实际渲染确认四态标签、删除警示、表单行为。

## Risks / Trade-offs

- **共享层改动波及全站**（D5 L5 映射/M5 标题参数化、D6 rollback 清除）→ 参数可选/能力探测、默认行为不变；跑既有共享单测（含 upstream 同路径回归）+ 全量 vitest（已知 ~5 个时序 flake，单文件重跑判定，约定 #196）。
- **references 端点 N+1 查询**→ helper 一次 `select(Route).where(cluster_id==)` 内存比对（与现守卫同款），插件组被引用规模小，不优化。
- **畸形 `plugin_config_ids` JSON**→ 与 PLG-07/cluster_backup 导入期清理语义一致：按「不含引用」处理，不阻断。
- **`last_publish_status` 列迁移**→ `COLUMN_MIGRATIONS` 注册 + PG 冒烟双保险（约定 #118/#31）。

## Migration Plan

纯增量：新列 nullable、新端点只读、schema 字段带默认值。无数据回填需要——存量行 `last_publish_status` 为 NULL（视为全成功）、`pending_publish` 由推导即时计算。

## Open Questions

- M8（路由表单弹窗插件组 Tab 权限门控）本期不做，待确认角色矩阵后另行处理。
