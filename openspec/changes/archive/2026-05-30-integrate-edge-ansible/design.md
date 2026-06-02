## Context

磐石Admin 通过 `Node` 模型管理 edge 网关节点，每个节点有 `ip`、`service_port`（默认 80）、`management_port`（默认 9180）、`edge_path`。节点管理页面已有启动/停止按钮，对应的 REST 端点是空壳（`cluster_nodes.py:126-141`），仅返回固定字符串。

现有 `EdgeClient`（`backend/app/services/edge_client.py`）通过 SM4 加密 HTTP 通信管理 PANSHI 的**运行时配置数据**（路由、上游、插件等），但没有能力管理 **PANSHI 进程本身**（nginx start/stop/edge start/stop）。

运维团队已有一套成熟的 Ansible 项目（`edge-ansible`），通过 tag 驱动 shell 脚本在远端执行。

### Ansible 项目结构

```
edge-ansible/
├── edge.yml                     # 单入口 playbook, 5 行
├── ansible.cfg                  # host_key_checking=False, pipelining=True, forks=2000
├── inventory/host               # YAML 格式, 定义 edge_cluster 组 + SSH 凭据
├── group_vars/all.yaml          # 全局变量（脚本路径、默认值）
├── roles/edge/tasks/            # 15 个 task 文件, 每个文件通过 tags 标记
│   ├── main.yml                 # import_tasks: 调度器 — 引入所有子文件
│   ├── nginx_cmd.yml            # ★ 通过 script 模块运行 nginx_cmd.sh
│   ├── statistic.yml            # ★ 通过 script 模块运行 cron_check.sh
│   ├── tail_log.yml             # 通过 shell 模块 tail 日志文件
│   ├── master_copy_to_slaves.yml
│   ├── cmd_run.yml              # 通过 script 模块运行任意自定义脚本
│   └── ... (共 15 个)
└── cmd_scripts/                 # shell 脚本, 被 ansible script 模块分发到远端执行
    ├── nginx_cmd.sh             # ★ start/stop/reload/check 核心逻辑
    ├── cron_check.sh            # ★ CPU/内存/磁盘/edge版本采集
    └── ... (共 31 个)
```

### 关键变量的定义（`group_vars/all.yaml`）

```yaml
nginx_cmd_script_path_name: "cmd_scripts/nginx_cmd.sh"    # → nginx_cmd.yml
cron_check_script_path_name: "cmd_scripts/cron_check.sh"  # → statistic.yml
```

这些路径是相对于 `private_data_dir` 的相对路径。

### 正确的数据流

```
前端点击"启动"
  ↓
POST /clusters/1/nodes/5/start
  ↓
AnsibleRunnerService.run_playbook(
    private_data_dir="backend/ansible/",  # 项目根目录
    playbook="edge.yml",                  # 入口 playbook
    tags="nginx_cmd_run",                 # 只执行标记此 tag 的任务
    extravars={
        "ips": "192.168.100.235",         # 限制目标主机
        "nginx_cmd": "nginx_start",       # 传给 shell 脚本的参数
        "prefix": "/data/qcg/uapm/uap-edge",
        "ports": "16620",
    },
)
  ↓
ansible-runner:
  1. 从 private_data_dir/inventory/host 读取主机清单和 SSH 凭据
  2. 解析 edge.yml → hosts: "{{ ips | default('edge_cluster') }}" = "192.168.100.235"
  3. 加载 role: edge
  4. 因 --tags=nginx_cmd_run, 只执行 nginx_cmd.yml 中的任务
  5. nginx_cmd.yml 执行:
       script: "cmd_scripts/nginx_cmd.sh nginx_start /data/qcg/uapm/uap-edge 16620"
     → Ansible 的 script 模块将 nginx_cmd.sh 复制到远端主机并执行
     → 相当于在远端执行: bash nginx_cmd.sh nginx_start /data/qcg/uapm/uap-edge 16620
  ↓
远端主机:
  nginx_cmd.sh 判断 prefix 是否以 uap-edge 结尾:
  - 是 → edge 2.5: $prefix/bin/edge start
  - 否 → edge 1.0: $prefix/nginx/sbin/nginx
```

