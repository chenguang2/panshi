# Proposal: 2026-10-01-test-audit-fixes

## Why

测试审计批次（`docs/refactoring/test-case-audit-2026-10-01.md`）在审计既有测试时暴露六个行为缺陷：有的是测试用 xfail 掩盖的真实后端缺陷（PUT 越界 500），有的是时区规约被视图绕过（naive UTC 少 8 小时），有的是 HTML 嵌套非法、样式错位、导出公式注入风险。本批次逐项修复行为而非迁就测试。

## What Changes

- `0e0f4e27` 前端 401 会话失效 toast 3 秒时间窗去重——并发多请求同时 401 时只弹一次「登录已过期」，不再 toast 风暴
- `46254ae3` StreamProxyUpdate 补齐与 Create 基类对齐的边界校验（name 1-100、listen_port 1-65535）——此前 PUT 越界值落库后 Response 校验失败 500，且脏行持久化、后续 GET 持续 500
- `93d713fb` 审计 CSV/XLSX 导出公式注入中和——以 =、+、-、@ 等开头（含制表/回车前缀）的单元格值加 `'` 前缀，防 Excel 打开时被解释为公式
- `c5eaccf0` CentralList/ClusterList 集群详情创建时间改走 formatDateTime（时区规约：naive UTC 按 UTC 解析、Asia/Shanghai 展示；此前 `new Date(t).toLocaleString()` 少 8 小时）
- `2b039146` ClusterList 集群详情表格行包入 tbody（HTML 嵌套合法化，浏览器自动纠正曾致样式错位）
- `87594c7c` 备份历史分页行靠右对齐（纯样式）

## Capabilities

### Modified

- `stream-proxy-management`：「User can edit a stream proxy」补更新边界校验场景
- `audit-log-ui`：「Export to CSV/Excel with large dataset support」补公式注入中和场景

## Impact

- 后端：`backend/app/schemas/stream_proxy.py`、`backend/app/api/v1/system.py`
- 前端：`frontend/src/api/index.ts`、`views/CentralList.vue`、`views/ClusterList.vue`、`components/DbBackupCard.vue`
- 测试：`backend/tests/test_stream_proxy.py`（摘 xfail + 修复面回归）、`backend/tests/test_audit_operations_api.py`；前端 `__tests__/auth-session.test.ts`、`__tests__/TimezoneDisplaySentinel.test.ts`
- 不进 delta 的裁量：0e0f4e27（前端会话 toast 行为无既有 spec 承接）、c5eaccf0（时间展示规约属 AGENTS #26 全局约定，无单页 spec）、2b039146（纯 HTML 结构修复）、87594c7c（纯样式）——均仅列 proposal
