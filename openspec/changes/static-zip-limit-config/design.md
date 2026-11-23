# Design

## D1 配置位置：顶层 `limits` 命名空间（不放 `features` 映射、不做环境变量）

- 为什么不放 `features`：该映射的校验强制 bool（每键 = 功能闸门），容量上限是数值策略，混入需要放宽类型校验，破坏既有契约。
- 为什么不做环境变量：`features.yaml` 已是部署级配置单一事实源且有 mtime 热加载；环境变量要重启进程才生效，与「改完即时生效」诉求冲突。
- 命名空间形态照抄 `concurrency` 先例：`KNOWN_LIMIT_KEYS` + `_validate_limits()`（未知键报错 / bool 拒绝 / 整型范围校验）+ 缺省值回写（`GET /system/features` 恒定透出完整键集，对齐 `branding` 的合并语义）。
- 单位取 MB 整数：与 nginx `client_max_body_size 32m` 直观对齐，避免字节常量又一串 0。范围 1–2048（上限 2GB，防误填天文数字把内存校验变成 DoS 面）。

## D2 后端单点：`features.static_zip_max_mb()` + `_zip_limit_bytes()`

- `app/core/features.py` 新增 `static_zip_max_mb() -> int`（mtime 热加载天然生效）。
- `cluster_static_resources.py` 删除模块级 `STATIC_ZIP_MAX_BYTES` 常量（避免「常量与配置双源」），改 `_zip_limit_bytes()` = `static_zip_max_mb() * 1024 * 1024`，作为三处唯一入口：① 声明的 `file.size` 预判（避免超限内容全量读入内存）；② `file.read(limit + 1)` 防御校验；③ 发布 413 可读说明里的「当前上限 Nm」。
- 注意 `file.read(limit + 1)`：上限可被运维调到 2GB，该读取是全量入内存路径——本轮不改流式落盘（超出现有实现与需求，记为已知边界），但 yaml 注释提示「大上限会增加单请求内存占用」。

## D3 前端取值时机：调用时读取 store，不模块级固化

- `stores/features.ts` 增 `limits` ref 与 `limitOf(name, default)`（对标 `concurrencyOf`）。
- `useClusterStaticResources.ts` 在 `uploadStaticResource` 触发时（`input.onchange` 内）取 `limitOf('static_zip_max_mb', STATIC_ZIP_MAX_MB_DEFAULT)` 并换算字节——**不得**在模块顶层固化成常量，否则热加载后仍需刷新页面。
- 保留导出 `STATIC_ZIP_MAX_MB_DEFAULT = 32` 作为「store 未加载/缺键」的 fail-open 兜底（对齐 store 内其他缺省读取的 fail-open 语义），删除 `STATIC_ZIP_MAX_BYTES`。

## D4 文案：缺省 32 时逐字不变

- 前端：`zip 文件过大：上限 ${maxMb}MB`；缺省 32 → 与现行文案完全一致。
- 后端：`zip 文件过大：上限 {N}MB（部署配置 limits.static_zip_max_mb）`；缺省 32 时前缀一致，括号补充配置指针。
- 发布 413 说明：把「当前部署 32m」改为动态 `当前上限 {N}MB`，并保留「经中继发布受网关 nginx client_max_body_size 约束」。

## D5 边界如实标注，不改行为

本配置只改平台侧两道防线。发布腿的实际限制仍是：经中继 → 网关 nginx `client_max_body_size`（当前部署 32m）；直连 → Edge 节点自身 `edge.env` 的 `client_max_body_size`（实测为注释态 → nginx 默认 **1m**）。yaml 注释写明「调大本值前先把这两个 nginx 侧一并调大，否则上传能过、发布 413」。把 Edge `edge.env` 的上限纳入平台管理属于 Edge 部署域（要改下发渲染 + 验证 reload），**本轮不做**，如需另立项。

## D6 断言反转清单（约定 #217，落地前已 grep 全域消费方）

| 位置 | 现状 | 处理 |
|---|---|---|
| `backend/tests/test_upload_and_sshpass_hardening.py::_patch_limit` | `monkeypatch.setattr(csr, "STATIC_ZIP_MAX_BYTES", limit)` | 改 patch `csr._zip_limit_bytes`（返回 `limit`）；行为断言不变 |
| `frontend/src/views/__tests__/StaticResourceList.scoped.source.test.ts:140` | 断言源码含 `STATIC_ZIP_MAX_BYTES = 32 * 1024 * 1024` | 改为断言源码含 `limitOf('static_zip_max_mb'` 且预检在发请求前（意图不变：上传流存活于 composable） |
| `frontend/src/composables/__tests__/useClusterStaticResources.test.ts:78-80` | 断言 `zip 文件过大：上限 32MB` | 保留（缺省 32 文案同字）；新增「store 配 64 → 按 64 判定、文案 64MB」用例，需 `setActivePinia` |
| `backend/tests/test_static_resource_relay_route.py::test_publish_413_has_friendly_hint` | 断言 413 文案含 `32m` | 改为断言含 `32MB` + `limits.static_zip_max_mb`（文案上限改动态并带配置指针） |
| `backend/tests/test_features.py::test_features_not_exists_returns_defaults` | 断言文件缺失时默认配置**精确等于** `{features, enabled_plugins, branding}` | 期望值补 `"limits": dict(LIMIT_DEFAULTS)`（缺省值随默认配置透出，属行为新增） |
| 其余 grep 命中（`StaticResourceList.test.ts:528` 等） | 仅注释提及 32MB | 不动 |

## D7 测试策略（TDD，#16）

RED → GREEN 顺序：

1. 后端 `tests/test_features_limits.py`（新）：缺省回写 32、配置 64 生效、mtime 热加载、未知键 `SystemExit`、非法值（0 / -1 / 2049 / `"64"` / `True`）`SystemExit`、`GET /system/features` 透出 `limits`。
2. 后端 `test_upload_and_sshpass_hardening.py`：patch 点迁移后仍验证「超限 400 + 不落盘」；新增「配置 1MB 时 2MB 文件被拒」验证配置真被消费。
3. 前端 `stores/__tests__/features.test.ts`：解析 `limits`、`limitOf` 缺省回退、未加载时回退。
4. 前端 `composables/__tests__/useClusterStaticResources.test.ts`：配置 64 → 65MB 拒绝（文案 64MB）、63MB 放行。
5. 源码守卫按 D6 迁移。
6. 收口：`uv run pytest tests/test_features_limits.py tests/test_upload_and_sshpass_hardening.py tests/test_system_features*.py -q`、`npx vitest run` 相关文件、`npx vue-tsc -b`、`openspec validate --all`。

## D8 兼容性与回滚

- 不写 `limits` 的部署行为完全不变（缺省 32 = 历史常量）；`GET /system/features` 多一个字段，前端其他消费方读取特定键，不受影响。
- 回滚：删除 yaml 中的 `limits` 即回缺省 32；代码回滚不涉及数据迁移（无 schema 变更，无需跑 PG 冒烟）。
