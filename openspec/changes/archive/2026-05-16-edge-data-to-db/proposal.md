## Why

有一套或多套已通过其他系统（非磐石 Admin）配置好的 Edge 网关节点（APISIX），它们已有运行中的路由、上游、插件等配置。磐石 Admin 需要能够将这些 Edge 节点的**现有运行时数据拉取并导入到本地数据库**，使其纳入磐石的管理体系，之后可通过磐石 Admin 进行后续的配置变更和发布。

## What Changes

- **后端新增 Edge 数据导入服务**：调用 Edge 节点 Admin API（`GET /apisix/admin/routes`、`/upstreams`、`/plugin_configs`、`/global_rules`），拉取所有配置数据
- **后端新增数据转换层**：将 APISIX 标准格式（如 `type: roundrobin`、`nodes` 字典等）转换为磐石数据库格式（`load_balance: weighted_roundrobin`、`ps_upstream_target` 多条记录等）
- **后端新增导入流程 API**：三步流程——连接测试、数据预览（含冲突检测）、确认导入
- **后端新增冲突处理策略**：名称冲突时自动添加 `-imported` 后缀；路径重复时跳过并报告
- **后端新增导入记录表 `ps_import_log`**：记录每次导入的来源节点、导入内容、冲突情况和结果
- **前端新增"Edge 数据导入"独立页面**：三步向导——选择集群、连接节点、预览并确认导入
- **不修改现有发布/同步流程**：导入仅做一次性数据填充，后续管理仍走现有发布路径

## Capabilities

### New Capabilities

- `edge-data-import`: Edge 节点现有配置的导入功能，包括连接测试、数据拉取、格式转换、冲突检测和批量写入

### Modified Capabilities

<!-- 不涉及现有 spec 的需求变更——导入功能是新增的独立能力，不影响已发布的 spec -->

## Impact

- 后端：新增 `app/services/edge_import_service.py`（数据拉取+转换）、`app/api/v1/edge_import.py`（导入路由）、`app/models/edge_import.py`（导入日志模型）
- 数据库：新增 `ps_import_log` 表，无需修改现有业务表
- 前端：新增 `frontend/src/views/EdgeImport.vue`（三步向导页面）、`frontend/src/api/edgeImport.ts`（API 调用层）
- 路由：新增 `/edge-import` 前端路由和菜单项
- 无新增外部依赖