## Goals / Non-Goals

**Goals:**
1. 将 `edge-ansible` 纳入本项目版本管理作为 `backend/ansible/`
2. 通过 `ansible-runner` Python SDK 程序化调用 playbook
3. 补全 start/stop/reload/check 端点的真实逻辑
4. 新增节点统计采集端点（CPU/内存/磁盘/版本）
5. **SSH 凭据不存入数据库**，复用现有 `inventory/hosts`
6. 并发控制：最多 5 个 playbook 同时执行
7. 执行结果持久化到 `Node.status_detail` 字段

**Non-Goals:**
- 不引入 Celery/RabbitMQ 消息队列
- 不部署 AWX/Tower
- 不改写 `cmd_scripts/*.sh` 脚本内容
- 不处理 edge build/安装操作（由运维独立执行）
- 不引入 WebSocket 实时日志（初期 REST 轮询）

## Decisions

### 决策 1：项目目录安置 — `backend/ansible/`

**选择**：将 `edge-ansible` 整体复制到 `backend/ansible/`。

```
backend/
├── ansible/
│   ├── edge.yml              ← 原封不动
│   ├── ansible.cfg
│   ├── inventory/hosts       ← ◆ 由运维维护, 含 SSH 凭据
│   ├── group_vars/all.yaml   ← ◆ nginx_cmd_script_path_name 等
│   ├── roles/edge/tasks/
│   ├── cmd_scripts/          ← ◆ 被 ansible script 模块分发执行的 shell 脚本
│   └── soft/
├── app/
│   └── services/
│       └── ansible_service.py  ← 新增
└── ...
```

> `inventory/hosts` 由运维团队在独立仓库维护，本项目定期同步只读使用。

### 决策 2：调用方式 — ansible-runner Python SDK + run_in_threadpool

**选择**：使用 `ansible_runner.run()` 配合 `run_in_threadpool`。

**理由**：
- 与现有 `run_edge_sync` 模式一致
- SSH 凭据通过 inventory 文件读取，无需在代码中处理
- 自动归档 `artifacts/<uuid>/`（job_events、rc、status）

```python
import ansible_runner
from starlette.concurrency import run_in_threadpool

PRIVATE_DATA_DIR = os.path.join(settings.BASE_DIR, "backend/ansible")

async def run_playbook(self, node: Node, tag: str, extravars: dict):
    return await run_in_threadpool(
        ansible_runner.run,
        private_data_dir=PRIVATE_DATA_DIR,
        playbook="edge.yml",
        tags=tag,
        extravars=extravars,
        envvars={"ANSIBLE_HOST_KEY_CHECKING": "False"},
        settings={"job_timeout": 60},
    )
```

> 注意：Python SDK 的 `ansible_runner.run()` 没有 `-i "runner-test"` 的概念。
> CLI 中的 `-i` 是 `--ident`（产物目录标识），Python 中可省略或使用 `ident` 参数。
> inventory 从 `private_data_dir/inventory/hosts` 自动读取。

### 决策 3：复用现有 inventory + extravars.ips 定位节点

**选择**：不做 inventory 改动。playbook 通过 `extravars={"ips": "..."}` 定位节点。

**理由**：
- `edge.yml` 声明 `hosts: "{{ ips | default('edge_cluster') }}"`，天然支持
- 运维维护 `inventory/hosts`，密码已配置或已做免密
- 零 inventory 管理代码

```python
# 只需传 ips, 不需要改 inventory
ansible_runner.run(
    private_data_dir=PRIVATE_DATA_DIR,
    playbook="edge.yml",
    tags="nginx_cmd_run",
    extravars={
        "ips": node.ip,
        "nginx_cmd": "nginx_start",
        "prefix": node.edge_path,
        "ports": str(node.management_port),  # 或从请求参数传入
    },
)
```

### 决策 4：Tag → extravars 参数映射

这是**核心设计**。每个 API 端点映射到特定的 ansible tag 和 extravars。

