# 监控指标系统设计方案

> 生成日期：2026-06-15
> 状态：方案设计

---

## 存储方案选择

| 维度 | SQLite | ClickHouse |
|---|---|---|
| 部署 | 零依赖，文件级别 | 需要单独安装运行服务 |
| 写入性能 | 单连接 ~50k rows/s | ~1M rows/s |
| 压缩率 | 无压缩 | 5-10x 列式压缩 |
| 时序查询 | 手动 GROUP BY bucket | 内置 toStartOfInterval、quantile |
| 数据TTL | 手动 DELETE + VACUUM | 内置 TTL 自动过期 |
| 适用规模 | < 50 节点 | 50-5000+ 节点 |
| 分位数计算 | 应用层算 | quantile(0.99) 原生支持 |
| 磁盘占用(月) | ~5GB | ~1GB |

**选择建议**：
- 开发 / 小规模（< 10 节点）：**SQLite**，零依赖，开箱即用
- 生产环境（≥ 10 节点）：**ClickHouse**，内置 TTL 和压缩，省心
- Collector 可配置输出目标：`METRICS_STORAGE=sqlite | clickhouse`

---

## 一、架构

```
┌──────────────┐    每30s     ┌──────────────┐    写入     ┌────────────┐
│  Edge Node   │────HTTP────→│  Collector    │───────────→│ metrics.db │
│  192.168.x.x │             │  (systemd)    │            │ (SQLite)   │
└──────────────┘             └──────┬───────┘            └─────┬──────┘
                                    │                          │ 只读
                                    ↓                          ↓
                         ┌──────────────────────────────────────┐
                         │  磐石 Admin 后端 (GET /metrics/*)      │
                         │  磐石 Admin 前端 (ECharts 图表)         │
                         └──────────────────────────────────────┘
```

### 三个组件完全解耦

| 组件 | 职责 | 数据库 | 进程 |
|---|---|---|---|
| **Collector** | 定时拉取 Edge metrics，写入 DB | `metrics.db`（独立） | 独立 systemd timer |
| **磐石后端** | 提供 REST API 查询 metrics | 只读 `metrics.db` | 主进程 |
| **磐石前端** | ECharts 图表展示 | 无 | 浏览器 |

---

## 二、Collector 采集器

### 2.1 设计原则

- **不自己开发采集程序**，用 Python 单脚本 + systemd timer
- **每次运行只做一次采集**，跑完就退出，不留常驻进程
- 复用现有 EdgeClient 与 Edge 节点通信

### 2.2 目录结构

```
backend/collector/
├── collect.py          # 入口: 单次采集, 写 SQLite
├── collector.service   # systemd 服务单元
├── collector.timer     # systemd 定时器 (每30s)
└── README.md
```

### 2.3 采集脚本

`backend/collector/collect.py`：

```python
"""
单次采集入口。由 systemd timer 每30s调用一次。
运行完即退出，不常驻内存。
"""

import json
import logging
import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime
from sqlalchemy.orm import declarative_base

# ── SQLite 独立数据库 ──
METRICS_DB = os.path.join(os.path.dirname(__file__), "..", "data", "metrics.db")

Base = declarative_base()

class MetricSample(Base):
    __tablename__ = "metric_sample"
    id = Column(Integer, primary_key=True, autoincrement=True)
    node_id = Column(Integer, nullable=False, index=True)
    metric_name = Column(String(64), nullable=False)
    metric_value = Column(Float, nullable=False)
    labels = Column(Text, nullable=True)         # JSON
    sampled_at = Column(DateTime, nullable=False, index=True)


def main():
    engine = create_engine(f"sqlite:///{METRICS_DB}")
    Base.metadata.create_all(engine)             # 自动建表

    # 1. 获取活跃节点列表（从主库或配置文件）
    nodes = get_active_nodes()

    # 2. 采集各节点 metrics
    samples = []
    for node in nodes:
        try:
            metrics = fetch_node_metrics(node)
            for m in metrics:
                samples.append(MetricSample(
                    node_id=node["id"],
                    metric_name=m["name"],
                    metric_value=m["value"],
                    labels=json.dumps(m.get("labels", {})),
                    sampled_at=datetime.utcnow(),
                ))
        except Exception as e:
            logging.error(f"Collect node {node['ip']} failed: {e}")

    # 3. 批量写入
    if samples:
        Session = sessionmaker(engine)
        with Session() as session:
            session.add_all(samples)
            session.commit()

    # 4. 清理旧数据（每天执行一次）
    cleanup_old_data(engine)


def fetch_node_metrics(node):
    """通过 Edge HTTP API 拉取指标
    需要 Edge 节点提供 /edge/admin/stat 接口
    返回 [{"name": "qps", "value": 1520, ...}]
    """
    # 复用 EdgeClient 或直接 HTTP 请求
    ...


def cleanup_old_data(engine):
    """删除 7 天前的数据"""
    ...


if __name__ == "__main__":
    main()
```

