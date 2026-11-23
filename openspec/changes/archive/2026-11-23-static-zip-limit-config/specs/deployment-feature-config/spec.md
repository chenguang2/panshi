# Spec Delta

## ADDED Requirements

### Requirement: features.yaml 支持 `limits` 命名空间配置体积上限

系统 SHALL 支持通过 `features.yaml` 顶层 `limits` 命名空间配置部署级体积上限。已知键：`static_zip_max_mb`（静态资源 zip 上传体积上限，整数 MB，缺省 32，合法范围 1–2048）。未知键、非整数值（含 bool）、越界值 SHALL 以 `sys.exit(1)` 终止进程并输出可读中文错误（与 `features` / `concurrency` / `branding` 同款校验哲学，不允许静默回退）。未配置该命名空间或该键时，校验阶段 SHALL 将缺省值回写进配置，`GET /api/v1/system/features` SHALL 原样透出 `limits` 字段。配置读取 SHALL 沿用既有 `features.yaml` mtime 热加载语义：文件变化后再次读取即返回新值，无需重启进程。

#### Scenario: 未配置时使用缺省值

- **WHEN** `features.yaml` 未包含 `limits` 命名空间或未包含 `static_zip_max_mb` 键
- **THEN** 系统 SHALL 使用缺省值 32（MB）
- **AND** `GET /api/v1/system/features` 响应 SHALL 包含 `limits.static_zip_max_mb = 32`

#### Scenario: 配置值生效且热加载

- **WHEN** 运维将 `limits.static_zip_max_mb` 从 32 改为 64，文件 mtime 发生变化
- **THEN** 其后任何读取 SHALL 返回 64，无需重启进程

#### Scenario: 未知键显式报错

- **WHEN** `limits` 命名空间包含未登记的键（如 `static_zip_max_gb`）
- **THEN** 进程 SHALL 以 `sys.exit(1)` 终止
- **AND** 错误信息 SHALL 列出允许的键名

#### Scenario: 非法值显式报错

- **WHEN** `static_zip_max_mb` 的值为 0、负数、超过 2048、字符串 `"64"` 或布尔 `true`
- **THEN** 进程 SHALL 以 `sys.exit(1)` 终止
- **AND** 错误信息 SHALL 说明取值必须是 1–2048 的整数并回显当前值

### Requirement: 前端 features store 解析 `limits` 并提供带缺省值的读取方法

前端 Pinia features store SHALL 解析 `GET /api/v1/system/features` 响应中的 `limits` 字段，并提供读取单个体积上限的方法：未加载配置或缺键时 SHALL 返回调用方传入的缺省值（静态资源上传预检的缺省值为 32MB）。读取 SHALL 发生在调用时（不得在模块加载期固化为常量），使热加载后的新值对下一次操作生效。

#### Scenario: 配置已下发

- **WHEN** store 已加载且响应中 `limits.static_zip_max_mb = 64`
- **THEN** 读取 `static_zip_max_mb` SHALL 返回 64

#### Scenario: 配置未加载或缺键

- **WHEN** store 尚未加载，或响应中缺失 `limits` / 该键
- **THEN** 读取 SHALL 返回调用方缺省值（32）
- **AND** SHALL NOT 抛错或阻塞上传流程
