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

#### Scenario: 强制加入系统保留域名
- **WHEN** 用户调用生成 API，传入任意 `dns_sans`（或为空）
- **THEN** 系统 SHALL 将系统保留域名 `edge.local` 强制合并进 DNS SAN
- **AND** 生成的证书 subjectAltName SHALL 包含 `DNS:edge.local`
- **AND** `edge.local` 去重（若用户已传入则不重复）

#### Scenario: DB sni 字段同步
- **WHEN** 系统生成证书且强制加入 `edge.local`
- **THEN** 证书记录的 `sni` 字段 SHALL 包含 `edge.local`
- **AND** `sni` 与证书 subjectAltName 保持一致

#### Scenario: 客户端证书同样强制加入
- **WHEN** 生成 SM2 客户端双证书（`generate_client_certs=true`）
- **THEN** 客户端证书的 subjectAltName SHALL 同样包含 `DNS:edge.local`

## ADDED Requirements

### Requirement: 系统保留域名不可由用户移除

系统 SHALL 将 `edge.local` 视为系统保留域名，在生成证书的界面中始终可见且不可被用户删除。

#### Scenario: 生成对话框默认展示且锁定
- **WHEN** 用户打开证书生成对话框
- **THEN** DNS SAN 输入区 SHALL 默认展示 `edge.local` 标签
- **AND** `edge.local` 标签 SHALL 以锁定样式显示（无删除按钮，标记"系统保留"）
- **AND** 用户 SHALL 无法删除该标签

#### Scenario: 提交始终包含系统保留域名
- **WHEN** 用户在生成对话框提交（含或不含其他 DNS SAN）
- **THEN** 提交的 `dns_sans` SHALL 始终包含 `edge.local`
- **AND** 后端 SHALL 兜底合并 `edge.local`（即使前端未传入也生效）

#### Scenario: 编辑查看时标注系统保留
- **WHEN** 用户编辑或查看证书
- **AND** 证书 SAN 包含 `edge.local`
- **THEN** 界面 SHALL 将 `edge.local` 标注为"系统保留"
