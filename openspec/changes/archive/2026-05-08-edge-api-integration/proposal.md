# Proposal: edge-api-integration

## Why

磐石Admin 的上游发布流程需要将配置数据同步到 edge 服务器，当前缺少与 edge 服务端的加密通信能力，导致发布功能无法完成。

## What Changes

- 新增 `edge_client` 模块，统一处理与 edge 服务器的通信
- 封装 SM4 加密/解密逻辑（ECB + PKCS7 + Base64）
- 封装 upstream HTTP API 调用
- 在发布流程中通过集群节点获取 edge 服务器地址

## Capabilities

### New Capabilities

- **`edge-client`**: edge 服务器通信客户端模块
  - SM4 加密请求体（ECB + PKCS7 + Base64）
  - 解密响应体（Base64 decode + SM4 ECB + PKCS7）
  - 封装 GET/POST/PUT/PATCH/DELETE HTTP 方法
  - 从集群节点配置获取 edge 地址（`Node.ip:Node.management_port`）

- **`upstream-sync`**: 上游配置同步能力
  - 将上游配置发布到 edge 服务器
  - 支持 CRUD 操作

### Modified Capabilities

无

## Impact

- 新增依赖：`cryptography`（SM4 支持）
- 新增模块：`backend/app/services/edge_client.py`
- 新增环境变量：`EDGE_SM4_KEY`（SM4 加密密钥）
- Edge 服务器地址从集群节点（`ps_node` 表）的 `ip` + `management_port` 读取

## Configuration

```env
EDGE_SM4_KEY=a16bc20453da220f
```