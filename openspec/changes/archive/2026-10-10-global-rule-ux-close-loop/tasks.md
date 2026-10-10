# global-rule-ux-close-loop Tasks

## 1. 发布状态接线（H1 后端半，TDD）

- [x] 1.1 RED：新建 `backend/tests/test_global_rule_publish_status.py`（参照 `test_plugin_config_publish_status.py`）——断言两个列表端点（`GET /api/v1/clusters/{id}/global_rules`、`GET /api/v1/global_rules`）响应每条记录携带 `pending_publish`；编辑保存后 pending 为真；发布后 pending 为假；`current_version` 非空但版本删光时 pending 为 False 且不 TypeError（None 守卫）
- [x] 1.2 GREEN：`GlobalRuleResponse` 补 `updated_at`/`pending_publish`/`last_publish_status` 字段（形态对齐 `UpstreamResponse`/`PluginConfigResponse` 单点注释，schemas/cluster.py）；两个列表端点经 `edge_sync.derive_pending_publish` + publish-map 回查推导（两端点同口径，MUST NOT 各自实现推导逻辑）
- [x] 1.3 RED：partial 持久化用例——发布存在失败节点后 `last_publish_status == 'partial'`，下次全部成功发布后清为 NULL
- [x] 1.4 GREEN：`GlobalRule` 模型补 `last_publish_status`（nullable String(16)）并注册 `COLUMN_MIGRATIONS`（#118）；确认 `publish_resource` 既有 `hasattr` 探测自动写回（预期零代码）
- [x] 1.5 PG 方言冒烟：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#31/#103）

## 2. 前端状态接线（H1 前端半）

- [x] 2.1 `src/types/index.ts` GlobalRule 类型补 `updated_at`/`pending_publish`/`last_publish_status`
- [x] 2.2 `GlobalRuleList.vue` 卡片接入 `PublishStatusTag` 四态（未发布/待发布/⚠ vX·发布未完全生效/已发布 vX+时间），**移除**「已发布/未发布」badge + a-tag 双显（单一状态表达）
- [x] 2.3 集群子页同步接入（两端口径一致）；确认 `useClusterPluginEntity.ts:157` 注释声称的「保存后刷新出待发布」对全局规则成立
- [x] 2.4 保存成功 toast 对齐先例：「全局规则已保存。配置尚未发布，需发布后才会在 Edge 节点生效」——覆盖两条保存路径（若任务 6 表单收敛先行，则收敛后的单点表单一处即可）；保存成功后刷新列表使「待发布」立即可见；文案按资源 displayName 同源分支（`PluginEntityFormModal` 已有插件组版文案，MUST NOT 出现全局规则弹「插件组已保存」错位文案）
- [x] 2.5 主页面工具栏计数升级：「共 X 个 · 未发布 Y · 待发布 Z」（本地统计，D9；超 500 条截断时基于已加载数据统计，与截断提示并存）
- [x] 2.6 组件测试：四态渲染断言 + toast 文案断言 + 双显移除断言

## 3. 删除风险警示（H4）

- [x] 3.1 `useClusterUtils.showDeleteConfirm` 新增通用 `extraWarning` 可选参数（渲染复用既有黄底警示行样式，现有 `isCluster` 硬编码警示行保持不动，向后兼容，其他资源默认行为不变）
- [x] 3.2 全局规则两入口调用点传入警示行：「全局规则作用于集群「{cluster}」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置」
- [x] 3.3 更新 useClusterUtils 单测；按 #51④ 回归同域既有测试（使用删除确认的视图测试不受影响）

## 4. 版本弹窗资源名词表（H3）

- [x] 4.1 resourceType→中文名常量映射（对齐 `useClusterUtils` 既有 `resourceLabels` 范本），替换 `VersionManagementModal` 三元链；`global_rule`→「全局规则」、`plugin_config`→「插件组」
- [x] 4.2 版本弹窗标题 edge_uuid 两入口统一去掉
- [x] 4.3 更新相关组件测试断言

## 5. 发布/删除节点取数全量（M4）

- [x] 5.1 共享 `PublishConfirmModal.fetchNodes` 显式传 `page_size=PAGE_SIZE_DROPDOWN(500)`（A2 决策：组件内修，全资源发布弹窗同步变全量；对齐删集群先例）；`GlobalRuleList` 删除链路节点取数同步传全量；按 #51④ 回归既有发布流测试（同时是 `publish-node-select` spec「display all nodes」的实现合规修复）
- [x] 5.2 发布弹窗集群无节点时给文案：「该集群暂无节点，无法发布；请先在「节点管理」添加节点」（不再只禁用确认键）

## 6. 集群子页体验收敛（M1/M2/M7/L6）

