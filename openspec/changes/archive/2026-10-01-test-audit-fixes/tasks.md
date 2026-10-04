# Tasks: 2026-10-01-test-audit-fixes

> 追溯性建档：代码已合入（0e0f4e27、46254ae3、93d713fb、c5eaccf0、2b039146、87594c7c），以下为实际执行记录。

## 1. 会话失效 toast 去重（0e0f4e27）

- [x] 1.1 `auth-session.test.ts` 增补：并发多 401 只弹一次 toast（3 秒时间窗）
- [x] 1.2 `api/index.ts` 401 拦截器 toast 节流

## 2. StreamProxyUpdate 边界校验（46254ae3）

- [x] 2.1 （RED）`test_stream_proxy.py`：PUT listen_port/name 越界应 4xx 且库内无脏行（原 xfail）
- [x] 2.2 （GREEN）`schemas/stream_proxy.py`：Update 的 name（1-100）、listen_port（1-65535）与 StreamProxyBase 对齐；摘除 xfail

## 3. 审计导出公式注入中和（93d713fb）

- [x] 3.1 `system.py` CSV/XLSX 导出值以 = + - @ 及制表/回车开头时加 `'` 前缀
- [x] 3.2 `test_audit_operations_api.py` 中和断言更新

## 4. 时区/结构/样式修复（c5eaccf0、2b039146、87594c7c）

- [x] 4.1 CentralList/ClusterList 创建时间改 formatDateTime（`TimezoneDisplaySentinel.test.ts` +78 行防回归）
- [x] 4.2 ClusterList 详情表格行包入 tbody
- [x] 4.3 DbBackupCard 分页行靠右（纯样式）
- [x] 4.4 回归：前端 vitest 全绿、`npx vue-tsc -b` 干净；后端 db/stream/audit 域用例通过
