# Design: 2026-10-01-test-audit-fixes

## Context

测试审计暴露的行为缺陷批次：两个进 delta（有明确 spec 家与用户可见语义），四个仅 proposal 记录（前端会话行为/全局时区规约/HTML 结构/纯样式）。

## Decisions

- **D1 Update schema 边界与 Create 基类对齐**（46254ae3）：越界值经 PUT commit 落库后 Response 校验失败 → 500 且脏行持续不可读。修复在 schema 层（Field 约束）而非端点层手工校验，让 Pydantic 在进入业务前 422 拒绝；摘除对应 xfail 并补「越界 PUT 拒绝 + 库内无脏行」回归。
- **D2 公式注入中和**（93d713fb）：CSV/XLSX 导出时对以 = + - @ 及制表/回车字符开头的单元格值加 `'` 前缀；中和只影响以文本打开的呈现，不改数据本身。
- **D3 toast 去重**（0e0f4e27）：401 拦截器内以 3 秒时间窗节流「登录已过期」toast，多请求并发失效只弹一次；clearSession 语义不变。
- **D4 时间展示回归共享格式化**（c5eaccf0）：视图内裸 `new Date().toLocaleString()` 撤除，改 `formatDateTime`（parseBackendDate 按 UTC 解析、Asia/Shanghai 展示），TimezoneDisplaySentinel 测试防回归。
