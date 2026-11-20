# Proposal

## Why

插件元数据「添加插件」下拉的可选插件，由逐插件写死的 `enable_metadata` 布尔字段控制（`backend/app/config/plugin_definitions.py`，14 真 / 14 假），要增删可选插件必须改 Python 源码并重启。全局规则已通过 features.yaml 顶层 `global_rule_plugins` 纯名单（global-rule-ux-close-loop D8）实现免改码热生效；插件元数据应对齐同一机制。2026-11-19 用户裁决推翻旧记忆 #201 中「可选清单维持 Python 写死」的半边（插件 schema 定义仍留 Python、类型校验不动，迁出的只是纯名单）。

## What Changes

- `backend/features.yaml` 新增顶层 `plugin_metadata_plugins`（插件名列表），仓库默认值 = 旧 `enable_metadata=true` 的全部 14 个插件（现状有效可见集仍为 data_center、log_process，因 enabled_plugins 平台白名单先行裁掉 12 个 security 系）。
- `app/core/features.py` 新增 `get_plugin_metadata_plugins()` 单点 accessor + `_validate` 分支：非列表 → 启动显式报错退出；空 / 未配置 / 文件不存在 → `[]`（= 不限制，目录全量）。mtime 热加载复用既有 `get_features()` 机制。
- 前端 `stores/features.ts` 新增清单解析（经 `GET /system/features` 自动透传，零端点改动）。
- 两个「添加」入口（独立页 `PluginMetadataList.vue`、统一管理集群 Tab `PluginMetadata.vue`）过滤条件从 `enable_metadata === true` 切换为「目录 ∩ 清单，空清单 = 不限制」，并各加一行 `featuresStore.load()` 兜底。
- **移除** `plugin_definitions.py` 全部 28 个插件的 `enable_metadata` 字段及前端类型引用，单一事实源 = features.yaml（守卫测试 `test_dns_upstream_plugin_def.py` 的字段断言改写为默认清单断言）。
- 后端创建端点 `POST /clusters/{id}/plugin-metadata` **不新增**清单校验（对齐全局规则 D8 前端可选性门控取舍；Edge 直连页 `PUT /nodes/{ip}/{port}/plugin_metadata/{name}` 为第二写入路径，平台校验拦不干净、加了反而两入口不一致）。
- 已配置条目不受清单影响：插件被移出清单后，其已配置元数据仍显示、可编辑、可删除、可发布（与现状过滤只拦「添加」的契约一致）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `plugin-metadata-management`：需求「新建插件元数据」的插件选择过滤条件变更——从写死 `enable_metadata=true` 改为 features.yaml `plugin_metadata_plugins` 清单过滤（空 = 不限制），并补充统一管理 Tab 添加入口同清单过滤的场景。
- `deployment-feature-config`：新增需求「plugin_metadata_plugins 专用清单 key」（镜像既有 `global_rule_plugins` 需求：类型校验 / 空 = 不限制 / 端点暴露向后兼容 / 单点 accessor 四场景）。

## Impact

- **后端**：`backend/features.yaml`、`app/core/features.py`（新 key 校验 + accessor，逐行镜像 `global_rule_plugins` 分支）；`app/config/plugin_definitions.py`（删字段）。
- **前端**：`stores/features.ts`、`views/PluginMetadataList.vue`、`components/PluginMetadata.vue`、`types/index.ts`（删 `enable_metadata` 可选字段声明）。
- **测试**：后端镜像 `tests/test_features_global_rule_plugins.py` 全套 + 改写 `tests/test_dns_upstream_plugin_def.py`；前端 `stores/features.test.ts`、`PluginMetadataList.test.ts`、`PluginMetadata.status.test.ts` 夹具切换，另加一条源码守卫（两入口不得再出现 `enable_metadata` 过滤，防回归写死）。
- **不动的部分**：`GET /plugins/builtin` 端点、插件 schema 定义（仍 Python 模块形态）、元数据 CRUD / 发布 / 版本链路、权限键、数据库 schema——全部零改动。
- **兼容性**：`/plugins/builtin` 响应中 `enable_metadata` 键消失（无外部消费方）；`GET /system/features` 只增不改；未配置新 key 的存量部署行为 = 目录全量可选（仓库默认值已精确保留现状，删 key 才会放宽）。
