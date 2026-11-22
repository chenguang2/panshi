# cluster-panel-scoped-spec-consolidation

## Why

2026-11-21/22 的「统一管理面板 7 个 Tab = 独立页组件 scoped 单实现」（`AGENTS.md #93`）删除了全部面板专属组件与配套 composable：

| 已删除 | 现由谁承载 |
|---|---|
| `views/clusters/ClusterNodes.vue` | `views/NodeList.vue`（`scopedClusterId` 形态） |
| `views/clusters/ClusterUpstreams.vue` | `views/UpstreamList.vue` |
| `views/clusters/ClusterRoutes.vue` | `views/RouteList.vue` |
| `views/clusters/ClusterGlobalRules.vue` | `views/GlobalRuleList.vue` |
| `views/clusters/ClusterPluginConfigs.vue` | `views/PluginConfigList.vue` |
| `views/clusters/ClusterStaticResources.vue` | `views/StaticResourceList.vue` |
| `composables/useClusterUpstreams.ts` / `useClusterRoutes.ts` / `useClusterGlobalRules.ts` / `useClusterPluginConfigs.ts` | 全部删除（列表/发布/版本由各页自持） |
| `composables/useClusterNodes.ts` / `useClusterStaticResources.ts` | 仅保留活路径（`loadNodes`、`uploadStaticResource` 等） |

这些改动使 12 份 spec 失效（6 份 `cluster-*-component`、6 份 `cluster-*-composable`，共 18 条 Requirement / 约 70 个 Scenario）：它们描述的是「组件渲染哪些列 / composable 返回哪些 ref / `cluster.selectedUpstreamKeys` 这类字段」，而组件、composable、字段均已不存在。

其中**一部分行为要求仍然成立且必须保留**（DNS 路由只读、保存后发布引导、表单统一共享实现、加载失败与空态区分、跨 Tab 校验反馈、表单误关保护、禁用动作必须带原因 tooltip、换绑路由等），只是载体从「面板组件」变成「独立页组件的 scoped 形态」。

同期还有两处新增行为需要落入 spec：
- **上游批量删除的引用预检**（`GET /clusters/{cluster_id}/upstreams/references`）——`upstream-batch-delete` 早已要求「弹确认框前剔除被引用上游」，A 推广期间前端实现丢失（后端拦截仍在），批次 B2 已修复并新增只读端点；
- **SPA 启动期路由兜底**（静态 catch-all 占位 + 特征路由注册后重导航 + 404 空态），消除启动期 `No match found` 告警并把未知路径从白屏改为明确空态。

## What Changes

- **REMOVED**：12 份失效 spec 的 18 条 Requirement（分量列出 Reason 与 Migration 指针）。
- **ADDED** `cluster-panel-scoped-tabs`：把仍成立的行为要求收敛成一份「面板 Tab = 独立页 scoped 单实现」规格。
- **ADDED**（`upstream-batch-delete`）：引用预检只读端点的契约。
- **ADDED** `spa-route-bootstrap`：启动期占位路由、注册后重导航、404 空态。

## Impact

- 规格文档：删除 12 份、新增 1 份、追加 2 条 Requirement。
- 代码：无（实现已在 `AGENTS.md #93` 对应批次合入，批次编号见 `docs/refactoring/shared-core-plan-2026-11-21.md` 第九节与 `docs/refactoring/open-items-2026-11-22.md`）。
- 校验：归档后 `openspec validate --all` 应 0 error。
