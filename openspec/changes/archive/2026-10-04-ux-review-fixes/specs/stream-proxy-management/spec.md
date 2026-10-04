# stream-proxy-management Delta

## MODIFIED Requirements

### Requirement: User can list stream proxies

The system SHALL display stream proxies in a card-grid layout with two separate views: 四层代理 and DNS 代理，通过侧边栏菜单和 `route.query.type` 参数区分。共享逻辑通过 `useStreamProxyList` composable 复用。侧边栏菜单名为"四层代理"（不再叫"TCP代理"，因其覆盖 TCP/UDP/TLS 三种协议）。

#### Scenario: List 四层代理 (normal proxies)

- **WHEN** user clicks "四层代理" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=normal`
- **AND** displays only `proxy_type=normal` proxies as cards
- **AND** page title SHALL be "四层代理"
- **AND** page header description SHALL 说明该视图覆盖 TCP/UDP/TLS 三种四层转发协议

#### Scenario: List DNS proxies

- **WHEN** user clicks "DNS代理[UDP]" in sidebar
- **THEN** the system navigates to `/stream-proxies?type=dns`
- **AND** displays only `proxy_type=dns` proxies as cards
- **AND** page title SHALL be "DNS 代理（UDP）"（与侧边栏菜单术语一致）

#### Scenario: Switch between 四层代理/DNS views

- **WHEN** user clicks the other proxy type in the sidebar
- **THEN** the system SHALL reload data with the new `proxy_type` filter without full page reload

#### Scenario: Filter by cluster

- **WHEN** user selects a cluster from the filter dropdown
- **THEN** the system shows only stream proxies belonging to that cluster

#### Scenario: Search by name

- **WHEN** user types a search keyword
- **THEN** the system filters stream proxies whose name matches the keyword

#### Scenario: Target weight display syntax

- **WHEN** a stream proxy card renders target nodes with weights
- **THEN** the weight SHALL display in full-width parentheses「（100）」
- **AND** SHALL NOT use the colon syntax「:100」（与上游列表权重语法统一）
