# edge-client-manual-query

## MODIFIED Requirements

### Requirement: Edge 直连 SSL 证书 Tab

Edge 直连页面 SHALL 在 Tab 栏中增加 SSL 证书 Tab，结构与其他资源 Tab（如插件元数据）一致。

#### Scenario: SSL Tab 展示
- **WHEN** 用户切换到 Edge 直连页面的 SSL 证书 Tab
- **THEN** Tab 内 SHALL 显示证书列表表格
- **AND** 表格列 SHALL 包含：名称、SNI 域名、类型、状态
- **AND** 支持搜索筛选

#### Scenario: SSL 操作按钮
- **WHEN** 用户在 SSL Tab 中
- **THEN** 每行 SHALL 显示操作按钮（查看详情、删除）
- **AND** 上方 SHALL 有刷新按钮
