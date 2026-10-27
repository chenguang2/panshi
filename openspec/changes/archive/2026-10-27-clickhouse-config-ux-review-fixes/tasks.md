# tasks: clickhouse-config-ux-review-fixes

> 决策点 1–5 待用户裁决；下列任务按推荐分支（1A/2A/3A/4A/5A）编写，裁决后按 design.md B 分支落差微调。批准前不动代码。

## 批 1 · 状态诚实与风险感知（P1-1/2/3；决策 1/3）

- [x] 1.1 RED：`_translate_test_error` 单测——拒连（Code 210）/认证失败/库不存在/域名解析失败/超时/未知透传 六类断言（error 主文案 + error_detail 原文）
- [x] 1.2 GREEN：试连端点响应改 `{ok, error, error_detail}`（三出口共用单实现；ok=true 时均为 null）；既有测试断言反转清点（#217）
- [x] 1.3 RED→GREEN：健康卡四态（未配置/检测中/可达/不可达）——进页自动检测（不落盘、不阻塞列表）、重新检测按钮、不可达摘要 + 原始错误展开、「去指标总览」入口；断言「存在激活连接但未检测验证时不得出现绿点」
- [x] 1.4 RED→GREEN：激活确认弹窗展示目标上次测试状态（✓/✗/未测试三态），失败/未测试黄色警示软提示（不阻断切换）
- [x] 1.5 PG 方言冒烟触发式评估记录（#103）：纯 yaml + 既有写路径，预期不触发——若判定触发则补跑 `TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`
  - 评估结论（2026-10-27）：不触发。变更面 = clickhouse.yaml 文件读写（无 ORM 模型列变更、无 raw SQL、无 JSON→TEXT 序列化新增、无审计 path param 变更）、query_summary 返回形状（纯内存）、summary 响应新增布尔/字符串字段。无 dialect 敏感路径。

## 批 2 · 表单与流程（P2-4/6/7/8/9/10；决策 1/2/4）

- [x] 2.1 RED→GREEN：测试留痕——`last_test_ok/last_test_at/last_test_error`（截断 200 字、naive UTC）落盘；断言参数字段与缓存版本不变（主规格 MODIFIED 场景钉死）；未保存表单试连不留痕
- [x] 2.2 RED→GREEN：重名 400（create/update trim 比对、排除自身、落盘前校验）；存量重名不受影响
- [x] 2.3 列表新列：「上次测试」（✓/✗ 相对时间 + hover 摘要 / 「未测试」灰字）与「密码」（password_set → 已设置/未设置）；时间格式走 `utils/format.ts`（#26）
- [x] 2.4 RED→GREEN：行内校验——名称必填+重名即时提示、主机必填+IP/主机名格式、端口 1–65535/超时 1–60 越界拦截、废除 `Number() || 9000` 静默改写、提交聚焦首错；端口 ⓘ native 语义提示
- [x] 2.5 RED→GREEN：「保存后设为当前连接」勾选项（新建恒显示/编辑仅非当前显示/无激活时勾选禁用）；保存成功激活失败分步提示；首条自动激活语义回归
- [x] 2.6 组件测试反转清点复核（#217）：`ClickHouseConfig.test.ts` 既有断言逐项核对（13 用例全量重写），守卫 `uxReviewM` M8（「+ 新建连接」）保持通过

## 批 3 · 一致性与收尾（P3；决策 5）

- [x] 3.1 `#` 序号列（`{title:'#', key:'index', width:45}` + `index+1`，#59）；空态收敛为单层 `#emptyText` + 「+ 新建连接」CTA（#57 槽名，测试桩用 aTableStub）
- [x] 3.2 `_write_struct` 与模板文件头注释改「监控 → ClickHouse 配置」；激活行「删除」禁用态去 danger 配色；后端 create/update/delete 双 `commit()` 清理
- [x] 3.3 （决策 5A）`GET /metrics/summary` 响应加 `source_ok`；`MetricsSourceBanner` 组件 + 指标总览/查询两页接入（store 增 sourceOk 态）；跳转「监控 → ClickHouse 配置」
- [x] 3.4 收口：`npx vitest run --no-file-parallelism` 全量绿（1997/1997，154 文件）；`npx vue-tsc -b` 0 error；`uv run pytest` 全量 2559 passed（唯一红为 test_get_client_config_applied 既有环境性红——依赖未跟踪运行态文件内容，已密闭化修复）；真页 Playwright 走查 8 项（健康卡不可达/错误详情展开/行内校验/试连成功/保存并设为当前/激活警示/跨页横幅/重新检测）全过；实验后现场还原（终态仅 ck_default 激活）。走查暴露并修复：保存并激活后健康卡未重检（handleSave 补 runHealthCheck）、总览页 store 不载 summary（metricsDashboard store 补 sourceOk 随刷新循环）
