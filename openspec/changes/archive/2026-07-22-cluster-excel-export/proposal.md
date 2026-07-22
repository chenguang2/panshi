## Why

运维人员和开发者需要一种方便的方式，将网关集群的完整配置数据导出到 Excel 文件中，以便在线下与其他人讨论哪些数据需要删除或修改。当前平台缺少批量导出功能，用户只能逐个页面查看数据，无法方便地分享和评审。

## What Changes

- 新增后端 API 端点 `GET /clusters/{cluster_id}/export`，生成包含集群所有配置数据的 Excel 文件（.xlsx）
- Excel 文件按数据类型分 Sheet（标签页），如上游服务、路由规则、插件组等
- 敏感字段（SSL 证书的私钥和证书内容）不导出，仅导元数据
- 前端 CentralList.vue 的集群展开详情区域新增"导出 Excel"按钮
- 后端新增 `openpyxl` 依赖

## Capabilities

### New Capabilities
- `cluster-data-export`: 将单个集群的所有配置数据导出为 Excel 文件，按数据类型分 Sheet，供线下讨论和审核使用

### Modified Capabilities

（无现有能力需要修改）

## Impact

- **后端依赖**: 新增 `openpyxl>=3.1.0` 到 `pyproject.toml`
- **后端 API**: 新增 `GET /api/v1/clusters/{id}/export` 路由
- **前端**: CentralList.vue 添加导出按钮和下载逻辑
- **无数据库变更**: 只读查询已有数据
