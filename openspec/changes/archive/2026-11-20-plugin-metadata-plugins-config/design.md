# Design

## Context

- 现状链路：`enable_metadata` 布尔字段逐插件写死在 `backend/app/config/plugin_definitions.py`（28 定义，14 真 / 14 假）；「添加」入口的两个消费点各自前端过滤——独立页 `PluginMetadataList.vue`（约 285 行的可用插件 computed）与统一管理集群 Tab `components/PluginMetadata.vue`（约 260 行 `availablePlugins`），谓词均为 `p.enable_metadata === true && !已配置`；`GET /plugins/builtin` 端点不做该过滤（仅 enabled_plugins 平台白名单 + DB 插件开关两层）；创建端点 `POST /clusters/{id}/plugin-metadata` 仅查重、无清单校验。
- 仿照先例：`global-rule-ux-close-loop` D8 为全局规则建成的四步链路——features.yaml 顶层 `global_rule_plugins` 纯名单 → `features.py::get_global_rule_plugins()` 单点 accessor + `_validate` 分支（非列表显式报错、None 归一 `[]`）→ `GET /system/features` 整字典透传 → 前端 `featuresStore.globalRulePlugins` + `PluginEntityFormModal.catalogPlugins`「目录 ∩ 清单」过滤（空清单 = 不限制）。
- 既有约束：features store `load()` 在 `loaded=true` 后短路（应用生命周期内不重复请求）；`_validate` 对顶层未知 key 不拒绝（`concurrency` 先例，注释在 `features.py` 189 行附近）——这保证回滚干净（旧代码容忍多余 key）。
- 用户已裁决五项（2026-11-19）：key 名 `plugin_metadata_plugins`；空/未配置 = 不限制；仓库默认发全部 14 个旧真值插件；`enable_metadata` 字段删除；后端不加创建校验。

## Goals / Non-Goals

**Goals:**

- 插件元数据两个添加入口的可选集合由 features.yaml 顶层 `plugin_metadata_plugins` 单点控制，免改码、后端 mtime 热加载。
- `enable_metadata` 字段彻底退役，单一事实源 = features.yaml 清单。
- 完全复刻 D8 链路形态（校验 / accessor / 端点暴露 / store 解析 / 前端过滤），零新机制。

**Non-Goals:**

- 不动插件 schema 定义——`plugin_definitions.py` 仍为 Python 模块形态、保留类型校验（旧裁决 #201 的该半边维持，迁出的只是纯名单）。
- 不动 `GET /plugins/builtin` 端点、`enabled_plugins` 部署级语义、DB 插件开关层。
- 不给后端创建端点加清单校验（用户裁决 D5；Edge 直连页 `PUT /nodes/{ip}/{port}/plugin_metadata/{name}` 为第二写入路径，平台校验拦不干净）。
- 不做前端实时热推送——改 yaml 后后端即时生效（`/system/features` 下次请求返回新值），前端页面刷新（F5）后下拉可见，与 `global_rule_plugins` 现状表现一致。
- 不涉及权限键 / 菜单 / 路由（非功能闸门、纯清单，无 AGENTS #61 四层接线需求）。

## Decisions

