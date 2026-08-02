# configurable-batch-concurrency — Design

## Context

批量节点操作（启动/停止/reload/状态查询）的并发数当前是前后端各自硬编码的 `5`：

- **前端** `frontend/src/composables/useClusterNodes.ts:12` — `export const BATCH_ACTION_CONCURRENCY = 5`，被 `batchNodeAction`（L483）和 `batchNodeStatus`（L539）传给 `runWithConcurrency` 作为 worker-pool 的 `limit`。语义：**同时发出的 HTTP 请求数**。
- **后端** `backend/app/services/ansible_service.py:25` — `MAX_CONCURRENT_PLAYBOOKS = 5`，在 `AnsibleRunnerService.__init__`（L322）创建 `asyncio.Semaphore(MAX_CONCURRENT_PLAYBOOKS)`。语义：**全局同时执行的 ansible playbook 数**（跨所有请求、所有走 ansible 的操作）。

两处数值相同（5）但语义不同：前端是请求并发，后端是 playbook 进程并发。批量节点 start/stop 经 SSH/ansible 通道执行，后端信号量是真正的资源瓶颈——前端调大后超出部分会在服务端排队；若排队超过前端 axios 30s timeout，会出现**前端超时假失败**（后端实际仍在排队执行），因此前端并发需受后端上限约束（见 D5 clamp 决策）。

现有部署级配置设施已就绪：

- `backend/features.yaml` 是部署级配置，由 `backend/app/core/features.py` 在启动时严格校验（未知功能名 / 类型错误 → `sys.exit(1)`），结果缓存于模块级 `_features`。
- `GET /api/v1/system/features`（`backend/app/api/v1/system.py`）无认证返回 `get_features()` 完整 dict。
- 前端 `frontend/src/stores/features.ts` 在 `main.ts` 启动时 `load()` 拉取并缓存（失败重试，成功前不猜默认值）。

约束：前后端并发数必须联动；配置化后行为要与现状（默认 5）完全一致；前端无法直接读后端文件系统，需经现有 API 通道下发。

## Goals / Non-Goals

**Goals:**
- 前端批量操作并发数可部署配置，默认 5（行为不变）
- 后端全局 ansible 并发上限可部署配置，默认 5（行为不变）
- 利用现有 `features.yaml` + `GET /system/features` + 前端 features store 通道，不新增 API
- 沿用 features.yaml 的严格校验风格（配置错误启动即报错退出，不静默兜底）

**Non-Goals:**
- 运行时热更新（保持启动时一次性加载语义，改配置需重启）
- 运行时 UI 调整并发数（不做输入框/滑块）
- 为路由/上游等其他批量操作（`useClusterUtils.ts` 的 `executePublish` 等）引入并发配置——它们当前是顺序执行的，不在本次范围
- 环境变量叠加优先级（`env > yaml > 常量`）——本次只做 yaml，不做 env，避免扩大范围

## Decisions

### D1: features.yaml 顶层新增 `concurrency` 命名空间，而非塞进 `features:`

`features:` 校验只接受 `KNOWN_FEATURES` 内的布尔值（`features.py` L102-118），并发数是整数，放进去会触发"值必须是 true 或 false"校验失败。因此顶层新增独立命名空间：

```yaml
concurrency:
  max_playbooks: 5   # 后端全局 ansible 并发上限
  batch_action: 5    # 前端批量请求并发
```

- **替代方案**：放进 `features:` 并扩展校验接受整数 → 语义混乱（features 语义是布尔开关），且需要改 KNOWN_FEATURES 机制。否决。
- **替代方案**：独立配置文件（如 `concurrency.yaml`）→ 破坏"单一部署配置"心智，且 features.py 加载机制需复制一份。否决。
- **替代方案**：环境变量 → 见 Non-Goals，本次只做 yaml。

### D2: `get_concurrency(name, default)` helper，沿用 opt-out 风格

`features.py` 新增：

```python
def get_concurrency(name: str, default: int) -> int:
    return get_features().get("concurrency", {}).get(name, default)
```

缺省时返回 `default`（5），与现状行为完全一致——**零迁移成本**。`get_features()` 首次访问触发 `load_features()` 并缓存，语义与现有 `feature_enabled()` 一致。

