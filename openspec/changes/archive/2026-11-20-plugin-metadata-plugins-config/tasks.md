# Tasks

## 1. 后端专用清单 key（features.yaml + features.py）

- [x] 1.1 RED：新建 `backend/tests/test_features_plugin_metadata_plugins.py`（逐条镜像 `test_features_global_rule_plugins.py`）：非列表显式报错退出 / None 归一 `[]` / 空与未配置返回 `[]`（不限制）/ 配置读取生效 / `GET /system/features` 响应含 `plugin_metadata_plugins` / 仓库默认 features.yaml 清单恰为旧 `enable_metadata=true` 的 14 个插件；先跑确认新用例失败
- [x] 1.2 GREEN：`app/core/features.py` 新增 `get_plugin_metadata_plugins()` 单点 accessor + `_validate` 顶层 key 分支（非列表报错退出、None 归一 `[]`，逐行镜像 `global_rule_plugins` 分支）；`backend/features.yaml` 顶层新增 `plugin_metadata_plugins`（注释仿 global_rule_plugins 风格 + 默认 14 个插件名）；验证 `uv run pytest tests/test_features_plugin_metadata_plugins.py -q` 全绿

## 2. 前端 store 解析与两入口清单过滤

- [x] 2.1 RED：`stores/features.test.ts` 增 `plugin_metadata_plugins` 解析用例（含 key 缺失时默认 `[]` 向后兼容），先跑确认失败
- [x] 2.2 GREEN：`stores/features.ts` 新增 `metadataPlugins` ref + `load()` 解析 + 导出（对齐 `globalRulePlugins` 写法），验证用例全绿
- [x] 2.3 RED：`PluginMetadataList.test.ts` 夹具改造（`setActivePinia(createPinia())` + mock `/system/features` 响应带 `plugin_metadata_plugins`），断言四行为：清单内插件可选 / 清单外插件被滤 / 清单空（或缺失）= 不限制 / 已配置条目不受清单影响；`PluginMetadata.status.test.ts` 夹具同步调整；先跑确认失败
- [x] 2.4 GREEN：`views/PluginMetadataList.vue` 与 `components/PluginMetadata.vue` 可选插件谓词从 `p.enable_metadata === true` 切换为「`featuresStore.metadataPlugins` 非空 ? 清单含 name : true」，保留「未配置去重」合取条件，各加一行 `featuresStore.load().catch(() => {})` 兜底（对齐 `PluginEntityFormModal` 175 行先例）；验证 `npx vitest run PluginMetadataList PluginMetadata` 全绿

## 3. enable_metadata 全链路退役

- [x] 3.1 RED：新增前端源码守卫测试（如 `views/__tests__/pluginMetadataListSource.test.ts`）：扫描 `PluginMetadataList.vue` / `PluginMetadata.vue` 源码禁出现 `enable_metadata` 过滤、扫描 `types/index.ts` 与 `components/PluginMetadata.vue` 接口声明禁该字段；先跑确认失败（此时字段仍在）
- [x] 3.2 GREEN：删除 `backend/app/config/plugin_definitions.py` 全部 28 处 `enable_metadata` 字段行；删除 `frontend/src/types/index.ts`（213 行附近）与 `PluginMetadata.vue` 接口（159-166 行附近）的字段声明；清理两测试文件夹具中的 `enable_metadata` 残留键；改写 `backend/tests/test_dns_upstream_plugin_def.py` 断言为「仓库默认 `plugin_metadata_plugins` 清单不含 dns_upstream」；验证 `uv run pytest tests/test_dns_upstream_plugin_def.py -q` 绿 + 新源码守卫绿 + 全仓 grep `enable_metadata` 仅余 openspec 归档/变更文档与本任务说明
- [x] 3.3 同域回归：`cd backend && uv run pytest -k "features or metadata or dns_upstream" -q` 全绿（覆盖 features 校验族与插件元数据 API 族既有用例，无旧语义断言残留）

## 4. 收口验证（集成）

- [x] 4.1 后端全量：`cd backend && uv run pytest` 全绿（0 failed）
- [x] 4.2 前端全量：`cd frontend && npx vitest run --maxWorkers=4` 全绿 + `npx vue-tsc -b` 零错误
- [x] 4.3 工件校验：`openspec validate --all` 0 error（Purpose 过短 WARNING 可忽略）
- [x] 4.4 真机验证（常驻 12344/12345，勿自启停）：临时改 `backend/features.yaml` 清单（增删一项）→ 刷新页面后两入口「添加」下拉即时反映新清单（后端 mtime 热加载、免重启）；已配置条目（如 log_process）仍显示可编辑；把一个无 `metadata_schema` 的插件临时加进清单验证编辑表单回落路由级 schema、JSON 模式可用；验证完成把 features.yaml 恢复默认 14 清单并复核 `/system/features` 返回

## Workflow follow-up

- 实现收口后按用户指令 commit（git status 复核，勿 force-add 忽略文件）
- 用户验收通过后归档本变更（openspec CLI 归档流 + `openspec validate --all` 收口），归档时 MODIFIED 块以当下主 spec 现文核对
- AGENTS.md 无需新增约定（features.yaml 顶层 key 增补属 deployment-feature-config 既有需求族的延伸，不新增防错规则）