| API 端点 | ansible tag | 核心 extravars | 说明 |
|----------|-------------|---------------|------|
| `POST /{id}/nodes/{nid}/start` | `nginx_cmd_run` | `nginx_cmd=nginx_start`, `prefix`, `ports` | 启动 edge/nginx |
| `POST /{id}/nodes/{nid}/stop` | `nginx_cmd_run` | `nginx_cmd=nginx_stop`, `prefix`, `ports` | 停止 edge/nginx |
| `POST /{id}/nodes/{nid}/restart` | `nginx_cmd_run` | `nginx_cmd=nginx_reload`, `prefix`, `ports` | reload 配置 |
| `POST /{id}/nodes/{nid}/check` | `nginx_cmd_run` | `nginx_cmd=nginx_check`, `prefix`, `ports` | 检查进程状态 |
| `POST /{id}/nodes/{nid}/statistic` | `edge_statistic` | `prefix`, `ports` | CPU/内存/磁盘/版本 |
| `POST /{id}/nodes/{nid}/ansible-run` | 用户指定 | 用户指定 | 通用执行 |

> **注意**：`nginx_cmd` 的值是 `nginx_start`/`nginx_stop`/`nginx_reload`/`nginx_check`，不是简单的 `start`/`stop`。

对 `prefix`（来自 `Node.edge_path`）的取值：
- 以 `uap-edge` 结尾 → edge 2.5 版本：`$prefix/bin/edge start/stop/reload`
- 其他 → edge 1.0 版本：`$prefix/nginx/sbin/nginx -s stop/reload`

对 `ports`：虽然 `nginx_cmd.sh` 只是 echo 了 `port` 参数而不做实际操作，但 `cron_check.sh`（statistic）会用 `ports` 来调用 `http://127.0.0.1:{port}/edge/server_info`。建议作为可选参数，可从 Node 模型已有字段或请求参数获取。

### 决策 5：并发控制 — asyncio.Semaphore(5)

```python
_ansible_semaphore = asyncio.Semaphore(5)

async def run_playbook(self, ...):
    async with _ansible_semaphore:
        return await run_in_threadpool(ansible_runner.run, ...)
```

### 决策 6：结果持久化 — Node.status_detail JSON 字段

在 `Node` 表新增 `status_detail` Text（JSON，nullable），记录最近一次 ansible 执行结果。

```json
{
  "last_execution": "2026-05-30T10:30:00Z",
  "last_status": "successful",
  "last_rc": 0,
  "last_tag": "nginx_cmd_run",
  "last_error": null,
  "statistic": {
    "cpu_usage": "12.5%",
    "memory_usage": "45.2%",
    "disk_usage": "62.1%",
    "edge_version": "2.5.0"
  }
}
```

**不添加 SSH 凭据字段。**

### 决策 7：批量操作端点

```python
class NodeActionRequest(BaseModel):
    action: Literal["start", "stop", "restart", "check", "statistic"]
    node_ids: list[int]
```

每个节点由 `_execute_single` 方法处理，并发受 Semaphore 控制。

### 决策 8：通用 ansible tag 调用端点

```python
ALLOWED_TAGS = [
    "nginx_cmd_run", "edge_statistic", "edge_tail_log",
    "edge_master_copy_to_slaves", "edge_init_env",
    "script_cmd_run", "nginx_stream", "edge_plugins_md5",
]
```

不允许的 tag（如 `edge_build`、`edge_2.5_build`）服务端拦截。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| ansible-runner 执行卡死 | `job_timeout=60s` + `asyncio.wait_for` 兜底 |
| playbook 中途中断 | ansible-runner 有 cancel 机制，artifacts 保留部分结果 |
| 并发 Semaphore 排队超时 | 长操作返回 202 + job_id，前端轮询 |
| `inventory/hosts` 同步滞后 | 与运维约定同步策略，增加版本/时间戳校验 |
| `ansible-runner` 依赖较重 | 控制平面引入 ansible 运行环境是合理需求 |
| `ports` 参数缺失导致 statistic 失败 | statistic 接口将 `ports` 设为必填；start/stop 中为可选 |
