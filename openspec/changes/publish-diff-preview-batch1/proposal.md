# Proposal

## Why

发布差异预览已在上游/路由上线（publish-diff-preview，主 spec 已归档），但其价值——「待发布/部分失败时一次点击看到待发布配置与各 Edge 节点实况的逐节点差异」——同样适用于其余经统一发布编排的资源。机制为注册表驱动（PUBLISH_PREVIEW_REGISTRY），扩展即：每类抽取候选载荷构造单点 + publish 端点同源改调 + 入口接 ▾ 按钮。批 1 先做与上游/路由 UI 完全同构的三类表格资源（插件组、全局规则、插件元数据），低风险机械扩展；SSL（卡片 UI、无 partial）与四层/DNS（同表双载荷形态）留批 2 单独评审。

## What Changes

- 候选载荷构造单点扩展 3 类（publish_preview.PUBLISH_PREVIEW_REGISTRY + build_candidate）：
  - `plugin_config`：插件组（config_data 含 description/plugins；edge_data = {desc, plugins}）
  - `global_rule`：全局规则（同上形态）
  - `plugin_metadata`：插件元数据（edge_data 即解析后的 config_data 本体；Edge 存储展平信封由既有 normalize 钩子处理）
- 对应 3 个 publish 端点（cluster_plugin_configs / cluster_global_rules / cluster_plugin_metadata）内联载荷构造移除、改调共享单点，行为零变化；源码守卫 test_publish_candidate_single_source.py 逐域扩展。
- 前端 6 个入口接入 PublishDiffButton + PublishPreviewModal（插件组：PluginConfigList + 集群 Tab ClusterPluginConfigs；全局规则：GlobalRuleList + 集群 Tab ClusterGlobalRules；插件元数据：PluginMetadataList + 统一管理 Tab PluginMetadata 组件）；按钮显隐沿用 pending || partial 两态；「去发布」回接各页面既有发布流程。
- PublishPreviewModal 的 resourceType 联合类型与 RESOURCE_LABELS 扩至 5 类（含已上线 2 类）。
- 四入口列宽经验沿用：新接入口的发布状态单元格一律包 status-cell-flex；发布状态列宽如已定宽且不足 200 则同步调整。

## Capabilities

### New Capabilities

<!-- 无新能力：本变更扩展既有 publish-diff-preview 能力的资源范围。 -->

### Modified Capabilities

- `publish-diff-preview`: 首批范围需求由「上游与路由两类」扩展为「上游、路由、插件组、全局规则、插件元数据五类」；入口按钮状态范围需求的「上游与路由的列表（四入口）」扩展为三类资源六入口，一致性要求同步覆盖。

## Impact

- 后端：`app/services/publish_preview.py`（注册表 +3 build_candidate）；`app/api/v1/cluster_plugin_configs.py`、`cluster_global_rules.py`、`cluster_plugin_metadata.py`（发布载荷同源改调）；`tests/test_publish_candidate_single_source.py`（+3 域）；`tests/test_publish_preview.py`（+3 类用例：候选构造、400/404、matrix）。
- 前端：`api/clusters.ts`（类型放宽）；`components/PublishPreviewModal.vue`（resourceType 联合 + labels）；6 个入口组件接按钮与弹窗；守卫 `PublishDiffButton.consumers.source.test.ts` 扩展 6 入口 + 列宽检查。
- 复用不改：预览端点/编排/diff 机器零改动（注册表天然支持）；列表响应 pending_publish/last_publish_status 三类均已接线（既有 spec），无列表端点改动。
- 无模型/列变更；发布主链路 3 处调用侧改造由各域既有发布测试回归兜底。