### D3: 校验：`concurrency` 必须是映射，key 必须在白名单内，值必须是 1-50 的整数

```python
KNOWN_CONCURRENCY_KEYS: frozenset[str] = frozenset({
    "max_playbooks",
    "batch_action",
})

def _validate_concurrency(config: dict) -> None:
    cc = config.get("concurrency", {})
    if cc is None:
        config["concurrency"] = {}
        return
    if not isinstance(cc, dict):
        # 报错 + sys.exit(1)，格式对齐现有错误消息风格
    unknown = [k for k in cc if k not in KNOWN_CONCURRENCY_KEYS]
    if unknown:
        # 报错（列出未知 key 与允许的 key）+ sys.exit(1)
    for key, val in cc.items():
        if isinstance(val, bool) or not isinstance(val, int) or not (1 <= val <= 50):
            # 报错 + sys.exit(1)
```

- **未知 key 白名单（V4）**：对齐 `features:` 的 `KNOWN_FEATURES` 哲学（features.py L102-109 未知名启动即报错）。拼写错误（如 `max_playbook`）不再静默失效，而是启动显式报错。未来新增并发参数需同步扩展 `KNOWN_CONCURRENCY_KEYS`。
- 范围 1-50：防止 `0`/负数（无意义）和超大值（压垮机器）的手滑配置，同时给足调优空间。
- 布尔值排除：YAML 里 `true` 是 `bool` 而非 `int`（Python 中 `bool` 是 `int` 子类），需显式排除避免 `true` 被当作 `1` 接受。
- 对齐现有错误风格：中文错误消息 + `sys.exit(1)`。

### D4: 后端 `ansible_service.py` 改为实例化时读取

`MAX_CONCURRENT_PLAYBOOKS` 保留为默认常量（供测试与兜底），`__init__` 改为：

```python
self._semaphore = asyncio.Semaphore(get_concurrency("max_playbooks", MAX_CONCURRENT_PLAYBOOKS))
```

`AnsibleRunnerService` 是**模块级单例**，且在 **import 阶段**即实例化（非"首次请求时"）：`cluster_nodes.py:68` 的 `_ansible_service = AnsibleRunnerService()` 是模块级代码，在 `main.py:20 from app.api.v1 import api_router` 导入链中被执行。因此 `get_concurrency()` 会在 **import 阶段**触发 `load_features()`——**早于** `main.py:27` 的显式 `load_features()` 调用。

⚠️ **时序与工作目录风险（V1/V2）**：`load_features()` 默认路径 `"features.yaml"` 相对**进程 CWD** 解析（`Path(path)`，无 `__file__` 锚定）。开发（`start.sh` cd 到 backend/）与 systemd（`WorkingDirectory=/opt/panshi/backend`）均无问题；但 **Docker 镜像若不包含 features.yaml，import 阶段触发的加载会静默回退默认配置**（features.py L76-78 文件不存在不报错），且 `main.py:27` 因缓存已设置而成为 no-op，"启动即校验"的安全网被绕过——见 D7。

现有**4 处**模块级单例都会在 import 阶段触发加载（`cluster_nodes.py:68`、`cluster_edge_env.py:26`、`cluster_install.py:38`、`cluster_stream_proxies.py:247`），首个被导入者（cluster_nodes）触发首次读取，其余复用缓存。`main.py:27` 与 import 阶段读取的是**同一份 `_features` 缓存**，语义等价于启动时读取一次，无竞态；运行中改 yaml 不生效（与 features 整体语义一致）。

### D5: 前端 store 扩展解析 `concurrency`，不新增 API

`GET /system/features` 返回 `get_features()` 完整 dict，新增 `concurrency` 命名空间后**自动包含在响应中**（若配置了；未配置则响应中不含该字段，前端 `|| {}` 兜底——见 V8），前端 store 只需多解析一个字段：

```ts
const concurrency = ref<Record<string, number>>({})
// load() 内:
concurrency.value = res.data.concurrency || {}

function concurrencyOf(name: string, defaultVal: number): number {
  if (!loaded.value) return defaultVal
  return concurrency.value[name] ?? defaultVal
}
```

`useClusterNodes.ts` 改为在 composable 内从 store 读取，并对 `batch_action` 做**后端上限 clamp（V3）**：

