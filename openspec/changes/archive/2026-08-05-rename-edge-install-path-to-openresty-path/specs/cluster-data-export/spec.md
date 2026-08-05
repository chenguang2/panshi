## MODIFIED Requirements

### Requirement: Export cluster data to Excel

The system SHALL provide an API endpoint that exports all configuration data of a single cluster into an Excel (.xlsx) file. The Excel file SHALL contain one sheet per data type. The system SHALL NOT export sensitive SSL certificate content (private keys and certificate PEMs).

#### Scenario: Successful export of cluster with all resource types

- **WHEN** a user sends a GET request to `/api/v1/clusters/{cluster_id}/export`
- **AND** the cluster with the given ID exists
- **THEN** the system returns a `200 OK` response with content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **AND** the response includes a `Content-Disposition` header with `attachment; filename*=UTF-8''{url_encoded_filename}`
- **AND** the Excel file contains the following sheets:
  - `集群信息` — one row with cluster metadata (name, display_name, admin_url, description, group_name, status, created_at, updated_at). The `admin_key` field SHALL NOT be exported.
  - `集群节点` — rows for each node (ID, ip, service_port, management_port, edge_path, openresty_path, status, created_at)
  - `上游服务` — rows for each upstream (ID, name, load_balance, scheme, pass_host, upstream_host, timeout, retries, retry_timeout, checks, keepalive_pool, targets, description, created_at). The `targets` column SHALL contain all UpstreamTarget entries formatted as `ip:port(权重N)` separated by semicolons. If no targets exist, the column SHALL display `（无）`.