- **D1 key 名 = `plugin_metadata_plugins`**。命名规则「资源域名_plugins」与 `global_rule_plugins` 机械对齐；插件元数据的权限键、路由前缀、`resource_type` 均为 `plugin_metadata`，grep 一发即中。备选 `metadata_plugins` 弃：与「元数据」泛用词混淆、定位多一步。
- **D2 空/未配置 = 不限制（fail-open），仓库默认发清单精确保留现状**。备选「空 = 回落内置 `enable_metadata`」弃：双机制长期并存，写死退役不彻底。
- **D3 仓库默认清单 = 全部 14 个 `enable_metadata=true` 插件**（data_center、log_process、security_common_body、security_corerule、security_common_args、security_common_cookie、security_common_referer、security_common_uri、security_common_useragent、security_restrict_ip、security_restrict_uri、security_restrict_form、security_super_ip、security_super_user）。实际可见集今天不变（12 个 security 系被 `enabled_plugins` 第一层先行裁掉，可见仍为 data_center + log_process）；将来 `enabled_plugins` 扩容后新插件自动流进元数据下拉，无需再改本清单。备选只发有效集 `[data_center, log_process]` 弃：扩容后需二次改清单。
- **D4 `enable_metadata` 字段删除、前端停止消费**。连带：`types/index.ts` 213 行附近与 `PluginMetadata.vue` 159-166 行接口声明的字段清理；守卫测试 `test_dns_upstream_plugin_def.py` 的「dns_upstream enable_metadata is False」断言改写为「仓库默认清单不含 dns_upstream」。备选保留为惰性文档字段弃：本仓库由 LLM 长期维护，无消费方的死字段误导未来会话。
- **D5 后端创建端点不加清单校验**。对齐全局规则 D8 前端可选性门控取舍；校验拦不干净（Edge 直连页第二写入路径），加了反致两入口行为不一致。清单不是安全边界。
- **D6 前端过滤实现 = 各入口本地 filter、消费同一 store ref**。两入口把谓词从 `p.enable_metadata === true` 替换为「`featuresStore.metadataPlugins` 非空 ? 清单含 p.name : true」，保留「未配置去重」合取条件；形态对齐 `PluginEntityFormModal.catalogPlugins`（目录 ∩ 清单）。两入口各加一行 `featuresStore.load().catch(() => {})` 兜底（store 已缓存时短路，失败静默 = 不限制，对齐 PluginEntityFormModal 175 行先例）。不做后端 `?metadata=1` 参数化（避免 `/plugins/builtin` 语义分叉，偏离先例）。
- **D7 已配置条目显示契约不变**：`configuredPlugins` 走 `/clusters/{id}/plugin-metadata` 独立加载，不与清单求交；插件移出清单后已配置条目仍显示、可编辑、可删除、可发布。

## Risks / Trade-offs

- [存量部署未配新 key → 元数据「添加」下拉放宽为目录全量] → 仓库默认 features.yaml 发 14 清单且随产品包分发（`deployment-feature-config`「构建部署集成」既有需求：gen-linux/gen-mac 拷贝 backend/features.yaml），真实部署面不会遇到空 key；主动删 key 才放宽，属配置者自担。
- [无 `metadata_schema` 的插件被放行后，编辑表单回落其路由级 schema 作骨架] → 现状行为（如 data_center 连 schema 都为空 `{}`）；`PluginEditorDrawer` 双模式编辑器 JSON 模式始终可用（AGENTS #4），operator 挑选清单时应知。
- [`/plugins/builtin` 响应中 `enable_metadata` 键消失] → 消费方仅本变更涉及的前端两处 + 测试夹具，随本变更同步清理；源码守卫钉死两入口不得回归 `enable_metadata` 过滤。
- [前端列表变更需页面刷新才可见] → store 缓存短路所致，与 `global_rule_plugins` 表现一致，接受；后端 mtime 热加载保证 `/system/features` 即时返回新值。
- [删 Python 字段涉及 28 处定义行] → 纯机械删除、无逻辑耦合（后端无任何 `enable_metadata` 消费方，`grep` 已核实仅定义处与一条守卫断言）。

## Migration Plan

- 单批合入（后端 features.yaml + features.py + plugin_definitions.py 删字段；前端 store + 两入口 + 类型清理），无 DB 迁移、无新增模型列（不触发 #103 PG 冒烟硬性条件与 #118 COLUMN_MIGRATIONS）。
- 部署即生效：features.yaml 随包，打包链既有「构建部署集成」需求覆盖。
- 回滚干净：revert 该 commit 即回到 `enable_metadata` 写死行为；正向合入期间旧代码对多余顶层 key `plugin_metadata_plugins` 容忍（`_validate` 不拒顶层未知 key），无兼容窗口。

## Open Questions

（无——五项决策均经用户批准，无遗留可延迟问题。）
