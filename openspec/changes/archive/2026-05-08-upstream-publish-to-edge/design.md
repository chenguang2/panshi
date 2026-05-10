# Design: upstream-publish-to-edge

## Context

上游发布需要将配置同步到集群中所有状态为启动的 edge 服务器节点。当前 `publish_upstream` 函数只保存 ConfigVersion 记录，未实际调用 edge API。

需要：
1. 查询集群中所有 status=1 的节点
2. 对每个节点调用 edge API 同步上游配置
3. 记录详细的请求/响应日志
4. 汇总结果返回给调用方

## Goals / Non-Goals

**Goals:**
- 遍历集群中所有活跃节点，同步上游配置
- 记录每次调用的详细日志（请求、响应、状态）
- 提供明确的成功/失败反馈
- 日志写入 `logs/edge/upstream.log`

**Non-Goals:**
- 不处理 edge 服务器的自动重连
- 不做部分成功时的回滚（幂等操作，可重试）
- 不支持同步到离线节点

## Decisions

### 1. 修改 `publish_upstream` 端点

在保存 ConfigVersion 后，调用 EdgeClient 遍历所有活跃节点。

```python
# 获取集群所有活跃节点
nodes = db.query(Node).filter(Node.cluster_id == cluster_id, Node.status == 1).all()
for node in nodes:
    # 为每个节点创建 EdgeClient 并同步
    client = EdgeClient(cluster_id, db, node_ip=node.ip, node_port=node.management_port)
    result = client.create_upstream(upstream_data)
```

### 2. 新增 `edge_logger.py` 服务模块

提供日志写入功能，确保日志目录存在。

```python
import logging
import os

class EdgeLogger:
    LOG_DIR = "logs/edge"
    LOG_FILE = "logs/edge/upstream.log"

    def __init__(self):
        os.makedirs(self.LOG_DIR, exist_ok=True)

    def log(self, cluster_id, cluster_name, upstream_id, upstream_name,
            method, path, request_body, encrypted_body,
            response_status, response_body, status, error=None):
        # 写入日志文件
```

### 3. EdgeClient 扩展支持

修改 EdgeClient 构造函数，支持直接传入节点地址（避免重复查询）。

```python
class EdgeClient:
    def __init__(self, cluster_id: int, db: Session, node_ip: str = None, node_port: int = None):
        if node_ip and node_port:
            self.edge_url = f"http://{node_ip}:{node_port}"
            self._resolve_api_key()
        else:
            # 原有逻辑：自动从节点解析
```

### 4. 返回结果格式

```python
{
    "status": "ok" | "partial" | "error",
    "message": "上游 xxx 发布成功，2/3 节点同步成功",
    "version": 1,
    "results": [
        {"node": "192.168.100.235:11999", "status": "success", "response": {...}},
        {"node": "192.168.100.236:11999", "status": "failed", "error": "connection timeout"},
    ]
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 部分节点同步失败 | 返回 partial 状态，列出失败的节点 |
| 日志文件过大 | 依赖日志轮转，或定期清理 |
| edge 服务器响应慢 | httpx 已设置 30s timeout |

## Open Questions

- 是否需要支持同步失败时的重试机制？
- 日志文件是否需要轮转？