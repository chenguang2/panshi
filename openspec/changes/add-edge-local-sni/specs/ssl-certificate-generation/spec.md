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

#### Scenario: 强制加入系统保留域名（服务端证书）
- **WHEN** 用户调用生成 API 生成服务端证书，传入任意 `dns_sans`（或为空）
- **THEN** 系统 SHALL 将系统保留域名 `edge.local` 强制合并进 DNS SAN
- **AND** 生成的证书 subjectAltName SHALL 包含 `DNS:edge.local`
- **AND** `edge.local` 置前且去重（若用户已传入则不重复）
- **AND** 合并前 SHALL 将 DNS 域名归一化为小写（`strip().lower()`），`EDGE.LOCAL`/`Edge.Local` 与 `edge.local` 视为同一项

#### Scenario: 客户端证书不强制注入
- **WHEN** 生成 SM2 客户端双证书（`generate_client_certs=true`）或 `cert_type=client`
- **THEN** 客户端证书的 subjectAltName SHALL 仅包含用户提供的 `dns_sans`/`ip_sans`
- **AND** 系统 SHALL 不强制合并 `edge.local`

#### Scenario: DB sni 字段同步（服务端证书）
- **WHEN** 系统生成服务端证书且强制加入 `edge.local`
- **THEN** 证书记录的 `sni` 字段 SHALL 包含 `edge.local`
- **AND** `sni` 与证书 subjectAltName 保持一致（列表内容一致，`sni` 无 `DNS:`/`IP:` 前缀）

#### Scenario: 更新路径强制保留
- **WHEN** 用户更新 server 类型证书（`cert_type == "server"` 且非 CA）的 `sni` 字段
- **THEN** 系统 SHALL 强制将 `edge.local` 合并进新的 `sni` 值（归一化去重后写回）
- **AND** 更新 client 类型证书的 `sni` 时 SHALL 不合并

#### Scenario: 回滚路径强制保留
- **WHEN** 用户将 server 类型证书回滚到历史版本
- **THEN** 回滚后的 `sni` 字段 SHALL 强制包含 `edge.local`（按回滚后的 `cert_type` 判断）

#### Scenario: 导入路径不强制
- **WHEN** 用户导入（添加已有）server 证书且 `sni` 不含 `edge.local`
- **THEN** 系统 SHALL 接受该操作（不强制注入、不阻断）
- **AND** 前端 SHALL 在导入表单提示建议包含系统保留域名 `edge.local`

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
- **AND** 用户手动输入的 `EDGE.LOCAL`/`Edge.Local` SHALL 与锁定 `edge.local` 去重（视为同一项）

#### Scenario: 仅系统保留域名的证书允许
- **WHEN** 用户未添加任何其他 DNS/IP SAN，仅保留锁定的 `edge.local`
- **THEN** 系统 SHALL 允许提交（`edge.local` 计入"至少一个 SAN"的有效性判断）

#### Scenario: 编辑查看时标注系统保留
- **WHEN** 用户编辑或查看证书
- **AND** 证书 SAN 包含 `edge.local`（大小写不敏感）
- **THEN** 界面 SHALL 将 `edge.local` 标注为"系统保留"

#### Scenario: 列表展示时标注系统保留
- **WHEN** 用户在证书列表页查看证书
- **AND** 证书 `sni` 包含 `edge.local`（大小写不敏感）
- **THEN** 列表 SHALL 将 `edge.local` 标注为"系统保留"