```ts
const featuresStore = useFeaturesStore()
// batchNodeAction / batchNodeStatus 内:
const limit = Math.min(
  featuresStore.concurrencyOf('batch_action', BATCH_ACTION_CONCURRENCY),
  featuresStore.concurrencyOf('max_playbooks', BATCH_ACTION_CONCURRENCY),
)
await runWithConcurrency(nodes, limit, ...)
```

**clamp 动机（V3）**：前端 `batch_action` 若调大而后端 `max_playbooks` 仍小，多出的请求会在后端信号量排队；而前端 axios 默认 30s timeout（`api/index.ts`），排队超过 30s 的请求会**超时报"失败"**（后端实际仍在排队执行）——造成假失败。`Math.min(batch_action, max_playbooks)` 保证前端并发永不超过后端信号量上限，从源头杜绝超时假失败。这是"以最保守值为准"的防御策略。

**时序表述修正（V5）**：`BATCH_ACTION_CONCURRENCY` 常量保留作为默认值（后端默认 5 与前端默认 5 保持同步的锚点）。需要澄清——**"store 必然已加载"在字面上不成立**：`app.mount()`（main.ts L19）先于 `load()`（L25-33）执行，core 路由（`/clusters`、`/central-management`，router/index.ts L75-100 创建时即注册）不受 features 阻塞，ClusterNodes.vue（CentralList.vue L229 v-else tab）与 CentralList.vue（L705 直接调用 `useClusterNodes`）**可在加载窗口内渲染**。但运行时安全：
- 实际读取发生在批量操作**调用时**（用户点击），而非 composable 创建时
- `concurrencyOf` 在 `!loaded` 时返回默认 5（安全降级，与现状一致）
- store 的 `concurrency` 是**响应式 ref**：若 load 在调用前完成，自动读到配置值；若 load 未完成，降级为默认 5

- **替代方案**：前端 Vite env（`import.meta.env.VITE_BATCH_ACTION_CONCURRENCY`）→ 构建时注入、无法与后端 yaml 单点维护，且"前后端单文件配置"诉求不满足。否决。
- **替代方案**：新增专用 `GET /config` 端点 → 冗余，现有通道已足够。否决。

### D6: 测试策略

- **后端** `tests/test_features.py`：补 `concurrency` 命名空间的正例（整数解析）、反例（非映射 / 未知 key / 布尔值 / 越界 / 非整数 → SystemExit）
- **后端 `get_concurrency` 测试的缓存隔离（V7）**：`test_features.py` 的 autouse fixture 每个测试**前**重置 `_features = None`（L13-18）但测试**后**不重置；且 pytest 按字母序运行，`test_ansible_service.py` 先于 `test_features.py`，其 fixture 实例化 `AnsibleRunnerService` 会触发读取**真实 backend/features.yaml** 并缓存。因此：
  - `test_ansible_service.py` 的 Semaphore 上限用例：直接 `monkeypatch`/mock `get_concurrency` 返回值（不触碰真实文件，最稳）
  - `test_features.py` 的 `get_concurrency` 用例：依赖 autouse fixture 重置（已具备），或显式 `monkeypatch.setattr(fmod, "_features", None)` + `load_features(tmp_path)`
- **前端** `stores/features.test.ts`：补 `concurrency` 解析与 `concurrencyOf()` 用例（mock 响应含 `concurrency` 字段；另补"未配置时响应不含该字段 → `|| {}` 兜底"用例）
- **前端** `useClusterNodes.test.ts`：**必须改**——现有 L385 `expect(maxInFlight).toBeLessThanOrEqual(5)`、L387 `expect(resolveFns.length).toBe(5)` 硬断言 5，且该文件目前**未 mock** `@/stores/features`（当前代码不 import 它），改后必须补。采用**方案 A（V6）**：顶层 `vi.mock('@/stores/features', ...)` 提供可配置的 `concurrencyOf` mock（参考 `ClusterNodesBatch.test.ts:74-76` 模式），断言并发数跟随配置变化（如 mock 返回 2 时 `maxInFlight ≤ 2`、`resolveFns.length === 2`），并保留默认回退（5）用例

### D7: Docker 部署必须携带 features.yaml（V2 修复）

