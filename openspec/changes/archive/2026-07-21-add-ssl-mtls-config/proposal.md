## Why

磐石Admin 已支持 SSL 证书的生成、上传、发布到 Edge 节点，但 Edge API 协议中定义的 `client` 字段（mTLS 双向认证配置）未在平台中实现。用户生成的客户端证书只能手动下载，无法通过平台配置 Edge 网关启用客户端证书校验，导致双向认证场景需要运维人员手动修改 Edge 节点的 nginx 配置，效率低且易出错。

## What Changes

- 数据库 `ps_ssl_certificate` 表新增 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 字段
- Pydantic Schema 补充对应字段，支持上传/编辑/生成时配置 mTLS
- SSL 证书上传表单（SslFormDrawer）增加 mTLS 配置区域
- SSL 证书生成对话框（SslGenerateDialog）增加 mTLS 配置选项
- 发布到 Edge 时，根据配置拼装 `client` 对象（含 `ca`、`depth`、`skip_mtls_uri_regex`）
- SSL 证书查看详情页展示 mTLS 配置信息
- Edge 数据导入时识别 `client` 字段并写入数据库
- 配置对比（db vs edge）时比较 `client` 字段

## Capabilities

### New Capabilities
- `ssl-mtls-config`: 支持在 SSL 证书中配置 mTLS 双向认证参数（CA 证书、校验深度、跳过 URI），并在发布到 Edge 节点时下发 `client` 字段

### Modified Capabilities
- `ssl-certificate-management`: 上传/编辑/生成 SSL 证书的表单需增加 mTLS 配置字段；发布逻辑需拼装 `client` 对象；查看界面需展示 mTLS 配置

## Impact

- **后端**: `models/ssl.py` 新增字段，`schemas/ssl.py` 新增字段及校验，`api/v1/cluster_ssl.py` 发布逻辑增加 `client` 拼装，`services/edge_import_service.py` 导入逻辑识别 `client`
- **前端**: `SslFormDrawer.vue` 增加 mTLS 配置区域，`SslGenerateDialog.vue` 增加 mTLS 选项，`SslViewDrawer.vue` 增加 mTLS 信息展示
- **数据库**: 需执行迁移添加新字段
- **配置对比**: `_compare_ssl_certificate` 增加 `client` 子字段对比
