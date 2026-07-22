## Purpose

将单个集群的所有配置数据导出为 Excel 文件，按数据类型分 Sheet，每条记录带 ID 列，外键关联以名称+ID 双列展示且支持 Excel 内部超链接跳转，供线下讨论和审核使用。

## Requirements

### Requirement: Export cluster data to Excel

The system SHALL provide an API endpoint that exports all configuration data of a single cluster into an Excel (.xlsx) file. The Excel file SHALL contain one sheet per data type. The system SHALL NOT export sensitive SSL certificate content (private keys and certificate PEMs).

#### Scenario: Successful export of cluster with all resource types

- **WHEN** a user sends a GET request to `/api/v1/clusters/{cluster_id}/export`
- **AND** the cluster with the given ID exists
- **THEN** the system returns a `200 OK` response with content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **AND** the response includes a `Content-Disposition` header with `attachment; filename*=UTF-8''{url_encoded_filename}`
- **AND** the Excel file contains the following sheets:
  - `集群信息` — one row with cluster metadata (name, display_name, admin_url, description, group_name, status, created_at, updated_at). The `admin_key` field SHALL NOT be exported.
  - `集群节点` — rows for each node (ID, ip, service_port, management_port, edge_path, edge_install_path, status, created_at)
  - `上游服务` — rows for each upstream (ID, name, load_balance, scheme, pass_host, upstream_host, timeout, retries, retry_timeout, checks, keepalive_pool, targets, description, created_at). The `targets` column SHALL contain all UpstreamTarget entries formatted as `ip:port(权重N)` separated by semicolons. If no targets exist, the column SHALL display `（无）`.
  - `路由规则` — rows for each route (ID, name, uri, methods, hosts, priority, status, upstream_name, upstream_id, plugin_configs, plugins, description, created_at). The `plugins` column SHALL contain all RoutePlugin entries formatted as `plugin_name: {config}` separated by semicolons. If no plugins exist, the column SHALL display `（无）`.
  - `插件组` — rows for each plugin config group (ID, name, plugins description, created_at)
  - `全局规则` — rows for each global rule (ID, name, plugins description, created_at)
  - `插件元数据` — rows for each plugin metadata (ID, plugin_name, config_data, created_at)
  - `四层代理` — rows for each stream proxy (ID, name, listen_port, scheme, load_balance, targets summary, proxy_type, status, description, created_at)
  - `静态资源` — rows for each static resource (ID, name, url_path, file_size, route_name, route_id, description, created_at)
  - `SSL 证书` — rows for each SSL certificate, containing metadata only: ID, name, sni, cert_type, algorithm, organization, is_ca, create_method, status, created_at

#### Scenario: Export includes ID column for every record

- **WHEN** the system generates the Excel file
- **THEN** every data sheet (except 集群信息) SHALL have `ID` as its first column containing the database primary key of each record

#### Scenario: Foreign key references show both name and ID

- **WHEN** the system generates the Excel file
- **THEN** the `路由规则` sheet SHALL have separate columns for `关联上游(名称)` and `关联上游(ID)`
- **AND** the `路由规则` sheet SHALL resolve `plugin_config_ids` (edge UUIDs) to plugin config name and ID
- **AND** the `静态资源` sheet SHALL have separate columns for `关联路由(名称)` and `关联路由(ID)`

#### Scenario: Foreign key ID cells have internal hyperlinks

- **WHEN** the system generates the Excel file
- **THEN** the `关联上游(ID)` column cells in the `路由规则` sheet SHALL be hyperlinks that jump to the corresponding row in the `上游服务` sheet
- **AND** the `关联路由(ID)` column cells in the `静态资源` sheet SHALL be hyperlinks that jump to the corresponding row in the `路由规则` sheet
- **AND** hyperlink cells SHALL be styled with blue underlined font to indicate they are clickable

#### Scenario: JSON fields are human-readable

- **WHEN** a data row contains a JSON-serialized field (e.g., `Upstream.timeout`, `Route.vars`, `PluginConfig.plugins`)
- **THEN** the cell SHALL display the JSON object as a pretty-printed string (not a raw serialized blob)

#### Scenario: SSL certificates exclude sensitive content

- **WHEN** the system generates the `SSL 证书` sheet
- **THEN** the following columns SHALL be excluded: cert, private_key (key), sign_cert, sign_key, client_ca, generate_log

#### Scenario: Cluster not found returns 404

- **WHEN** a user sends a GET request to `/api/v1/clusters/{nonexistent_id}/export`
- **THEN** the system returns a `404 Not Found` response

#### Scenario: Export button available on cluster detail view

- **WHEN** a user expands a cluster in the unified management page (`/central-management`)
- **THEN** the cluster action bar SHALL contain a button labeled "导出 Excel"
- **AND** clicking the button SHALL trigger the download of the Excel file via the export API

#### Scenario: Exported filename uses cluster identifier

- **WHEN** the system returns the Excel file
- **THEN** the filename SHALL be `{cluster_name}_配置导出.xlsx` where `{cluster_name}` is the cluster's `name` field
- **AND** special characters in the cluster name SHALL be sanitized for filesystem safety
- **AND** non-ASCII characters in the filename SHALL be URL-encoded in the Content-Disposition header

#### Scenario: Empty data types still produce a sheet with header

- **WHEN** a cluster has no records of a certain type (e.g., no stream proxies)
- **THEN** the corresponding sheet SHALL still be present in the Excel file
- **AND** the sheet SHALL contain only the header row with column names

#### Scenario: All-or-nothing export on failure

- **WHEN** the export fails during data query (e.g., database error)
- **THEN** the system SHALL return a `500 Internal Server Error`
- **AND** the system SHALL NOT return any partial Excel file

#### Scenario: Export sheet has styled header row

- **WHEN** the Excel file is generated
- **THEN** the first row of each sheet SHALL have bold font for column headers
- **AND** the column widths SHALL be auto-adjusted to fit content
- **AND** hyperlink cells SHALL use blue underlined font

#### Scenario: No admin permission required for export

- **WHEN** a non-admin user with access to the cluster triggers the export
- **THEN** the system SHALL return the Excel file successfully
- **AND** the system SHALL NOT require admin role for this endpoint