### 2.4 systemd 定时器

`collector.service`：

```ini
[Unit]
Description=Panshi Metrics Collector
After=network.target

[Service]
Type=oneshot
ExecStart=/home/qcg/panshi/backend/.venv/bin/python \
    /home/qcg/panshi/backend/collector/collect.py
WorkingDirectory=/home/qcg/panshi/backend
User=jboss
```

`collector.timer`：

```ini
[Unit]
Description=Runs metrics collector every 30 seconds

[Timer]
OnUnitActiveSec=30s
Persistent=true

[Install]
WantedBy=timers.target
```

安装：

```bash
sudo cp collector.service collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now collector.timer
```

---

## 三、ClickHouse 方案（生产推荐）

### 3.1 部署

```bash
docker run -d \
  --name clickhouse \
  -p 8123:8123 \
  -v /data/clickhouse:/var/lib/clickhouse \
  clickhouse/clickhouse-server
```

### 3.2 建表

```sql
CREATE DATABASE IF NOT EXISTS metrics;

CREATE TABLE metrics.metric_sample (
    node_id      UInt32,
    metric_name  String,
    metric_value Float64,
    labels       String DEFAULT '{}',
    sampled_at   DateTime
) ENGINE = MergeTree()
PARTITION BY toDate(sampled_at)
ORDER BY (node_id, metric_name, sampled_at)
TTL toDate(sampled_at) + INTERVAL 30 DAY DELETE;
```

### 3.3 Collector 写入端

```python
# collect.py — ClickHouse 版本写入
import requests

CH_URL = "http://localhost:8123/"

def save_metrics(samples):
    values = []
    for s in samples:
        values.append(
            f"({s['node_id']}, '{s['name']}', {s['value']}, '{s['labels']}', now())"
        )
    sql = f"""
    INSERT INTO metrics.metric_sample
    (node_id, metric_name, metric_value, labels, sampled_at)
    VALUES {','.join(values)}
    """
    requests.post(CH_URL, data=sql)
```

### 3.4 查询优势

```sql
-- ClickHouse 原生分位数，一行搞定
SELECT
    toStartOfInterval(sampled_at, INTERVAL 5 MINUTE) AS bucket,
    avg(metric_value)          AS avg_val,
    max(metric_value)          AS max_val,
    quantile(0.99)(metric_value) AS p99,
    count(*)                   AS sample_count
FROM metrics.metric_sample
WHERE node_id = ? AND metric_name = 'qps'
  AND sampled_at >= now() - INTERVAL 1 HOUR
GROUP BY bucket
ORDER BY bucket;
```

### 3.5 配置切换

```python
# collect.py — 可配置存储后端
STORAGE = os.getenv("METRICS_STORAGE", "sqlite")  # sqlite | clickhouse

if STORAGE == "clickhouse":
    save_to_clickhouse(samples)
else:
    save_to_sqlite(samples)
```

---

