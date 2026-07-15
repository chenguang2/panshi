## MODIFIED Requirements

### Requirement: SSL 证书列表加载

系统 SHALL 正确加载所有 SSL 证书，不因 cert/private_key 为空值而失败。

#### Scenario: 列表加载成功
- **WHEN** 数据库中存在 SSL 证书记录（含 cert 或 private_key 为空的记录）
- **THEN** 系统 SHALL 正常返回所有证书列表
- **AND** 前端 SHALL 正常展示证书卡片

### Requirement: 创建 SSL 证书

系统 SHALL 在创建 SSL 证书时校验 cert 和 private_key 非空。

#### Scenario: 创建校验
- **WHEN** 用户提交创建 SSL 证书表单
- **THEN** 系统 SHALL 校验 `cert` 和 `private_key` 不为空
- **AND** 空值时 SHALL 返回 422 校验错误

### Requirement: SSL 证书列表页搜索框

SSL 证书列表页搜索框样式 SHALL 与其他页面（如四层代理）一致。

#### Scenario: 搜索框样式
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 搜索框 SHALL 使用固定宽度（200px），不拉伸占据整行
- **AND** 搜索框 SHALL 与其他页面（四层代理等）风格一致
