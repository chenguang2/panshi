# Tasks

## 1. 后端配置与读取单点

- [x] 1.1 `backend/app/core/features.py`：新增 `KNOWN_LIMIT_KEYS = {"static_zip_max_mb"}`、`LIMIT_DEFAULTS = {"static_zip_max_mb": 32}`、`_validate_limits()`（未配置 → 回写缺省；未知键 / bool / 非 int / 越界 1–2048 → `sys.exit(1)` 中文可读错误）、`static_zip_max_mb() -> int` 读取助手（调用 `get_features()` 走 mtime 热加载）；在 `load_features()` 校验链中挂 `_validate_limits(raw)`。验证：`tests/test_features_limits.py` 全绿。
- [x] 1.2 `backend/app/api/v1/cluster_static_resources.py`：删除模块级 `STATIC_ZIP_MAX_BYTES`；新增 `_zip_limit_bytes()` = `static_zip_max_mb() * 1024 * 1024`；两处校验（声明 `file.size` 预判、`file.read(limit + 1)` 防御）与两处报错文案、发布 413 说明改用它。验证：读文件逐处确认无残留常量引用（`grep STATIC_ZIP_MAX_BYTES backend/app` 为零）。
- [x] 1.3 `backend/features.yaml`：新增 `limits:` 注释块（键名、单位、缺省、范围、与 nginx `client_max_body_size` 的联动提醒、大上限的内存提示）。验证：后端启动无报错；`GET /system/features` 含 `limits.static_zip_max_mb`。

## 2. 前端配置解析与预检

- [x] 2.1 `frontend/src/stores/features.ts`：增 `limits` ref、解析 `res.data.limits`、导出 `limitOf(name, defaultVal)`（未加载/缺键回退 default）。验证：`stores/__tests__/features.test.ts` 新用例绿。
- [x] 2.2 `frontend/src/composables/useClusterStaticResources.ts`：删除 `STATIC_ZIP_MAX_BYTES`，改导出 `STATIC_ZIP_MAX_MB_DEFAULT = 32`；上传预检在 `onchange` 内取 `limitOf('static_zip_max_mb', STATIC_ZIP_MAX_MB_DEFAULT)` 换算字节比较，文案 `zip 文件过大：上限 ${maxMb}MB`。验证：composable 用例（缺省 32 文案同字、配置 64 时按 64 判定与文案）。

## 3. 测试与守卫（TDD：先 RED 再 GREEN）

- [x] 3.1 新增 `backend/tests/test_features_limits.py`：缺省回写 32、配置 64 生效、mtime 热加载、未知键 `SystemExit`、五类非法值 `SystemExit`、`GET /api/v1/system/features` 透出 `limits`。验证：RED（实现前失败）→ GREEN。
- [x] 3.2 `backend/tests/test_upload_and_sshpass_hardening.py`：`_patch_limit` 改 patch `csr._zip_limit_bytes`；新增「配置 1MB 时 2MB 文件被拒（400 + 不落盘）」用例。验证：该文件全绿。
- [x] 3.3 `frontend/src/stores/__tests__/features.test.ts` 增 `limits` 解析 / `limitOf` 缺省回退 / 未加载回退用例；`frontend/src/composables/__tests__/useClusterStaticResources.test.ts` 增配置 64 用例（需 `setActivePinia`）。验证：两文件绿。
- [x] 3.4 按 design D6 迁移源码守卫 `frontend/src/views/__tests__/StaticResourceList.scoped.source.test.ts`（断言新预算单点而非旧常量字面量）。验证：该文件绿、且临时改坏预检时转红（反咬验证）。

## 4. 文档与收口

- [x] 4.1 `AGENTS.md` 约定 #50 补一句：zip 上限由 `features.yaml` 的 `limits.static_zip_max_mb` 配置（缺省 32），调大前须同步调大网关 nginx 与各 Edge `edge.env` 的 `client_max_body_size`。验证：文本存在且与代码一致。
- [x] 4.2 回归收口：`cd backend && uv run pytest tests/test_features_limits.py tests/test_upload_and_sshpass_hardening.py -q`；`cd frontend && npx vitest run --maxWorkers=4 <相关文件>`；`npx vue-tsc -b`；`openspec validate --all`（0 error）。验证：命令输出逐条贴出。
- [x] 4.3 真机验证：改 `features.yaml` 的 `static_zip_max_mb` 为 64（mtime 变化）→ 不重启，确认 `GET /system/features` 立即返回 64，且前端上传一个 >32MB 的 zip 通过预检（不报 32MB 超限）；验证完改回 32。验证：响应/截图证据。
