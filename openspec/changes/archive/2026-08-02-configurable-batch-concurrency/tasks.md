# configurable-batch-concurrency — Tasks

## 1. 后端：features.py 扩展

- [x] 1.1 在 `backend/app/core/features.py` 新增 `get_concurrency(name: str, default: int) -> int` helper，从 `get_features().get("concurrency", {}).get(name, default)` 读取
- [x] 1.2 在 `backend/app/core/features.py` 新增 `KNOWN_CONCURRENCY_KEYS: frozenset[str]`（`max_playbooks`、`batch_action`），并新增 `_validate_concurrency(config)` 校验（V4）：
  - `concurrency` 必须为映射（None 视为空映射）
  - 未知 key → 中文错误消息（列出未知 key 与允许的 key）+ `sys.exit(1)`（对齐 `KNOWN_FEATURES` 哲学）
  - 每项值必须为非布尔整数且 1 ≤ v ≤ 50，否则中文错误消息 + `sys.exit(1)`（错误风格对齐现有 L99-118）
- [x] 1.3 在 `load_features()` 的 `_validate(raw)` 之后调用 `_validate_concurrency(raw)`，并缓存完整配置（含 concurrency 命名空间）

## 2. 后端：ansible_service.py 读取配置

- [x] 2.1 在 `backend/app/services/ansible_service.py` 导入 `get_concurrency`（注意无循环依赖：features.py 不依赖 ansible_service）
- [x] 2.2 修改 `AnsibleRunnerService.__init__`（L322）：`self._semaphore = asyncio.Semaphore(get_concurrency("max_playbooks", MAX_CONCURRENT_PLAYBOOKS))`，保留 `MAX_CONCURRENT_PLAYBOOKS = 5` 常量作为默认值
- [x] 2.3 确认时序假设（V1）：该单例在 import 阶段实例化（cluster_nodes.py:68，随 main.py:20 导入链），`get_concurrency` 会在 import 阶段触发首次 `load_features()`（早于 main.py:27）——无需改代码，但需在代码注释/PR 说明中记录该事实，避免后人误以为"首次请求时加载"

## 3. 后端：features.yaml 配置样例

- [x] 3.1 在 `backend/features.yaml` 顶层新增 `concurrency` 命名空间，含 `max_playbooks: 5` 和 `batch_action: 5`，并添加注释说明语义（前端批量请求并发 / 后端全局 ansible 并发，两值建议联动；前端实际并发为 min(batch_action, max_playbooks)，见 clamp）

## 4. 后端：测试

- [x] 4.1 `backend/tests/test_features.py`：新增 concurrency 正例（整数解析 + `get_concurrency` 缺省返回默认值）
- [x] 4.2 `backend/tests/test_features.py`：新增 concurrency 反例（非映射 / **未知 key** / 布尔值 / 0 / 51 / 字符串 → SystemExit），对齐现有 `test_features.py` 的 pytest.raises(SystemExit) 风格（V4）
- [x] 4.3 `backend/tests/test_ansible_service.py`：**直接 mock `get_concurrency`** 返回不同值，断言 `AnsibleRunnerService` 信号量上限随之变化（或断言 `_semaphore._value`）——不要依赖真实 features.yaml（V7）
- [x] 4.4 缓存隔离（V7）：确认 `test_features.py` 的 autouse fixture 每测试前重置 `_features`；若新增 `get_concurrency` 用例依赖 `load_features(tmp_path)`，显式 `monkeypatch.setattr(fmod, "_features", None)` 防缓存污染

## 5. 前端：features store 解析 concurrency

- [x] 5.1 在 `frontend/src/stores/features.ts` 新增 `concurrency = ref<Record<string, number>>({})`，`load()` 内解析 `res.data.concurrency || {}`（V8：未配置时响应不含该字段，`|| {}` 兜底）
- [x] 5.2 在 `frontend/src/stores/features.ts` 新增 `concurrencyOf(name: string, defaultVal: number): number`，未加载返回 defaultVal，已加载返回 `concurrency.value[name] ?? defaultVal`
- [x] 5.3 更新 `frontend/src/stores/features.test.ts`：mock 响应含 `concurrency` 字段，断言解析与 `concurrencyOf()` 行为（含未配置时响应不含该字段 → `|| {}` 兜底返回默认值场景）

## 6. 前端：useClusterNodes.ts 使用配置

- [x] 6.1 在 `frontend/src/composables/useClusterNodes.ts` 引入 `useFeaturesStore`，在 `useClusterNodes` 内获取实例
- [x] 6.2 修改 `batchNodeAction`（L483）与 `batchNodeStatus`（L539）：并发数 = `Math.min(featuresStore.concurrencyOf('batch_action', BATCH_ACTION_CONCURRENCY), featuresStore.concurrencyOf('max_playbooks', BATCH_ACTION_CONCURRENCY))`（V3 clamp，防后端排队超时假失败），保留 `BATCH_ACTION_CONCURRENCY = 5` 常量作为默认值锚点
- [x] 6.3 更新 `frontend/src/composables/__tests__/useClusterNodes.test.ts`（V6 方案 A）：顶层 `vi.mock('@/stores/features', ...)` 提供可配置的 `concurrencyOf` mock（参考 `ClusterNodesBatch.test.ts:74-76` 模式）；将硬断言 5 的用例（L385 `toBeLessThanOrEqual(5)`、L387 `resolveFns.length === 5`）改为断言并发上限跟随 mock 配置值（如返回 2 时 `maxInFlight ≤ 2`）；保留默认回退（5）用例

## 7. Docker 部署修复（V2）

- [x] 7.1 检查 `backend/.dockerignore` 是否排除 `features.yaml`（若排除则移除）— **无 .dockerignore，无需处理**
- [x] 7.2 修改 `backend/Dockerfile`：新增 `COPY features.yaml ./features.yaml`
- [x] 7.3 修改 `docker-compose.yml`：后端服务新增只读挂载 `./backend/features.yaml:/app/features.yaml:ro`
- [x] 7.4 验证：`docker build` 后容器内存在 `/app/features.yaml`（或运行时挂载生效）— **本机无 docker，降级为静态验证：compose YAML 语法 + Dockerfile COPY 检查通过**

## 8. 验证与文档

- [x] 8.1 运行后端测试：`cd backend && uv run pytest tests/test_features.py tests/test_ansible_service.py`（全绿）— **49 通过；2 失败为预先存在（fake_run_playbook 缺 job_timeout 参数，与本次变更无关，基线验证确认）**
- [x] 8.2 运行前端单元测试：`cd frontend && npx vitest run src/stores/features.test.ts src/composables/__tests__/useClusterNodes.test.ts`（全绿）— **34 通过**
- [x] 8.3 `lsp_diagnostics` 检查所有修改文件无 error — **features.ts / useClusterNodes.ts 无诊断错误；vue-tsc --noEmit 通过**
- [x] 8.4 更新 `docs/` 中 features.yaml 相关说明，补充 `concurrency` 命名空间（key 语义、默认值、clamp 联动、多 worker 进程语义）— **docs/design/features-config.md 新增"并发参数（concurrency）"章节**
- [x] 8.5 文档明确两项行为（V5/V2）：(a) 前端并发值会话内冻结，修改 features.yaml 需刷新页面 + 重启后端；(b) Docker 部署必须携带 features.yaml（镜像 COPY 或只读挂载），否则配置静默默认 — **已在 8.4 章节的"生效方式"与"Docker 部署要求"中明确**
