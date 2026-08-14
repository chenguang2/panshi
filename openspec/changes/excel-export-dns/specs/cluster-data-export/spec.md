# Cluster Data Export

## MODIFIED Requirements

### Requirement: Export cluster data to Excel

The system SHALL provide an API endpoint that exports all configuration data of a single cluster into an Excel (.xlsx) file. The Excel file SHALL contain one sheet per data type. The system SHALL NOT export sensitive SSL certificate content (private keys and certificate PEMs).

#### Scenario: DNS 代理导出 dns_config

- **WHEN** 集群中存在 `proxy_type == "dns"` 的四层代理（DNS 代理）
- **THEN** 导出的 `四层代理` sheet 行 SHALL 包含其 `dns_config` 配置（域名 → hosts/负载均衡/TTL/节点 映射，JSON pretty-printed）
- **AND** `四层代理` sheet SHALL 包含 `DNS 配置` 列
- **WHEN** 行为普通四层代理（`proxy_type != "dns"`）
- **THEN** 该行 `DNS 配置` 列 SHALL 为空
