## MODIFIED Requirements

### Requirement: 操作按钮特性过滤

节点管理页面中的安装相关按钮 SHALL 根据特性配置条件性显示。

#### Scenario: 安装功能启用
- **WHEN** `featuresStore.has('install_openresty')` 返回 `true`
- **THEN** `NodeList.vue` 行内动作菜单（`⋯`）中的"安装 OpenResty"和"安装 Edge"项 SHALL 显示
- **AND** 统一管理面板「集群节点」Tab（同一 `NodeList.vue` 的 `scopedClusterId` 形态）SHALL 显示同一组安装项

#### Scenario: 安装功能禁用
- **WHEN** `featuresStore.has('install_openresty')` 返回 `false`
- **THEN** 上述安装项 SHALL NOT 渲染
- **AND** 节点的启动/停止/状态/对比等核心操作按钮 SHALL 不受影响
