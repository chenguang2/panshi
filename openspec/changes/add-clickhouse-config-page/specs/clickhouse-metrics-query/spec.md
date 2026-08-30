# Delta Spec: clickhouse-metrics-query

## MODIFIED Requirements

### Requirement: ClickHouse connection configuration

The ClickHouse connection parameters SHALL be configurable via a YAML configuration file `backend/clickhouse.yaml`（与 `db_config.json` 平级），结构为命名连接列表 + 激活指针（`connections[] {id, name, host, port, database, user, password_enc, connect_timeout}` + `active`），由 ClickHouse 配置页 API 读写；指标查询使用激活连接的参数。运行时该路径不存在时 SHALL 回退读取历史路径 `backend/app/config/clickhouse.yaml`（含旧单连接明文格式，自动归一化）。

| Parameter | Default | Description |
|---|---|---|
| `host` | `127.0.0.1` | ClickHouse server hostname |
| `port` | `9000` | ClickHouse TCP port |
| `database` | `esapm_metrics` | Database name |
| `user` | `default` | Username |
| `password_enc` | — | Fernet-encrypted password（旧明文 `password` 键兼容读取；语义见 `clickhouse-config-management`） |
| `connect_timeout` | `5` | Connection timeout in seconds |

#### Scenario: Config file present
- **WHEN** `backend/clickhouse.yaml` exists with a valid active connection
- **THEN** the backend SHALL use the active connection's parameters to connect to ClickHouse

#### Scenario: Config file missing or incomplete
- **WHEN** neither `backend/clickhouse.yaml` nor the legacy path exists, or fields are missing
- **THEN** the backend SHALL use the default values
- **AND** metrics API endpoints SHALL return empty data without crashing

#### Scenario: Management changes take effect without restart
- **WHEN** connections are created/updated/deleted or the active pointer is switched through the management API
- **THEN** subsequent metrics queries SHALL use the new configuration without restarting the backend
