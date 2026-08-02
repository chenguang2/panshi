# configurable-batch-concurrency

## Why

批量节点操作（启动/停止/reload/状态查询）的并发数前后端都硬编码为 5：前端 `useClusterNodes.ts` 的 `BATCH_ACTION_CONCURRENCY = 5`，后端 `ansible_service.py` 的 `MAX_CONCURRENT_PLAYBOOKS = 5`。不同部署环境的机器资源差异大（SSH 并发能力、CPU、ansible 进程开销），硬编码导致运维无法按资源调优——资源强的机器并发被浪费，资源弱的机器可能被压垮。需要把并发数提升为部署级配置。

## What Changes

- `backend/features.yaml` 顶层新增 `concurrency` 命名空间，包含两个整数配置项：
  - `max_playbooks`：后端全局 ansible playbook 并发上限（对应 `ansible_service.py` 的 Semaphore），默认 5
  - `batch_action`：前端批量节点操作并发数（对应 `useClusterNodes.ts` 的 `BATCH_ACTION_CONCURRENCY`），默认 5
- `backend/app/core/features.py`：
  - 扩展校验逻辑，支持 `concurrency` 命名空间（必须是映射；**key 必须在 `KNOWN_CONCURRENCY_KEYS` 白名单内**，未知 key 启动报错退出——对齐现有 `KNOWN_FEATURES` 哲学；值必须是 1-50 的整数，否则启动报错退出）
  - 新增 `get_concurrency(name, default)` helper
- `backend/app/services/ansible_service.py`：`MAX_CONCURRENT_PLAYBOOKS` 改为从 `get_concurrency("max_playbooks", 5)` 读取（在 `__init__` 创建 Semaphore 时；该单例在 import 阶段实例化，读取语义等价于启动时一次，见 design D4）
- 前端 `frontend/src/stores/features.ts`：扩展解析 `/system/features` 响应中的 `concurrency` 字段（该端点返回完整配置 dict，无需新增 API；**未配置时不返回该字段，前端 `|| {}` 兜底**），新增 `concurrency` 状态和 `concurrencyOf(name, default)` helper
- 前端 `frontend/src/composables/useClusterNodes.ts`：`BATCH_ACTION_CONCURRENCY` 常量改为从 features store 读取 `batch_action`（缺省 5），并**对 `max_playbooks` 做 clamp**（`Math.min(batch_action, max_playbooks)`），防止前端并发超过后端信号量上限导致 axios 30s 超时假失败
- **Docker 部署修复**（`backend/Dockerfile` 加 `COPY features.yaml`，`docker-compose.yml` 加只读挂载）：否则 Docker 镜像内无 features.yaml，`load_features()` 静默回退默认配置，concurrency 配置在 Docker 下必然失效
- 测试更新：
  - 后端 `tests/test_features.py` 补 `concurrency` 命名空间校验用例（含未知 key 反例）；`tests/test_ansible_service.py` 通过 mock `get_concurrency` 验证 Semaphore 上限跟随配置
  - 前端 `stores/features.test.ts` 补 concurrency 解析用例；`useClusterNodes.test.ts` 中硬断言并发 5 的用例改为顶层 mock `concurrencyOf` 并断言并发数跟随配置（方案 A）
- **向后兼容**：`concurrency` 未配置时全部走默认值 5，行为与现状完全一致，现有部署零迁移成本

## Capabilities

### New Capabilities

无。本变更扩展现有能力，不引入新能力。

### Modified Capabilities

- `deployment-feature-config`: features.yaml 支持新的 `concurrency` 顶层命名空间（整数配置项 + 严格校验：白名单 + 类型 + 范围），`GET /system/features` 响应随之扩展（未配置时不返回该字段）；Docker 构建集成必须携带 features.yaml
- `node-batch-action`: 批量节点操作的并发数从硬编码 5 改为读取部署配置（前端 `batch_action`，并对 `max_playbooks` clamp），后端 ansible 并发上限（`max_playbooks`）同步可配

## Impact

- **代码**：
  - `backend/app/core/features.py` — 校验扩展（白名单 + 类型 + 范围）+ `get_concurrency()`（新增）
  - `backend/app/services/ansible_service.py` — `MAX_CONCURRENT_PLAYBOOKS` 读取方式（修改）
  - `backend/features.yaml` — 新增 `concurrency` 命名空间（修改）
  - `backend/Dockerfile` — 新增 `COPY features.yaml`（修改）
  - `docker-compose.yml` — 后端服务新增 features.yaml 只读挂载（修改）
  - `frontend/src/stores/features.ts` — 解析 `concurrency` 字段 + `concurrencyOf()`（修改）
  - `frontend/src/composables/useClusterNodes.ts` — `BATCH_ACTION_CONCURRENCY` 来源 + clamp（修改）
- **测试**：`backend/tests/test_features.py`、`backend/tests/test_ansible_service.py`、`frontend/src/stores/features.test.ts`、`frontend/src/composables/__tests__/useClusterNodes.test.ts`
- **API**：`GET /api/v1/system/features` 响应新增 `concurrency` 字段（仅配置时返回；向后兼容，前端 store 解析新字段）
- **文档**：`docs/` 中 features.yaml 相关说明同步更新（含 Docker 部署要求、前后端 clamp 联动、配置会话内冻结需刷新页面+重启后端）
- **无数据库迁移、无新依赖**：`concurrency` 是纯配置项，不涉及 DB schema
