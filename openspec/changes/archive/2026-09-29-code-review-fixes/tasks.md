# Tasks: 2026-09-29-code-review-fixes

> 追溯性建档：代码已合入（b6662264），以下为实际执行记录（评审批次按 TDD 推进，每项先红后绿）。

## 1. 认证加固（M2）

- [x] 1.1 `backend/tests/test_auth_hardening.py`：限速窗口/429/成功清零/pwd_ver 吊销用例（141 行）
- [x] 1.2 `auth.py` 模块级固定窗口限速（(username, ip) 键、10 分钟 5 次 → 429、成功清零、过期 prune）
- [x] 1.3 `users.py` 改密递增 pwd_ver；`security.py` JWT 携带 pwd_ver、鉴权版本不匹配拒绝

## 2. 输入与路径安全（C1/C2/H2/H4/M3）

- [x] 2.1 `test_backup_import_path_safety.py`：备份导入路径穿越/越权路径拒绝（24 用例）；`deps.py` validate_edge_uuid 双点校验、`cluster_backup.py` 路径加固
- [x] 2.2 `test_software_check_validation.py`：软件检查白名单 + playbook quote + 脚本安全校验（29 用例）；`software_check.yml` 白名单化、`ansible_service.py`/`node_task_service.py` 加固
- [x] 2.3 `metrics_service.py` label 键白名单（非白名单键 400）
- [x] 2.4 `core/database.py` schema 自检摘除 drop_all 类破坏路径（仅增量补建）
- [x] 2.5 `cluster_static_resources.py` 32MB 后端校验（与前端选择期拦截构成双防线）

## 3. 前端治理（M4/M5/M6/M7/L1-L6）

- [x] 3.1 `stores/auth.ts` clearSession 单实现；`api/index.ts` 拦截器统一走 store
- [x] 3.2 `useClusterUtils.ts` 发布/删除 300s 显式超时 + 在飞互斥（`useClusterUtils.test.ts` 136 行）
- [x] 3.3 `NodeTaskCenter.vue` 定时器/SSE 清理（`lifecycleCleanupGuards.test.ts`、`NodeTaskCenter.test.ts`）
- [x] 3.4 `router/index.ts` adminOnly 路由守卫；`main.ts` features 有限重试；`SslGenerateDialog.vue` 死链改本地打包
- [x] 3.5 `ClusterNodes.vue` 大幅重构收敛（657 行变更，评审 M/L 项集中区）

## 4. 全局与验证（L7/L8/L9 + 回归）

- [x] 4.1 `main.py` 挂 GZip 中间件（`test_gzip_middleware.py` 56 行）
- [x] 4.2 `ansible_service.py` sshpass 改 -e 子进程级注入（`test_upload_and_sshpass_hardening.py` 206 行）
- [x] 4.3 `test_security_review_fixes.py`（219 行）横切回归；分页边界、空 catch 提示
- [x] 4.4 后端全量 pytest 通过；前端 vitest 全绿
