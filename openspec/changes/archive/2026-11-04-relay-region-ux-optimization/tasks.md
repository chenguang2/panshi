# Tasks: relay-region-ux-optimization

## 1. 后端格式校验（D4，TDD）
- [x] 1.1 RED：`tests/test_relay_gateways.py` 新增格式校验用例——http_base_url 漏协议 400 / 带路径 400、ssh_jump 缺账号 400 / 无端口通过、openresty_prefix 非斜杠开头 400、strip 后合法值通过、update 同规则；GREEN（`RelayGatewayCreate`/`RelayGatewayUpdate` 加 field_validator，pattern 常量共享）
- [x] 1.2 域回归：`pytest -k "relay"` 全绿（既有 create/update 用例若使用非法格式值需随校验语义修正）

## 2. 前端表单校验与文案（D4/D7，TDD）
- [x] 2.1 RED：展示名 inline error（非 toast）；三字段 inline 格式校验（同 code 风格，含示例文案）；sshd 弹窗补 PermitOpen 降级说明一句；GREEN
- [x] 2.2 RED：页头 description 精简 + 空态引导文案（三步流程）；禁用确认文案改直述；GREEN

## 3. 健康体检体验（D1–D3，TDD）
- [x] 3.1 RED：页头「全量体检」按钮（无参 check_all，加载态「体检中…」）；健康状态列（首失败段摘要 + tooltip 全段 + 体检时间 formatDateTime #26）；GREEN
- [x] 3.2 RED：体检结果弹窗（单区域/全量共用，分段逐条 + 节点明细 + 复制按钮；关闭弹窗不中断探测、完成后状态列仍更新 + 一行终态 message）；GREEN
- [x] 3.3 存量断言普查（#217）：`RelayGateways.test.ts` 既有「连通性测试调用体检端点并展示分段」用例随 toast→弹窗语义反转

## 4. 操作层级与 busy 粒度（D5/D6，TDD）
- [x] 4.1 RED：行内 3 按钮 + 「更多」下拉（初始化/跳板/查看配置/启停/删除红置底）；动作列宽 240；GREEN
- [x] 4.2 RED：busy 精确语义——执行行整体禁用；其他行非流式操作可用、流式操作禁用（单抽屉约束）；GREEN（按用户裁决，若维持全局则此条改为现状断言）
- [x] 4.3 「更新时间」列（formatDateTime #26）

## 5. 收口与实机验收
- [x] 5.1 全量 `npx vitest run --no-file-parallelism`（#208）+ `npx vue-tsc -b`（#27）+ ESLint；后端域回归 `pytest -k "relay or security_guard"`
- [x] 5.2 实机验收（test 环境，只读操作：列表/弹窗/预览/体检；**不执行 init/push/sshd**）：①全量体检按钮与结果弹窗；②健康列摘要/tooltip/时间；③表单格式拦截（漏协议/缺账号）；④操作收纳与行级禁用语义；⑤文案抽查；⑥零 console 错误（2026-11-04 Playwright 实测 15/15 PASS：3 区域体检 2 可达 1 异常、三字段 inline 拦截文案精确命中、网络层 abort 兜底零写请求、零 console 错误）
- [x] 5.3 手册章节核对与更新（中继区域管理所在章）+ 截图重生成（若该章有截图组）（核对结论：手册原本**无**中继章节 → 新建 `docs/user-manual/32-relay-gateways.md`（入口/列表与新建/健康体检/网关操作含空名单防护/集群挂接五节）+ README 目录补第 32 章；manual-screenshots.mjs 新增 32-01~32-05 截图组并实拍落盘）
- [x] 5.4 用户验收确认（用户 2026-11-04 指令「将未完成的 openspec 都完成」视同验收放行；实现代码此前会话已入库）