- [x] 6.1 手写表单换 `PluginEntityFormModal`（`clusters=[props.cluster]`、编辑禁选集群），移除手写 modal 与死代码；误关保护/跨 Tab 校验/统一 toast 自动继承；硬编码插件白名单（`['traceid','monitor']`）随之删除；保留既有 `emit('refresh')` 父页联动
- [x] 6.2 加载失败态与空态区分（A3 决策：共享 `useClusterPluginEntity.loadItems` 修失败态契约）：接口失败显示「加载失败：{原因}」+「重试」，MUST NOT 吞成「暂无全局规则」；插件组集群子页 `ClusterPluginConfigs.vue` 同步接入失败态 UI（同款缺陷一并修）并回归其既有测试
- [x] 6.3 集群子页空态给「无数据 → + 添加全局规则」分支（集群子页无筛选器，清空筛选分支属主页面，见 7.6）
- [x] 6.4 移除无消费方的卡片选中高亮（`selectedGlobalRule`，L6）
- [x] 6.5 组件测试：失败态重试、空态两分支、表单走共享组件断言

## 7. 文案与错误一致性（M3/M6 + 文案批）

- [x] 7.1 发布确认弹窗标题带资源名：「发布全局规则: {名称}」（对齐插件组页；主页面与集群子页两入口调用点都要覆盖）
- [x] 7.2 列表加载失败经 `getApiErrorMessage` 透出原因：「加载全局规则失败：{原因}」
- [x] 7.3 页头描述纠正：「全局规则对所属集群的全部路由生效，修改后需发布才会在 Edge 节点生效」（删去插件组「可被多个路由引用」复制）
- [x] 7.4 名称输入 `maxlength=100`（对齐后端约束）；「无插件」→「未选择插件」+ hover「发布时将下发空插件集」
- [x] 7.5 搜索框 `allow-clear` + SVG 图标替换 emoji；超 500 条截断提示（Dashboard 先例）；卡片网格 `repeat(auto-fill, minmax(340px, 1fr))`
- [x] 7.6 主页面空态两分支（M7 归属修正：筛选器在主页面）：无数据 →「暂无全局规则」+「+ 添加全局规则」；有筛选无匹配 →「无匹配结果」+「清空筛选」（对齐插件组页先例）
- [x] 7.7 死导入清理（`GlobalRuleList.vue:114`、`ClusterGlobalRules.vue:125` 残余）；更新受影响测试断言

## 8. 插件口径统一走 features.yaml 专用清单（H2，A1 二次修订）

- [x] 8.1 RED：features 配置校验用例——`global_rule_plugins` 非列表报错退出（对齐 `enabled_plugins` 先例）；文件未配置/缺 key 时 `get_global_rule_plugins()` 返回 `[]`（不限制）；`GET /system/features` 响应含新 key 且既有 `features`/`enabled_plugins` 字段不变（向后兼容）
- [x] 8.2 GREEN：`app/core/features.py` 新 key 校验 + `get_global_rule_plugins()` 单点 accessor；前端 features store 解析新 key
- [x] 8.3 `PluginEntityFormModal` 对 `global_rule` 资源按清单过滤插件目录（两入口单点；`enabled_plugins` 仍在目录层并行生效，可见集 = 目录 ∩ 清单）；确认集群子页硬编码已随 6.1 删除（前端 MUST NOT 存在第二份入口级白名单）
- [x] 8.4 `backend/features.yaml` 默认发 `global_rule_plugins: [traceid, monitor]`（集群子页现状精确保留，主页面全局规则表单收紧到这 2 个；**不动 `enabled_plugins`**）
- [x] 8.5 组件测试：两入口同源断言 + 清单过滤生效断言

## 9. 验证与验收

- [x] 9.1 后端：`cd backend && uv run pytest`（全局隔离，#104 全量可跑）；触及写库路径已过 PG 冒烟（1.5）
- [x] 9.2 前端：`npx vue-tsc -b`（#27，必须构建模式）+ `npx vitest run`（已知 ~5 个时序 flake，判定前单文件重跑，#196）；A2/A3 波及插件组集群子页与发布流共享测试，回归覆盖其既有用例（#51④）
- [x] 9.3 实页验收（#51②，Playwright 连 12345 实例）：主页面与集群子页各截图——①编辑已发布全局规则→出现「待发布」；②发布→「已发布」+时间、badge 双显消失；③删除确认→出现集群级警示行；④集群子页接口失败→失败态+重试（非空态）；⑤工具栏计数显示未发布/待发布；⑥版本弹窗标题显示「全局规则」
- [x] 9.4 `openspec validate --strict` 由编排方执行（#152；本机 CLI 不可用，#194）
