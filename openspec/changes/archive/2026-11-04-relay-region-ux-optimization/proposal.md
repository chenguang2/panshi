# Proposal: relay-region-ux-optimization

## Why

中继区域管理页（`/relay-gateways`，`RelayGateways.vue`）功能完整（区域 CRUD / 启停 / 连通性测试 / 初始化 / 下发 / 跳板配置 / 配置预览），但体验评审（2026-11-03，实机 + 代码勘察）发现三类问题：

1. **体检结果即焚，无持久健康视图**：连通性测试结果用 `message` toast 承载多行分段结果（默认约 3 秒消失）——失败原因无法回看、无历史；页面没有任何持久健康状态展示，多区域需逐个手点（每区域同步探测可达数十秒）。后端 `GET /relay/health-check` 无参调用即**全区域体检**（`check_all`，返回 `{regions: [...]}`），前端未消费。
2. **表单格式校验缺失（kjc 事故同族风险）**：`http_base_url` 无 `http(s)://` 前缀校验、`ssh_jump` 无 `user@host[:port]` 格式校验、`openresty_prefix` 无 `/` 开头校验；后端仅做去空白（前导空格曾让 init 的 nginx 探测静默失败，2026-10-03 实发）。漏写协议/端口的值会静默产出坏配置。
3. **操作层级混乱**：每行 8 个操作按钮（wrap 成两行、列宽 400px），高频（编辑/下发/测试）与低频危险（初始化/跳板/删除）混排无层级；页头描述三句技术密集长文主次不分。

## What Changes

- **一键全量体检 + 健康状态列**：页头新增「全量体检」按钮（复用既有无参 health-check 端点，零后端），逐区域持久展示最近一次体检结果（✓ 可达 / ✗ 失败摘要 / 未测）与体检时间。
- **体检结果持久呈现**：单区域与全量体检结果改为结果弹窗（分段逐条 + 节点明细），替代 message toast；弹窗可复制。
- **表单格式校验（双层）**：前端 inline error（同 code 风格）+ 后端 Pydantic validator——`http_base_url` 须匹配 `http(s)://host[:port]`、`ssh_jump` 须匹配 `user@host[:port]`、`openresty_prefix` 须以 `/` 开头。
- **操作收纳**：行内保留高频三项（编辑 / 连通性测试 / 下发配置），其余（初始化网关 / 配置跳板转发 / 查看配置 / 禁用 / 启用 / 删除）收进「更多」下拉；删除项红色置底。
- **文案与层级**：页头描述精简为一句 + 操作指引下沉空态/帮助；禁用确认文案改直述后果。
- （裁决点）busy 粒度：行级禁用（跨区域可并行）vs 维持全局禁用。

## Impact

- 受影响 spec：`relay-region-registry`（MODIFIED 区域连通性测试；ADDED 表单格式校验、健康状态展示与操作层级）
- 代码：`frontend/src/views/RelayGateways.vue` + 测试；`backend/app/schemas/relay.py`（validator）+ `backend/tests/`
- 不改变任何后端执行路径、通道寻址与配置渲染逻辑（`relay-channel-routing` / `relay-config-push` / `relay-sshd-setup` 不动）
