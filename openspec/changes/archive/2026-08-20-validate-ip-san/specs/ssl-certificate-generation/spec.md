## MODIFIED Requirements

### Requirement: 域名和 IP 的 SAN 处理

系统 SHALL 在生成 CSR 时自动区分域名 SAN 和 IP SAN 的格式。

#### Scenario: DNS SAN 格式化
- **WHEN** 用户传入 `dns_sans: ["example.com", "www.example.com"]`
- **THEN** CSR 的 subjectAltName 扩展 SHALL 包含 `DNS:example.com,DNS:www.example.com`

#### Scenario: IP SAN 格式化
- **WHEN** 用户传入 `ip_sans: ["10.0.0.1", "192.168.1.1"]`
- **THEN** CSR 的 subjectAltName 扩展 SHALL 包含 `IP:10.0.0.1,IP:192.168.1.1`

#### Scenario: 域名和 IP 合并
- **WHEN** 用户同时传入 `dns_sans` 和 `ip_sans`
- **THEN** subjectAltName 扩展 SHALL 包含所有域名和 IP，使用正确的 `DNS:` / `IP:` 前缀
- **AND** 格式为 `DNS:example.com,IP:10.0.0.1,DNS:www.example.com`

#### Scenario: IP SAN 必须是合法 IP
- **WHEN** 用户传入 `ip_sans` 包含非 IP 值（如 `abc`、`999`）
- **THEN** 系统 SHALL 拒绝该请求并返回 422
- **AND** 错误信息 SHALL 指明无效的 IP 地址

#### Scenario: IP SAN 接受合法 IPv4 与 IPv6
- **WHEN** 用户传入 `ip_sans: ["10.0.0.1", "2001:db8::1"]`
- **THEN** 系统 SHALL 接受（IPv4 与 IPv6 均合法）
- **AND** 生成的证书 SAN SHALL 包含 `IP:10.0.0.1,IP:2001:db8::1`

## ADDED Requirements

### Requirement: IP SAN 输入校验

系统 SHALL 在生成证书界面校验 IP SAN 输入的格式，仅接受合法 IPv4/IPv6，拒绝非法输入。

#### Scenario: 前端拒绝非法 IP
- **WHEN** 用户在 IP SAN 输入框输入非 IP 值（如 `abc`）
- **THEN** 前端 SHALL 拒绝将该值加入 IP SAN 列表
- **AND** SHALL 提示用户"无效的 IP 地址"

#### Scenario: 前端接受合法 IP
- **WHEN** 用户在 IP SAN 输入框输入合法 IP（如 `10.0.0.1` 或 `2001:db8::1`）
- **THEN** 前端 SHALL 将该值加入 IP SAN 列表

#### Scenario: 后端兜底校验
- **WHEN** 请求绕过前端直接调用生成 API，且 `ip_sans` 包含非法 IP
- **THEN** 后端 SHALL 返回 422
