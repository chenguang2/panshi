# edge-client-manual-query Specification

## Purpose
TBD - created by archiving change fix-edge-client-blocking. Update Purpose after archive.
## Requirements
### Requirement: Manual query trigger

The edge client page SHALL NOT auto-load node data on mount. It SHALL wait for the user to click a "查询" button.

#### Scenario: Page loads without auto query
- **WHEN** the user navigates to the edge client page
- **THEN** the cluster list SHALL load for the dropdown selector
- **AND** node data SHALL NOT be loaded automatically
- **AND** the "查询" button SHALL be enabled

#### Scenario: Click query loads data
- **WHEN** the user selects a cluster and node
- **AND** the user clicks the "查询" button
- **THEN** 6 parallel requests SHALL be sent to load upstreams, routes, global rules, plugin configs, plugin metadata, and plugin list

### Requirement: Cancel query

The edge client page SHALL provide a "取消查询" button to abort in-flight requests.

#### Scenario: Cancel button enabled during query
- **WHEN** a query is in progress
- **THEN** the "取消查询" button SHALL be enabled

#### Scenario: Cancel aborts requests
- **WHEN** the user clicks "取消查询"
- **THEN** all in-flight requests SHALL be aborted immediately
- **AND** the "取消查询" button SHALL become disabled
- **AND** the "查询" button SHALL become enabled

### Requirement: Backend non-blocking edge requests

The backend SHALL execute synchronous EdgeClient calls in a thread pool to avoid blocking the asyncio event loop.

#### Scenario: Concurrent edge requests don't block the server
- **WHEN** 6 parallel edge client requests are sent
- **AND** one or more edge nodes are unreachable
- **THEN** other API endpoints (e.g., cluster management) SHALL remain responsive
- **AND** each request SHALL timeout individually after 5 seconds

#### Scenario: Client disconnect cancels the task
- **WHEN** the client disconnects during an edge request
- **THEN** FastAPI SHALL cancel the asyncio task
- **AND** the thread pool thread SHALL complete without blocking the event loop


## ADDED Requirements

### Requirement: Edge 直连功能受特性配置控制

Edge 直连页面 SHALL 受 `features.yaml` 中 `edge_client` 特性控制。

#### Scenario: Edge 直连启用
- **WHEN** `features.yaml` 中 `edge_client` 为 `true`
- **THEN** `/edge-client` 路由 SHALL 注册
- **AND** 侧边栏 Edge 直连菜单项 SHALL 显示
- **AND** 后端 `GET /api/v1/edge-client/nodes` SHALL 可用（返回 200）

#### Scenario: Edge 直连禁用
- **WHEN** `features.yaml` 中 `edge_client` 为 `false`
- **THEN** `/edge-client` 路由 SHALL NOT 注册（访问返回 404）
- **AND** 侧边栏 Edge 直连菜单项 SHALL NOT 显示
- **AND** 后端所有 `/api/v1/edge-client/*` 端点 SHALL 返回 404
- **AND** 用户无法通过 URL 直接访问该功能
