## Context

Edge 节点已提供 SSL 证书管理 API（`/edge/admin/ssl`），支持证书的增删改查。磐石 Admin 需要在前端提供管理界面。

SSL 证书通过 SNI（Server Name Indication）自动匹配，与路由无关。Edge 节点收到 HTTPS 请求时，根据 TLS 握手中的 SNI 域名自动选择匹配的证书。因此不需要在路由上关联证书 ID。

上游 `scheme` 已经支持 `https`（文档第 1258 行），只是前端 UI 未暴露此选项。

## Goals / Non-Goals

**Goals:**
- SSL 证书独立管理页面，支持卡片网格展示
- 上传/编辑（cert + key 文件或文本粘贴）
- 删除（可选同时从 Edge 节点删除）
- 发布到 Edge 节点
- 证书存在 DB 中，作为管理端记录，发布时推送到 Edge 节点
- 上游 scheme 下拉增加 `https` 选项

**Non-Goals:**
- 不涉及 Edge 节点的 SSL 监听端口配置（那是节点运维范畴）
- 不实现证书自动续期
- 不实现双向认证（mTLS）管理界面（但 Edge API 支持，后续可扩展）
- ❌ 路由不关联 SSL 证书（Edge 通过 SNI 自动匹配，路由无需改动）

## Decisions

### 1. 数据存储策略
- **选择**：证书存 DB，发布时推送到 Edge 节点
- **理由**：DB 是权威数据源，页面列表直接从 DB 查询，不依赖 Edge 节点在线状态；发布时通过 EdgeClient 推送到目标集群的所有活跃节点
- **备选**：仅存 Edge → 页面加载依赖 Edge 节点在线；双写 → 一致性问题

### 2. SSL 证书与集群的关系
- **选择**：证书绑定到集群（`cluster_id`），发布时推送到该集群的所有活跃节点
- **理由**：与 PluginMetadata、PluginConfig 等资源的模式一致，复用现有 `publish_to_nodes` 流程

### 3. 证书 ID 策略
- **选择**：自动生成 `edge_uuid`（UUID），与 upstream/route 一致
- **理由**：`name` 是用户可读名称，不做唯一标识；Edge 端使用 UUID 避免命名冲突

### 4. 发布状态追踪
- **选择**：使用 `current_version` + `ConfigVersion` 机制
- **理由**：复用现有版本管理能力，可查看发布历史和配置 diff

### 5. 删除保护
- **选择**：已发布的证书删除时弹出警告，列出已发布节点
- **理由**：与现有 upstream/route 删除模式一致，防止误删导致 HTTPS 中断

### 6. 路由无 SSL 关联
- **选择**：路由不需要任何 SSL 相关字段
- **理由**：Edge 收到 HTTPS 请求时根据 SNI 自动匹配证书，与路由无关

### 7. 证书上传 UI
- **选择**：同时支持文件上传和文本粘贴两种方式
- **理由**：文件上传适合已有证书文件；文本粘贴适合从其他系统复制

### 8. 私钥存储
- **选择**：明文存储，暂不加密
- **理由**：需求明确后再增加加密支持

### 9. EdgeClient SSL 方法
- **选择**：使用通用 `api("ssl", action, id, data)` 方法，不新增专用方法
- **理由**：SSL 的 CRUD 操作与 upstream/route 完全一致，`RESOURCE_PATHS` 加一条即可

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| **证书内容大**：cert/key 可能数 KB，网络传输慢 | 文件上传使用异步；文本粘贴为同步 |
| **DB 中证书与 Edge 节点不一致**（DB 有但 Edge 无，或反之） | 发布时保证 DB→Edge 单向同步；列表显示发布状态（已发布/未发布） |
| **多个 Edge 节点证书不一致** | 发布时逐个节点推送，全部成功才算成功 |