**现状问题**：`backend/Dockerfile` 未 `COPY features.yaml`，`docker-compose.yml` 仅挂载 `./backend/data:/app/data`。因此 Docker 镜像内**没有 features.yaml**，`load_features()` 找不到文件 → **静默返回默认配置**（features.py L76-78 不报错），`main.py:27` 的"启动即校验"安全网被绕过——不仅 concurrency，**现有全部 feature 配置在 Docker 下都不生效且无提示**。

**本变更顺带修复（已确认纳入范围）**：
1. `backend/Dockerfile` 加 `COPY features.yaml ./features.yaml`（同时检查 `.dockerignore` 未排除该文件）
2. `docker-compose.yml` 后端服务加只读挂载：`./backend/features.yaml:/app/features.yaml:ro`（便于不改镜像即可调配置）
3. design.md/spec 记录该部署要求（Docker 部署必须提供 features.yaml，否则静默默认）

- **替代方案**：仅文档标注"Docker 下配置不生效" → 已否决（V2 确认纳入修复，因为本变更新增的 concurrency 配置在 Docker 下必然失效，不修复则变更在 Docker 场景无意义）。

## Risks / Trade-offs

- **前后端配置值不同步** → clamp（D5）保证前端并发永不超过后端 `max_playbooks`，消除"排队 + 30s 超时假失败"风险（V3）；剩余影响仅是"前端配大了但实际被 clamp 到后端值"，不报错。缓解：features.yaml 注释写明两值联动关系；文档说明以后端为准。
- **前端 store 未加载时执行批量操作** → `concurrencyOf()` 返回默认值 5，行为与现状一致（安全降级）；`main.ts` 加载失败时阻塞初始化并重试，不会带病启动。**运行时无竞态**：读取发生在批量操作调用时（用户点击），store 的 `concurrency` 是响应式 ref，load 完成后自动读到配置值（V5）。
- **前端并发值会话内冻结（V5）** → `features.ts` 的 `load()` 是单次 guard（L11 `if (loaded.value) return`），本会话不再重新拉取。修改 features.yaml 后需**刷新前端页面 + 重启后端**才生效。文档需明确此行为。
- **校验过严导致部署失败** → 与现有 features.yaml 校验风格一致（配置错误启动即退出是既有约定），且范围 1-50 + 白名单（V4）宽松；若未来需要更大并发或新参数，调整上限/白名单即可。
- **`bool` 是 `int` 子类的 YAML 陷阱** → D3 显式 `isinstance(val, bool)` 排除，测试覆盖。
- **多 worker 进程各自持有信号量** → 现状即如此（每进程一个 Semaphore），本次未改变该语义；文档提示：若部署多 worker，实际并发 = 进程数 × max_playbooks。
- **Docker 镜像未携带 features.yaml（V2）** → D7 修复：Dockerfile COPY + compose 只读挂载。回滚/历史镜像升级时若遗漏该配置，系统静默回退默认（与修复前行为一致，不更糟）。
- **测试缓存污染（V7）** → D6 明确隔离方案：`test_ansible_service` 直接 mock `get_concurrency`，`test_features` 复用 autouse 重置或显式重置 `_features`。

## Migration Plan

1. 修改 `features.py`（白名单校验 + getter）→ 后端测试通过
2. 修改 `ansible_service.py`（Semaphore 读取配置）→ 后端测试通过
3. 修改 `features.yaml` 添加 `concurrency` 命名空间（含注释，说明 clamp 联动）
4. 修改前端 `features.ts` store（解析 concurrency + concurrencyOf）→ 前端测试通过
5. 修改 `useClusterNodes.ts`（从 store 读取并发数 + clamp）→ 前端测试更新并通过
6. 修改 `backend/Dockerfile`（COPY features.yaml）+ `docker-compose.yml`（只读挂载）→ Docker 构建验证
7. 文档更新（`docs/` 中 features.yaml 说明，含 Docker 部署要求、会话内冻结说明）
8. **回滚**：删除 `concurrency` 命名空间即恢复默认 5；代码层面改动均为"读配置"性质，无破坏性变更（Docker 挂载移除即可恢复原状）

## Open Questions

- 无阻塞性问题。`concurrency` 命名空间的 key 命名（`max_playbooks` / `batch_action`）可在实现时微调，但建议保持 proposal 中的命名以统一文档与代码。
