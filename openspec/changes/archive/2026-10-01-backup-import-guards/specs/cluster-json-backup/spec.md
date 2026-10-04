# cluster-json-backup Delta

## MODIFIED Requirements

### Requirement: 导入前置硬校验

系统 SHALL 在导入前完成格式与结构校验，任何硬校验失败都不产生部分导入。条目级未知字段 SHALL 按 ORM 模型白名单过滤丢弃（前向兼容：新版本平台产出的备份含本版本不认识的字段时，按未知字段过滤而非结构错误回滚），字段白名单以模型属性为准（含 `SslCertificate.private_key`→`key` 列名错位兼容）。

#### Scenario: 格式版本不符
- **WHEN** 上传文件的 `format` 标识不匹配或 `version` 高于系统支持版本
- **THEN** 返回 400 并说明版本问题

#### Scenario: 校验和不匹配
- **WHEN** 文件内容校验和与记录值不一致（文件损坏或被篡改）
- **THEN** 返回 400 并拒绝导入

#### Scenario: 结构缺失
- **WHEN** 备份缺少必备数据键或行内必备字段非法
- **THEN** 返回 400 并列出全部结构问题

#### Scenario: 条目级未知字段前向兼容过滤
- **WHEN** 导入文件的实体条目含本版本模型不认识的字段
- **THEN** 未知字段 SHALL 按模型白名单过滤丢弃，导入正常完成，MUST NOT 触发 TypeError 级整体回滚
- **AND** 条目级过滤不豁免结构级校验：缺节点、重复 route_id 等结构问题仍整单拒绝（BAK-08）
