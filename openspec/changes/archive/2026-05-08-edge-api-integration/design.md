# Design: edge-api-integration

## Context

磐石Admin 的上游（Upstream）发布流程需要将配置数据同步到 edge 服务器。当前后端缺少与 edge 服务端的安全通信能力：

- Edge 服务器要求请求体经过 SM4 加密（ECB + PKCS7 + Base64）
- Edge 服务器地址和认证信息存储在集群配置中（`ps_cluster`、`ps_node` 表）

## Goals / Non-Goals

**Goals:**
- 封装 SM4 加解密逻辑，供所有 edge 通信使用
- 提供统一的上游同步接口，支持 CRUD 操作
- 从数据库节点配置动态获取 edge 服务器地址

**Non-Goals:**
- 不实现 routes、global_rules 等其他资源的同步（后续迭代）
- 不处理 edge 服务器的健康检查或连接管理
- 不支持同步到多个 edge 节点（单节点发布）

## Decisions

### 1. Module Location: `services/edge_client.py`

将 edge 客户端封装为独立服务模块，位于 `backend/app/services/edge_client.py`。

**Rationale**：与其他业务服务（如 upstream_service）并列，便于维护和复用。不会与 API 路由层耦合。

### 2. SM4 Encryption Implementation

使用 `cryptography` 库的 `Fernet` 或原始 SM4 实现。流程：
- **加密请求**：JSON → SM4 ECB + PKCS7 → Base64
- **解密响应**：Base64 → SM4 ECB + PKCS7 → JSON

**Alternatives considered**：
- 使用 `gmssl` 库：国产库，但依赖安装复杂
- 使用 `pysmx`：轻量，但文档较少

**Decision**：使用 `cryptography` 库，跨平台兼容性好。

### 3. Node Resolution

通过 `cluster_id` 查询 `ps_node` 表，获取第一个可用节点的 `ip` 和 `management_port`。

```python
# 从 Node 获取 edge 地址
node = db.query(Node).filter(Node.cluster_id == cluster_id, Node.status == 1).first()
edge_url = f"http://{node.ip}:{node.management_port}"
```

### 4. Authentication

从 `ps_cluster.admin_key` 读取 API Key，通过 `X-API-KEY` header 传递。

### 5. Error Handling

- 连接失败：抛出 `EdgeConnectionError`
- 加密失败：抛出 `EdgeEncryptionError`
- API 返回非 2xx：抛出 `EdgeAPIError`，包含响应体（解密后）

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| SM4 密钥硬编码在 `.env` | 已在 CI/CD 中限制文件权限 |
| Edge 服务器未启动 | 发布前检查节点状态，或由调用方处理 |
| 加密后数据量增加 | Base64 约增加 33%，可接受 |

## API Design

### EdgeClient Class

```python
class EdgeClient:
    def __init__(self, cluster_id: int, db: Session)

    def get_upstream(self, upstream_id: str) -> dict
    def list_upstreams(self) -> dict
    def create_upstream(self, data: dict) -> dict
    def update_upstream(self, upstream_id: str, data: dict) -> dict
    def delete_upstream(self, upstream_id: str) -> dict
    def patch_upstream(self, upstream_id: str, data: dict) -> dict
```

### Internal Methods

```python
def _encrypt(self, data: bytes) -> str: ...
def _decrypt(self, data: str) -> bytes: ...
def _request(self, method: str, path: str, body: dict | None) -> dict: ...
```

## File Structure

```
backend/app/
├── services/
│   ├── __init__.py
│   └── edge_client.py    # 新增
```

## Dependencies

```toml
# pyproject.toml
cryptography>=41.0.0
```