## 四、数据库（SQLite 方案，默认）

### 3.1 文件分离

```
backend/data/
├── panshi.db          # 主数据库（原有）
└── metrics.db         # 指标数据库（新增，Collector 写入）
```

**两个库完全独立**：
- Collector 只需要 `metrics.db`，不依赖 `panshi.db`
- 磐石后端对 `metrics.db` 只读
- `panshi.db` 损坏不影响指标数据

### 3.2 表结构

```sql
CREATE TABLE metric_sample (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    metric_name TEXT NOT NULL,     -- qps, active_connections, latency_avg, latency_p99, error_rate, cpu_usage, memory_usage
    metric_value REAL NOT NULL,
    labels TEXT,                    -- JSON: {"host":"...", "port":"..."}
    sampled_at DATETIME NOT NULL
);

CREATE INDEX idx_metric_lookup ON metric_sample(node_id, metric_name, sampled_at);
```

### 3.3 采集指标清单

| 指标名 | 类型 | 说明 | 采集方式 |
|---|---|---|---|
| `qps` | gauge | 每秒请求数 | Edge HTTP API |
| `active_connections` | gauge | 活跃连接数 | Edge HTTP API |
| `latency_avg` | gauge | 平均延迟(ms) | Edge HTTP API |
| `latency_p99` | gauge | P99 延迟(ms) | Edge HTTP API |
| `error_rate` | gauge | 错误率(%) | Edge HTTP API |
| `cpu_usage` | gauge | CPU 使用率(%) | Ansible edge_statistic |
| `memory_usage` | gauge | 内存使用率(%) | Ansible edge_statistic |

### 3.4 数据清理

每天凌晨执行一次清理，删除 7 天前的数据：

```sql
DELETE FROM metric_sample WHERE sampled_at < datetime('now', '-7 days');
```

清理后执行 `VACUUM` 回收 SQLite 文件空间。

---

## 五、后端查询 API

### 4.1 只读连接（SQLite）

```python
from sqlalchemy import create_engine

METRICS_DB_PATH = "data/metrics.db"
metrics_engine = create_engine(
    f"sqlite:///{METRICS_DB_PATH}",
    connect_args={"check_same_thread": False},
)
```

### 4.2 查询示例（ClickHouse）

```python
from clickhouse_driver import Client

client = Client(host="localhost", database="metrics")

def query_metrics(node_id, metric_name, since, interval_min=5):
    return client.execute(f"""
        SELECT
            toStartOfInterval(sampled_at, INTERVAL {interval_min} MINUTE) AS bucket,
            avg(metric_value), max(metric_value), quantile(0.99)(metric_value)
        FROM metric_sample
        WHERE node_id = %(node_id)s AND metric_name = %(name)s
          AND sampled_at >= now() - INTERVAL %(since)s HOUR
        GROUP BY bucket ORDER BY bucket
    """, {"node_id": node_id, "name": metric_name, "since": since})
```

### 4.3 API 端点

`backend/app/api/v1/metrics.py`：

| 端点 | 说明 |
|---|---|
| `GET /metrics/nodes` | 返回有监控数据的节点列表 |
| `GET /metrics/names` | 返回所有可查询的指标名 |
| `GET /metrics/{node_id}?name=qps&since=1h&agg=avg&interval=5m` | 查询时序数据 |
| `GET /metrics/summary/{node_id}` | 节点实时概览 |

参数说明：

| 参数 | 说明 | 示例 |
|---|---|---|
| `name` | 指标名，可逗号分隔 | `qps` 或 `qps,latency_avg` |
| `since` | 时间范围 | `1h`, `6h`, `24h`, `7d`, 或 `2026-06-15T00:00:00` |
| `agg` | 聚合方式 | `raw`, `avg`, `max`, `min` |
| `interval` | 聚合粒度 | `1m`, `5m`, `1h` |

### 4.4 查询示例（SQLite）

