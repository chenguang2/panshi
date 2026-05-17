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

