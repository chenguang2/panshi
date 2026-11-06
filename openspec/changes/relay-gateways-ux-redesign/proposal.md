# Proposal: relay-gateways-ux-redesign（中继区域管理页体验重设计）

## Why

用户实测反馈（2026-11-06）：新建/编辑弹窗 12 字段一屏铺开、多数字段含义不明（「不知道填什么和含义」）；页面上初始化网关/下发配置/配置跳板转发等动作按钮含义不清（「不知道如何用」）；「留空=直连区域」等关键语义藏在括号小字里。公司其他页面（证书管理说明卡、数据导入分步）已有成熟的帮助范式，本页未采用。

完整设计与文案见已批准蓝图：`docs/refactoring/relay-gateways-ux-redesign-blueprint.md`（含静态示例页 mockup.html，用户已逐项批准「都按推荐」）。

## What Changes

- **方案 A（单页 · 说明卡 + 分组表单）**：页顶结论式说明卡（登记→初始化→下发三步走 chips + 可折叠三列动作对照表「何时用/做什么/幂等性」）；表格列精简（删 SSH 用户/OpenResty 前缀列，两腿合并「网关两腿」，健康独立列，直连区域徽章）；新建/编辑弹窗字段四层分组（基础身份/网关连接方式分段选择/SSH 凭据/高级参数折叠）。
- 「有网关机 / 直连区域」分段选择：纯前端派生自 http_base_url/ssh_jump 是否为空（显性化「留空=直连」语义）。
- 更多菜单每项加二级描述；删除保护过渡文案（挂接时 409 + 解挂指引）。
- 第三批（后端小改）：列表 Out 增 `attached_cluster_count`，被挂接区域删除菜单置灰 + 描述「已被 N 个集群挂接，先解挂再删除」。
- 不触碰：SSE 流程、useInstallStream、口令单查审计时序、_INFLIGHT 并发、清单缺组前置拦截、手写 modal-overlay（#25）。

## Capabilities

### New: relay-gateways-ux-guidance
中继区域管理的自解释性：说明卡/动作对照/字段帮助文案/直连显性化/删除保护指引。

## Impact

- 前端：`RelayGateways.vue`（视图层重排 + 文案）+ 其测试（断言反转清单已核：提交载荷不变，仅选择器/列结构变化）。
- 后端（仅第三批）：`relay.py` list_gateways 聚合 attached_cluster_count；`RelayGatewayOut` 增字段。
- 零行为变化承诺：第一批/第二批不改任何保存/执行时序；第三批仅加只读聚合字段。