```sql
SELECT
    datetime((strftime('%s', sampled_at) / 300) * 300, 'unixepoch') AS bucket,
    AVG(metric_value) AS avg_val
FROM metric_sample
WHERE node_id = ? AND metric_name = 'qps'
  AND sampled_at >= datetime('now', '-1 hour')
GROUP BY bucket
ORDER BY bucket;
```

### 4.5 特性开关

`backend/app/core/features.py` — `KNOWN_FEATURES` 加：

```python
KNOWN_FEATURES = {
    ...
    "metrics",       # 指标监控
}
```

`features.yaml` 控制是否启用。

---

## 六、前端展示

### 5.1 添加依赖

```bash
cd frontend && npm install echarts vue-echarts
```

### 5.2 页面布局

`frontend/src/views/Metrics.vue`：

```
┌─────────────────────────────────────────────────────┐
│  指标监控                                            │
│                                                     │
│  [节点选择 ▼]  [指标选择 ▼]  [时间范围: 1h ▼]  [自动刷新 ⏸] │
│                                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │  QPS (次/秒)                                    │ │
│  │  ╱╲    ╱╲    ╱╲                               │ │
│  │ ╱  ╲  ╱  ╲  ╱  ╲    ← ECharts 折线图          │ │
│  │╱    ╲╱    ╲╱    ╲                              │ │
│  │  ──────── 时间 ────────→                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌──────────┬──────────┬──────────┬──────────┐      │ │
│  │ 实时QPS   │ 平均延迟   │ P99延迟   │ 错误率    │      │ │
│  │ 1,520     │ 12.3ms   │ 95.1ms   │ 0.02%    │      │ │
│  └──────────┴──────────┴──────────┴──────────┘      │ │
└─────────────────────────────────────────────────────┘
```

### 5.3 路由 & 菜单

`frontend/src/router/index.ts`：

```typescript
{
  path: '/metrics',
  name: 'metrics',
  component: () => import('@/views/Metrics.vue'),
  meta: { title: '指标监控', icon: 'chart' },
}
```

`AppSidebar.vue` 适配 feature 开关：`v-if="featuresStore.has('metrics')"`。

---

## 七、文件清单

| 文件 | 操作 | 用途 |
|---|---|---|
| `backend/collector/collect.py` | 新建 | 采集脚本 |
| `backend/collector/collector.service` | 新建 | systemd 服务单元 |
| `backend/collector/collector.timer` | 新建 | systemd 定时器 |
| `backend/collector/README.md` | 新建 | 部署说明 |
| `backend/app/core/metrics_db.py` | 新建 | 只读连接 metrics.db |
| `backend/app/models/metric.py` | 新建 | MetricSample 模型 |
| `backend/app/api/v1/metrics.py` | 新建 | 查询 API |
| `backend/app/core/features.py` | 修改 | 加 metrics 特性开关 |
| `backend/features.yaml` | 修改 | 启停控制 |
| `frontend/src/views/Metrics.vue` | 新建 | 指标监控页面 |
| `frontend/src/api/metrics.ts` | 新建 | API 客户端 |
| `frontend/src/router/index.ts` | 修改 | 加路由 |
| `frontend/src/components/AppSidebar.vue` | 修改 | 加菜单项 |
| `frontend/package.json` | 修改 | 加 echarts, vue-echarts |

**总计：14 个文件，工期约 4-6 天。**

---

## 八、实施步骤

```
Day 1-2: Collector + 数据库
  □ backend/collector/collect.py — 采集脚本
  □ backend/collector/collector.service + .timer
  □ Collector 部署 && 验证数据写入

Day 3-4: 后端 API
  □ backend/app/core/metrics_db.py — 只读连接
  □ backend/app/api/v1/metrics.py — 查询 API
  □ backend/app/core/features.py — 特性开关

Day 5-6: 前端展示
  □ 添加 echarts + vue-echarts 依赖
  □ frontend/src/views/Metrics.vue — 监控页面
  □ 路由 + 侧边栏 + 特性开关集成
```
