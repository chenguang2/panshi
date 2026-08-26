## Context

统一管理的"导出 Excel"（`backend/app/api/v1/cluster_export.py`）是人读报表：字段不全、值展示化、不含证书内容与 `admin_key`，无法作为导入数据源。

关键现状：

- 业务表主键均为普通 `Integer primary_key`，且**全表唯一、不按集群隔离**——这是本次评审确定导入模式的关键约束。
- 多数业务表带有 `edge_uuid`（发到 Edge 侧的外部身份），唯一约束为 `(cluster_id, edge_uuid)` 联合唯一；`route.plugin_config_ids` 存的是同集群插件组的 `edge_uuid` JSON 数组。
- 节点表 `ps_node` **没有 name 字段**，业务身份是 `ip + service_port`。
- `stream_proxies.ref_node_id` 引用节点 ID（用于端口检测），导入时必须随节点新 ID 重映射。
- `app/core/db_migration.py` 提供 `DEPENDENCY_ORDER` 等整库迁移基础设施；「数据库管理」功能已覆盖 SQLite↔PG 整库迁移（含 PG 序列 setval 重置）。

## Goals / Non-Goals

**Goals:**

- 集群级 JSON 全量备份导出：覆盖 Excel 缺失的全部表与字段
- 单一导入模式：新建集群 + 数据库分配新 ID + 名称/ip:port 映射重建外键
- 内容缺失与源数据悬空引用一律**降级 + 警告清单**，不做硬失败
- 备份文件自带版本号与校验和

**Non-Goals:**

- 不改动现有 Excel 导出功能；不做 Excel 反向导入
- **不做"保 ID 还原"模式**：业务表主键全表唯一，非空库上保 ID 插入必然冲突；整库级灾备恢复走「数据库管理」整库迁移（已含序列重置）
- 不做跨集群合并；不改 UUID 主键（`edge_uuid` 已承担对外稳定标识职责）

## Decisions

### D1. 备份文件格式

单文件 JSON（UTF-8），顶层结构：

```json
{
  "format": "panshi-cluster-backup",
  "version": 1,
  "created_at": "2026-08-25T12:00:00",
  "source_cluster": { "id": 1, "name": "demo" },
  "options": { "include_secrets": false, "include_files": false },
  "data": {
    "cluster": { },            // 除 admin_key 外全字段
    "nodes": [ ],              // 全字段（含 ssh_port/status_detail）
    "upstreams": [ ],          // 全字段；每项内嵌 "targets": [ ... UpstreamTarget 全字段 ]
    "routes": [ ],             // 全字段（vars/enable_websocket/remote_addrs/...）；每项内嵌 "plugins": [ ... RoutePlugin 全字段 ]
    "plugin_configs": [ ],
    "global_rules": [ ],
    "plugin_metadatas": [ ],
    "stream_proxies": [ ],     // 全字段（timeout/checks/retries/sni/ref_node_id/...）
    "static_resources": [ ],   // 元数据全字段；include_files=true 时附 "content_base64"
    "ssl_certificates": [ ]    // 元数据全字段；include_secrets=true 时附 cert/key/sign_cert/sign_key/client_ca
  }
}
```

- 子表（targets、route plugins）**内嵌**到父行而非平铺。
- 文件下载前对 `data` 计算 SHA-256 写入响应头 `X-Backup-Checksum`；导入时重新计算比对。
- `version` 用于格式演进；导入遇到更高版本直接拒绝。

### D2. 导出范围、敏感开关与降级

- 表集合：`ps_cluster`（当前集群行）、`ps_node`、`ps_upstream`+`ps_upstream_target`、`ps_route`+`ps_route_plugin`、`ps_plugin_config`、`ps_global_rule`、`ps_plugin_metadata`、`ps_stream_proxy`、`ps_static_resource`、`ps_ssl_certificate`。
- **不导出**：`admin_key`（始终排除）、发布版本历史（`ps_config_version`）、`ps_node_autostart`（节点本地运维配置）、用户/权限/审计表（全局数据）。
- `include_secrets`（默认 false）：控制 SSL 证书的 `cert/key/sign_cert/sign_key/client_ca`。false 时输出 null。
- `include_files`（默认 false）：控制静态资源文件本体（base64）。false 时仅元数据。
- **导出降级**：`include_files=true` 但某资源文件在磁盘上已缺失 → 跳过该文件的 content_base64（保留元数据），计入导出响应的警告清单，不中断整个导出。
- 时间戳字段一律 ISO-8601 字符串。

### D3. 导入模式（唯一）：新建集群 + 新 ID + 映射重建外键

