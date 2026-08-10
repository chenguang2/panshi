# Stream Proxy Management

## MODIFIED Requirements

### Requirement: User can delete a stream proxy

The system SHALL support deleting a stream proxy from the database and/or Edge nodes, both individually and in batch.

#### Scenario: 批量删除四层代理
- **WHEN** 用户通过批量管理模式选择多个四层代理并确认删除
- **THEN** 系统 SHALL 通过批量端点 `DELETE /stream-proxies` 一次性删除所选代理（按集群分组逐条独立处理）
- **THEN** 每个代理的删除行为 SHALL 与单删一致（数据库/Edge 选项、版本历史清理）
- **AND** 单条失败 SHALL NOT 阻塞其余代理的删除
