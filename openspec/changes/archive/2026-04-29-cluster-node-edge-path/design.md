## Context

在集群管理中，节点（Node）是连接网关的实际服务器实例。当前节点包含IP、服务端口、管理端口，但缺少Edge路径标识。

Edge路径（edge_path）是区分不同Edge节点的唯一路径标识，用于在网关配置中路由到具体的Edge节点。

**相关文件**：
- `backend/app/models/cluster.py` - Node SQLAlchemy模型
- `backend/app/schemas/cluster.py` - Node Pydantic schemas
- `backend/app/api/v1/clusters.py` - 节点创建/更新API
- `frontend/src/views/ClusterList.vue` - 节点表单和列配置
- `backend/alembic/versions/` - 数据库迁移脚本目录

## Goals / Non-Goals

**Goals:**
- 节点添加必填的 edge_path 字段
- edge_path 格式校验：必须以 `/` 开头，最大长度255
- 数据库迁移添加新列
- 前端表单添加 edge_path 表单项
- 前端列配置添加 edge_path 列，默认不选中

**Non-Goals:**
- 不修改已发布版本的节点配置
- 不影响现有的其他集群功能

## Decisions

### Decision 1: edge_path 字段设计

**选择**：在 Node 模型中添加 `edge_path = Column(String(255), nullable=False)` 字段

**理由**：
- String(255) 满足大多数路径场景
- 非空约束确保每个节点都有路径标识
- 与现有 `ip`、`service_port` 等字段风格一致

### Decision 2: 格式校验

**选择**：使用 Pydantic `field_validator` 校验 edge_path 必须以 `/` 开头

**理由**：
- 统一Edge路径格式规范
- 在API层拦截无效输入
- 可复用 `matches` 正则校验

### Decision 3: 数据库迁移

**选择**：使用 Alembic 生成迁移脚本

**理由**：
- 项目已使用 Alembic 管理数据库版本
- 迁移脚本可追溯、可回滚
- 支持 SQLite（开发）和 PostgreSQL（生产）

### Decision 4: 前端列配置默认不选中

**选择**：将 `edge_path` 添加到 `allNodeColumns` 但不包含在 `nodeColumnsSelected` 默认列表中

**理由**：
- 保持向后兼容，不改变现有用户视图
- 用户可通过列配置自行开启
- 与现有列配置机制一致

## Risks / Trade-offs

[Risk] 现有数据库添加非空列可能导致已有数据问题
→ [Mitigation] 迁移脚本使用 ALTER TABLE 添加列，已有空值的节点需先填充 edge_path 再升级
→ [Alternative] 可考虑软删除旧节点或提供默认路径填充

[Risk] edge_path 格式校验可能导致现有API调用失败
→ [Mitigation] 仅影响新建/更新节点的API，查询接口不受影响

## Migration Plan

1. **数据库迁移**：
   ```bash
   cd backend
   alembic revision --autogenerate -m "add edge_path to ps_node"
   alembic upgrade head
   ```

2. **回滚**：
   ```bash
   alembic downgrade -1
   ```

3. **验证**：
   - 启动后端，确认节点表有新字段
   - 测试创建节点（带edge_path）
   - 测试更新节点（带edge_path）
   - 测试 edge_path 格式校验（不以/开头应报错）