步骤：

1. 解析备份，硬校验（见 D6）；创建新集群行（名称由请求指定，校验同名冲突），得到 `new_cluster_id`。
2. 按 `DEPENDENCY_ORDER` 逐类插入；**所有行的 `id` 忽略**，由数据库分配；`cluster_id` 统一替换为 `new_cluster_id`。
3. 构建映射并重建外键：插入时捕获**旧 ID → 新 ID 精确映射**（等价且强于设计初稿的"名称/ip:port 映射"，不依赖名称唯一性——源数据重名不影响导入）：
   - `route.upstream_id` / `static_resource.route_id` / `ssl.ca_cert_id` / `stream_proxies.ref_node_id` 均按旧 ID 查映射重建
4. `edge_uuid` **全部保留原值**：`(cluster_id, edge_uuid)` 联合唯一不冲突；`plugin_config_ids` 存的就是同集群插件组 edge_uuid 数组，保留后该引用无需重映射。
5. **源数据悬空引用自动清理**：无法解析的引用直接剔除/置空（如 `plugin_config_ids` 数组移除失效项、`ref_node_id` 置空），照常导入并计入警告清单——备份的意义在于救援数据，不被源库历史脏数据卡死。
6. 字段修正：`creator_id` = 当前操作者；各实体 `current_version` 重置为空；集群 `status` 默认启用；**节点 `status` 一律重置为离线(0)**（运行态数据从备份恢复无意义，导入后由平台健康检查自动刷新）。
7. 整个导入单事务包裹，任一步失败全部回滚。（备份内实体重名不阻断导入，见 D6 说明。）

自增影响：无。ID 从未出现在 INSERT 中，SQLite 取 max+1、PG 序列正常推进。

### D4. 为什么不做"保 ID 还原"模式

评审结论：业务表主键全表唯一而非按集群隔离，任何非空数据库上按原 ID 插入都可能与其他集群的行冲突（SQLite 删除后 max+1 还会复用 id）。"保 ID 集群级还原"只在整库为空时安全，而该场景就是「数据库管理」整库迁移已覆盖的能力。故本能力只保留单一导入模式。

### D5. API、权限与结果反馈

- `GET /api/v1/clusters/{cluster_id}/backup?include_secrets=&include_files=` → JSON 文件下载（StreamingResponse，`Content-Disposition` 带 `<集群名>_备份_<日期>.json`），响应头带校验和与警告清单（如跳过的资源文件）。
- `POST /api/v1/clusters/import` → multipart 上传备份文件 + 表单参数 `target_cluster_name`。响应返回新集群 id 与两类列表：
  - `warnings[]`：自动清理的悬空引用等
  - `pending_items[]`："需补齐清单"——无内容的证书（需重新生成或单独导入）、无文件的静态资源（需重新上传）
- **导入后的集群处于未发布状态**，响应与前端结果页明确提示"需手动发布才生效到 Edge"；不提供自动发布选项。
- 仅管理员角色可调用。前端统一管理页新增【备份下载】与【从备份恢复】入口。

### D6. 校验分级：硬失败 vs 自动清理

**硬失败**（400，列出全部问题，不产生任何写入）：

- format/version/checksum 不匹配
- 必备数据键缺失、行内必备字段缺失或类型非法
- 目标集群名不可用（已存在）

> 评审修正：原设计的"备份内名称唯一性"硬校验已移除——demo 集群实测存在大量历史重名路由，
> 而导入用旧 ID→新 ID 精确映射、不依赖名称，重名无害不应阻断。

**自动清理 + 警告**（不阻断导入，逐项记入 warnings）：

- 源数据悬空引用（plugin_config_ids 失效项、ref_node_id 无法解析、ca_cert_id/route_id/upstream_id 名称解析失败时对应行剔除引用或置空）
- include_secrets=false 导致的证书无内容、include_files 缺失导致的资源无文件（同时进 pending_items）

## Risks / Trade-offs

- **备份含私钥的安全风险**：`include_secrets=true` 的备份等同密钥材料，界面与文档明示妥善保管；默认关闭。
- **静态资源文件体积**：base64 膨胀约 33%；大文件建议 `include_files=false` 并另行迁移。
- **发布历史不迁移**：导入后首次发布即 v1；配合"未发布"提示，用户预期清晰。
- **源数据允许重名**：导入结果忠实保留重名实体（与源集群一致）；平台界面上的同名歧义由既有列表页自行呈现。
- **悬空引用自动清理改变语义**：导入结果与源集群不完全一致（少了失效引用），但全部体现在 warnings 中可追溯。
