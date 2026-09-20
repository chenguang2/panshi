## Purpose

特性开关配置文件 `features.yaml` 的热加载：按文件 mtime 变化自动重载，无需重启进程。

## Requirements

### Requirement: features.yaml 热加载

系统 SHALL 通过 `backend/app/core/features.py` 的 `get_features()` 实现 `features.yaml` 热加载：每次调用 SHALL 检查文件 mtime，mtime 变化时 SHALL 清除缓存并重新读取、校验、缓存；mtime 未变化时 SHALL 返回缓存值。配置文件被删除时 SHALL 返回默认空配置；YAML 解析或校验失败时 SHALL 以 `sys.exit(1)` 终止（保持既有行为）。

#### Scenario: 文件修改后自动生效

- **WHEN** 修改 `features.yaml` 使 mtime 发生变化后再次调用 `get_features()`
- **THEN** 系统 SHALL 清除缓存并重新读取文件，返回新配置

#### Scenario: 文件未变化时使用缓存

- **WHEN** `features.yaml` 的 mtime 未变化时重复调用 `get_features()`
- **THEN** 系统 SHALL 返回缓存值，不重复读取文件

#### Scenario: 配置文件被删除

- **WHEN** `features.yaml` 不存在
- **THEN** 系统 SHALL 返回默认空配置

#### Scenario: 配置非法时终止

- **WHEN** `features.yaml` 解析或校验失败
- **THEN** 系统 SHALL 调用 `sys.exit(1)` 终止进程
