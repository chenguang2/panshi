## MODIFIED Requirements

### Requirement: User can create a stream proxy

The system SHALL allow authorized users to create a Layer 4 (TCP/UDP) stream proxy configuration using a two-step wizard.

#### Scenario: Create stream proxy with basic setup
- **WHEN** user clicks "新建四层代理" button and completes Step 1 (selects cluster, node, detects port, selects available port) and Step 2 (fills name, upstream targets, load balance)
- **THEN** the system creates a `ps_stream_proxy` record and returns to the list page with the new proxy visible
- **AND** target node address SHALL accept IPv4、IPv6（`::1` or `[::1]`）、domain name
- **AND** target node address SHALL be auto-detected and validated accordingly
- **AND** invalid address SHALL display a specific error message
- **AND** IPv6 address without brackets SHALL be automatically wrapped as `[::1]` when building target string

#### Scenario: Create stream proxy with minimal fields
- **WHEN** user creates a stream proxy with only name, port, and one target (IP:port + weight)
- **THEN** the system creates the proxy with defaults for all other fields (tcp protocol, weighted_roundrobin LB)
- **AND** target node host SHALL support domain name in addition to IP
