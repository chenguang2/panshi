## MODIFIED Requirements

### Requirement: Tab 页展示

系统 SHALL 在 Edge 直连页面调整 Tab 顺序，将「SSL 证书」Tab 移至「四层代理」右侧。

#### Scenario: Tab 顺序
- **WHEN** 用户在 Edge 直连页面选择节点后点击「查询」
- **THEN** Tab 栏顺序 SHALL 为：上游 → 路由 → 全局规则 → 插件组 → 插件元数据 → 插件列表 → 四层代理 → SSL 证书
