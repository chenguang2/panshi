## Context

磐石Admin 已完整支持 SSL 证书管理（上传、生成、发布、版本历史、配置对比）。Edge 网关的 SSL 管理 API（`PUT /edge/admin/ssl/{id}`）协议中定义了 `client` 字段用于配置 mTLS 双向认证，目前平台在发布 SSL 证书时**没有发送此字段**，导致 mTLS 场景需要运维人员手动登录 Edge 节点修改 nginx 配置。

当前相关代码：
- **模型**: `models/ssl.py` — `SslCertificate` 表无 `client_*` 字段
- **Schema**: `schemas/ssl.py` — `SslCertificateBase`/`SslCertificateGenerateRequest` 无 `client_*` 字段
- **发布**: `api/v1/cluster_ssl.py:273-291` — `publish_ssl_certificate()` 拼装 `config_data` 时不包含 `client`
- **导入**: `services/edge_import_service.py:608-652` — `convert_ssl_certificate()` 不识别 `client`
- **配置对比**: `api/v1/cluster_nodes.py:788+` — `_compare_ssl_certificate()` 不对比 `client` 子字段
- **前端**: `SslFormDrawer.vue`、`SslGenerateDialog.vue`、`SslViewDrawer.vue`、`types/ssl.ts` 均无 mTLS 相关字段

Edge API 协议定义（使用手册.md 第 1785 行）：
```json
{
  "client": {
    "ca": "CA 证书内容（PEM，必填）",
    "depth": 1,
    "skip_mtls_uri_regex": ["/health", "/metrics"]
  }
}
```

## Goals / Non-Goals

**Goals:**
- 数据库 `ps_ssl_certificate` 表新增 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 字段
- 后端 Schema 新增对应字段，支持创建/编辑时传入 mTLS 配置
- 前端上传表单（SslFormDrawer）增加 mTLS 配置区域（CA 粘贴、depth 输入、skip URI 标签输入）
- 前端生成对话框（SslGenerateDialog）增加 mTLS 配置选项
- 发布逻辑拼装 `client` 对象
- 查看界面（SslViewDrawer）展示 mTLS 配置
- Edge 导入时识别 `client` 字段
- 配置对比时比较 `client` 子字段
- 前端 TypeScript 类型补充对应字段

**Non-Goals:**
- 不修改生成本地/远程证书流程的 openssl 命令（mTLS 是网关配置行为，与证书生成无关）
- 不涉及 Edge 节点侧的 nginx 配置变更（由 Edge API 协议处理）
- 不涉及 CA 根证书的 mTLS 配置（CA 不发布到 Edge 节点，不适用）

**Constraints:**
- mTLS 仅对国密（SM2）服务端证书支持
- `cert_type = "client"` 的证书不支持 mTLS，前端隐藏相关区域
- 非国密证书（RSA/ECC）不支持 mTLS，前端隐藏相关区域；即使数据库中有值，发布时也不发送 `client` 字段
- 数据库层面的字段对所有证书类型开放（便于 Edge 导入），但平台 UI 和发布逻辑做限制

## Decisions

### Decision 1: 数据库字段命名 `client_ca` / `client_depth` / `skip_mtls_uri_regex`

- **选择**: 使用 `client_` 前缀平铺字段，而非存储 JSON 对象
- **理由**: 与 Edge API 的 `client` 对象对应，但平铺字段便于 SQL 查询、校验、迁移，避免 JSON 字段的复杂性和类型不确定问题
- 可选项: 存 JSON → 查询/校验困难，Schema 校验需嵌套 validator

### Decision 2: `client_ca` 存储 PEM 文本而非文件路径

- **选择**: 直接存储 CA 证书 PEM 内容
- **理由**: 与 `cert`、`sign_cert` 等字段一致；Edge 网关期望的是证书内容而非路径
- 可选项: 存储路径 → 不适用于分布式环境，Edge 节点无法访问平台文件系统

### Decision 3: `skip_mtls_uri_regex` 存储为 JSON 字符串

- **选择**: Text 字段，存 JSON 数组（如 `["/health", "/metrics"]`）
- **理由**: 与 `ssl_protocols` 字段模式一致；查询时只需整体读取/写入，无需单元素过滤
- 可选项: 关联表 → 过度设计，该字段仅在发布时整体发送

### Decision 4: 前端 mTLS 配置作为可折叠区域

- **选择**: 在上传表单和生成对话框中使用可折叠面板（Collapse）收起 mTLS 配置
- **理由**: mTLS 是高级配置，大多数用户不需要；默认折叠保持界面简洁，与现有的"高级配置"模式一致

### Decision 5: mTLS 配置与"生成客户端证书"解耦

- **选择**: mTLS 配置区域独立显示，不与"同时生成客户端证书"复选框耦合。勾选客户端证书时额外自动填充 `client_ca`
- **理由**: mTLS（网关配置行为）与生成客户端证书文件是两个独立需求。用户可能只需要配置 mTLS 而不需要平台生成客户端证书
- **约束**: 
  - SM2 + server 类型 → 总是显示可折叠 mTLS 区域
  - 勾选"生成客户端证书"且 `client_ca` 为空 → 自动填充当前 CA 的 PEM
  - 已手动填写过的不覆盖

## Risks / Trade-offs

- **CA 证书存储冗余**: `client_ca` 可能和 CA 记录中的 `cert` 字段重复 → 可接受，这是独立配置字段，用户可能使用外部 CA 而非平台生成的 CA
- **skip_mtls_uri_regex 格式验证**: 用户输入的正则可能无效 → 前端不做深度验证，后端存储前做 JSON 格式校验；Edge 网关会处理无效正则
- **配置对比复杂度**: `client` 是嵌套对象 → 平铺为三个独立字段分别对比，`client_ca` 对比 PEM 内容（与 `cert` 对比方式一致）
