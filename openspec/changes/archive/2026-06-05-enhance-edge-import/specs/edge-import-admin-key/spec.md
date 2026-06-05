## NEW Requirements

### Requirement: Admin Key authentication

The Edge data import wizard SHALL allow users to provide an Admin Key for node authentication, with backend fallback to cluster config or default.

#### Scenario: Admin Key input
- **WHEN** the import page step 1 is displayed
- **THEN** an Admin Key password input SHALL appear below the node selector
- **THEN** a "测试连接" button SHALL be next to the input
- **THEN** the input SHALL have placeholder "输入节点 Admin Key..."

#### Scenario: Empty key fallback
- **WHEN** Admin Key is empty
- **THEN** the backend SHALL use the cluster's stored admin_key
- **WHEN** cluster admin_key is also empty
- **THEN** the backend SHALL fall back to `EDGE_ADMIN_KEY` env var
- **WHEN** env var is also empty
- **THEN** the backend SHALL use the built-in default

#### Scenario: Admin Key passed to all APIs
- **WHEN** test connection is called
- **THEN** admin_key SHALL be sent in the request body
- **WHEN** preview is requested
- **THEN** admin_key SHALL be sent in the request body (preview endpoint changed to POST)
- **WHEN** import is executed
- **THEN** admin_key SHALL be sent in the request body

#### Scenario: Backend request schema
- `TestConnectionRequest` SHALL accept optional `admin_key: Optional[str]`
- Preview endpoint SHALL be changed to POST and accept admin_key in body
- `ImportExecuteRequest` SHALL accept optional `admin_key: Optional[str]`
- **WHEN** admin_key is provided
- **THEN** it SHALL override the cluster's stored admin_key for this operation only
