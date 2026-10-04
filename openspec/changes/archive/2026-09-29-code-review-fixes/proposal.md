# Proposal: 2026-09-29-code-review-fixes

## Why

2026-09-28 全仓代码评审（报告 `docs/refactoring/code-review-report-2026-09-28.md`）产出 C/Critical、H/High、M/Medium、L/Low 四级问题清单。本批次一次性落实 C1/C2/H2-H4/M1-M7/L1-L9 共 20 项修复（H1「EdgeClient 异步化」不在本批，单独立项 edge-client-async），横跨认证加固、导入路径安全、指标查询、schema 自检、上传防线与前端生命周期治理。

## What Changes

- **C1+L6** validate_edge_uuid 双点校验 + 备份导入路径安全（路径穿越/越权路径拒绝，24 用例）；audit 移序
- **C2+M1** 软件检查白名单 + playbook 参数 quote + 节点脚本安全校验（29 用例）
- **H2** metrics label 查询键白名单（非白名单键拒绝，不进 ClickHouse SQL）
- **H3** production 密钥 fail-fast（⚠ 本变更不重复声明：该主题已由 `security-hardening-guardrails`「部署密钥链 fail-fast」成文，见 2026-10-04-security-hardening-p0p2 归档）
- **H4** PG schema 自检不 drop_all——自检仅增量补建，绝不删除既有结构
- **M2** 登录失败固定窗口限速（(username, ip) 键、10 分钟 5 次 → 429、成功清零）+ pwd_ver 改密吊销旧 JWT
- **M3** 静态 zip 32MB 上限双防线（前端选择期拦截 + 后端校验拒绝）
- **M4** 证书生成死链改本地打包（SslGenerateDialog 移除外链依赖）
- **M5+M6** clearSession 单实现（auth store 唯一出口，api 拦截器不再绕过）
- **M7** 发布/删除 300s 显式超时 + 在飞互斥（useClusterUtils 统一入口防重复点击）
- **L1-L9** 定时器清理、SSE abort、adminOnly 路由、features 有限重试、GZip 中间件、分页边界、sshpass -e（⚠ 已由 guardrails「SSHPASS 子进程级注入」成文）、空 catch 提示

## Capabilities

### Modified

- `cluster-static-resource-upload`：「上传 zip 并关联路由」补 32MB 双防线场景
- `clickhouse-metrics-query`：「Query time-series data」补 label 键白名单场景
- `stream-proxy-management`、`audit-log-ui` 等同类字段级加固归入后续批次（见 2026-10-01-test-audit-fixes）

### Added

- `security-hardening-guardrails`：新增「登录限速与密码版本吊销」需求
- `db-schema-migration`：新增「Schema self-check never drops existing data」需求

## Impact

- 后端：`backend/app/api/v1/auth.py`（限速+pwd_ver）、`users.py`（pwd_ver 递增）、`security.py`、`core/deps.py`（validate_edge_uuid）、`core/database.py`（schema 自检）、`main.py`（GZip）、`cluster_static_resources.py`（32m）、`services/metrics_service.py`（label 白名单）、`services/node_task_service.py`、`services/ansible_service.py`（sshpass -e/quote）、`services/cluster_backup.py`（路径安全）、`services/edge_client.py`
- Ansible：`backend/ansible/roles/edge/tasks/software_check.yml`（白名单）
- 前端：`api/index.ts`（401 会话失效）、`stores/auth.ts`（clearSession 单实现）、`main.ts`、`router/index.ts`（adminOnly）、`composables/useClusterUtils.ts`（300s 超时+互斥）、`SslGenerateDialog.vue`、`views/NodeTaskCenter.vue`、`views/clusters/ClusterNodes.vue`、`views/DatabaseManagement.vue`、`views/NodeList.vue`
- 测试：`backend/tests/test_auth_hardening.py`（新 141 行）、`test_security_review_fixes.py`（新 219 行）、`test_software_check_validation.py`（新 342 行）、`test_backup_import_path_safety.py`（新 216 行）、`test_gzip_middleware.py`（新 56 行）、`test_upload_and_sshpass_hardening.py`（新 206 行）、`test_ansible_service.py`（增补）；前端 `auth-session.test.ts`、`useClusterUtils.test.ts`、`NodeTaskCenter.test.ts`、`lifecycleCleanupGuards.test.ts`
- 文档：`docs/refactoring/code-review-report-2026-09-28.md`
- 不进 delta 的裁量：M4/M5/M6/M7 与 L 系多为内部实现治理或前端交互细节，无既有 spec 承接，按「宁少勿滥」仅列 proposal；C1+L6 路径安全由 `test_backup_import_path_safety.py` 守卫，未落 spec（cluster-json-backup 的条目级白名单见 2026-10-01-backup-import-guards）
