# edge-data-import

## MODIFIED Requirements

### Requirement: 数据预览

#### Scenario: 导入 SSL 证书
- **WHEN** 数据预览时从 Edge 节点拉取数据
- **THEN** 系统 SHALL 额外拉取 SSL 证书列表（`GET /edge/admin/ssl`）
- **AND** 按 `edge_uuid` 字段映射转换为 DB 格式
- **AND** 按 `edge_uuid` 检测与本地 DB 的冲突

### Requirement: 导入执行

#### Scenario: 执行导入 SSL 证书
- **WHEN** 用户选择导入 SSL 证书并确认
- **THEN** 系统 SHALL 将 SSL 证书写入 `ps_ssl_certificate` 表
- **AND** 跳过已存在的 `edge_uuid`（冲突检测）
- **AND** 创建 `ConfigVersion(resource_type="ssl", version=1)` 记录
- **AND** 记录导入计数和跳过计数
