# 节点管理 — Delta Spec

## ADDED Requirements

### Requirement: 安装操作受特性配置控制（独立控制）

节点更多菜单中的"安装 OpenResty"和"安装 Edge"按钮 SHALL 各自独立受 `install_openresty` 和 `install_edge` 特性控制。

#### Scenario: 安装 OpenResty 启用
- **WHEN** `features.yaml` 中 `install_openresty` 为 `true`
- **THEN** 节点行更多菜单中 SHALL 显示"安装 OpenResty"菜单项
- **AND** 集群节点 Tab 的"安装"下拉按钮中 SHALL 显示"安装 OpenResty"
- **AND** `POST /clusters/{id}/nodes/{nid}/install-openresty` SHALL 可用
- **AND** `POST /clusters/{id}/nodes/{nid}/cancel-install` SHALL 可用

#### Scenario: 安装 OpenResty 禁用
- **WHEN** `features.yaml` 中 `install_openresty` 为 `false`
- **THEN** "安装 OpenResty"菜单项 SHALL NOT 显示
- **AND** `POST /clusters/{id}/nodes/{nid}/install-openresty` SHALL 返回 404
- **AND** `POST /clusters/{id}/nodes/{nid}/cancel-install` SHALL 返回 404
- **AND** "安装 Edge"按钮和行为 SHALL 不受影响

#### Scenario: 安装 Edge 启用
- **WHEN** `features.yaml` 中 `install_edge` 为 `true`
- **THEN** 节点行更多菜单中 SHALL 显示"安装 Edge"菜单项
- **AND** 集群节点 Tab 的"安装"下拉按钮中 SHALL 显示"安装 Edge"
- **AND** `POST /clusters/{id}/nodes/{nid}/install-edge` SHALL 可用

#### Scenario: 安装 Edge 禁用
- **WHEN** `features.yaml` 中 `install_edge` 为 `false`
- **THEN** "安装 Edge"菜单项 SHALL NOT 显示
- **AND** `POST /clusters/{id}/nodes/{nid}/install-edge` SHALL 返回 404
- **AND** "安装 OpenResty"按钮和行为 SHALL 不受影响
