## Context

当前平台在 CentralList.vue 中以 Tab 页形式展示集群的各类配置数据（上游、路由、插件组等），但没有任何批量导出功能。用户需要一种方式将整个集群的配置导出到 Excel 文件中，以便离线分享、讨论和评审配置变更。

后端基于 FastAPI + async SQLAlchemy 2.0，所有集群关联的数据模型都有 `cluster_id` 外键。

## Goals / Non-Goals

**Goals:**
- 单个 API 调用导出集群全部配置数据到一个 .xlsx 文件
- Excel 按数据类型分 Sheet，包含：集群信息、集群节点、上游服务、路由规则、插件组、全局规则、插件元数据、四层代理、静态资源、SSL 证书（元数据）
- SSL 证书的私钥和证书内容不导出
- 集群的 `admin_key` 不导出（凭证敏感）
- 子表数据（UpstreamTarget、RoutePlugin）合并到父表的一列中展示
- 无数据的 Sheet 保留表头行（空 Sheet），让用户明确知道该类型"没有数据"
- 前端集群展开详情区增加一个"导出 Excel"按钮
- 导出文件名格式：`{集群标识}_配置导出.xlsx`

**Non-Goals:**
- 不按类型单个导出（只做全量导出）
- 不包含 ConfigVersion（版本历史快照数据量大，不适合讨论用途）
- 不做 Excel 导入功能
- 不做自定义列选择导出

## Decisions

### 1. 后端生成 Excel（server-side）而非前端生成

**选择**: 后端用 openpyxl 生成 Excel

**理由**:
- 数据库在服务端，后端一次性查询所有数据更高效，无需通过 API 逐页获取
- 处理大数据量时不受浏览器内存限制
- 前后端职责清晰：后端负责数据聚合和格式化，前端只需触发下载

**替代方案**: 前端用 xlsx (SheetJS) 库在浏览器中生成
- 否决理由：需要前端先拉取所有数据，再组装 Excel。如果数据量大（数千条路由+上游），需要多次 API 调用，体验差

### 2. 独立路由文件（cluster_export.py）而非追加到现有文件

**选择**: 新建 `backend/app/api/v1/cluster_export.py`

**理由**: 遵循项目中 `cluster_upstreams.py`、`cluster_routes.py` 等各资源独立文件的既有模式，导出作为一个独立关注点。`clusters.py` 已较大（400 行），不适合再加导出逻辑。

### 3. 使用 openpyxl 而非 xlsxwriter

**选择**: openpyxl

**理由**: openpyxl 支持读写、样式丰富、纯 Python 无系统依赖。虽然本次只需要写，但 openpyxl 生态更好，后续需要读 Excel 追加功能时无需换库。

### 4. 数据查询使用 asyncio.gather 并行

**选择**: 同时拉起 10 个 async 查询任务并行获取所有类型数据

**理由**: 各查询之间无依赖关系，并行可显著减少总响应时间。10 张表的简单 count + select 在 SQLite/PostgreSQL 上都是微秒级操作，gather 可让总延迟 ≈ 最慢单查询的延迟。

### 5. 敏感字段处理

**选择**: SSL 证书 Sheet 不包含 `cert`、`private_key`、`sign_cert`、`sign_key`、`client_ca`、`generate_log` 字段

**理由**: 导出的 Excel 用于分享讨论，不应包含私钥等敏感信息。只导出名称、SNI、证书类型、算法等元数据。

### 6. JSON 字段格式化

**选择**: JSON 字段（如 `Upstream.timeout`、`Route.vars` 等）在单元格中以 pretty-printed JSON 字符串显示

**理由**: 纯文本展示 JSON 结构，用户在 Excel 中可以直接阅读。如果用多列展开 JSON 结构会使列数爆炸且 Schema 不固定。

### 7. 前端按钮位置

**选择**: 在 CentralList.vue 的 `expanded-name-row` 按钮组中（与"详情""连接测试""编辑""删除"同行）增加"导出 Excel"按钮

**理由**: 这是集群详情展开后的操作栏，所有集群级操作都在这里。用户展开集群后直觉上会在这一行找操作入口。

### 8. 子表合并到父表列中展示

**选择**: UpstreamTarget 合并到"上游服务"Sheet 的"目标节点"列（`ip:port(权重)` 分号分隔），RoutePlugin 合并到"路由规则"Sheet 的"插件"列（`plugin_name: {config}` 分号分隔）。若子表无数据，该列显示"（无）"

**理由**: 避免列数爆炸，同时保留完整信息。用户一目了然看到每个上游/路由的关联项。

### 9. 全部或全不（atomic）错误处理

**选择**: 先并行查询全部 10 类数据到内存中，确认全部成功后，再一次性写入 Excel 并返回。查询中途失败直接返回 500，不写任何 Excel 内容。

**理由**: 保证用户拿到的 Excel 总是完整的。一次导出操作的数据量（一个集群几百到几千条文本记录）不会撑爆内存。

### 10. 空 Sheet 保留表头

**选择**: 某类数据为空时，对应 Sheet 仍然创建，只保留一行表头（列名）。

**理由**: 用户看到空的 Sheet 能明确知道"该类型没有数据"，而不是猜测"是不是导出漏了"。

### 11. 表头格式

**选择**: 每个 Sheet 的第一行为加粗列名（中文），列宽自动适配内容。

**理由**: 导出的 Excel 是给人讨论用的，美观易读的表头能降低理解成本。

### 12. 权限控制

**选择**: 能查看该集群的用户即可导出，无需 admin 权限。后端复用 cluster_id 存在性检查，cluster 不存在时返回 404。

**理由**: 普通用户也有数据讨论需求；敏感字段（SSL 私钥、admin_key）已排除，无额外泄露风险；后端不增加额外权限查询。

## Risks / Trade-offs

- **[并发查询** → **连接池压力]**: 10 个并行查询同时使用同一个 db session。Mitigation: 使用同一个 `AsyncSession`，SQLAlchemy 的 `AsyncSession` 内部用 `asyncio.Lock` 序列化，实际是串行执行，不会压垮连接。gather 只节省编排开销
- **[大集群数据量** → **Excel 体积大]**: 如某个集群有上万条路由，生成的 Excel 可能较大。Mitigation: openpyxl 支持写入优化模式（`write_only=True`），可处理大数据量。首次实现先不做分页导出，后续可按需优化
- **[openpyxl 依赖** → **部署体积]**: openpyxl 约 10MB。Mitigation: 纯 Python，不影响系统库，Docker/venv 部署无痛
