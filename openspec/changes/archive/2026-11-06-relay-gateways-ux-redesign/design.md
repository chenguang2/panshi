# Design: relay-gateways-ux-redesign

设计全文以已批准蓝图为准：`docs/refactoring/relay-gateways-ux-redesign-blueprint.md`（含静态示例页 `relay-gateways-ux-redesign-mockup.html`，用户「都按推荐」批准，2026-11-06）。本文件只记录实现级裁决。

## Decisions

### D1 布局 = 方案 A（单页 · 说明卡 + 分组表单）

低频运维页，向导对编辑是负担；用户痛点为文案与分层而非流程。B（分步向导）/C（详情抽屉）否决理由见蓝图。

### D2 直连分段为纯前端派生

「有网关机/直连区域」分段选择派生自 `http_base_url || ssh_jump` 任一非空；不新增存储字段、不改 Out/Create/Update schema（第三批仅加只读 `attached_cluster_count`）。回显规则：两腿全空 = 直连选中。

### D3 文案即契约

蓝图字段文案总表（L89-137）与按钮文案总表（L160-170）为单一事实源；实现时逐字采用，不得改写。口令 placeholder 编辑态「已从服务端加载（加载动作已记录审计）」。

### D4 三批实施

1. 纯前端视图层（说明卡/分组表单/列精简/菜单二级描述/删除过渡文案）——零行为变化；
2. 小交互（直连分段、两腿全空保存提示、体检结果内联建议行——第三项若无自然落点可降级为对照表覆盖）；
3. 后端 `attached_cluster_count` 聚合 + 删除菜单真禁用态。

### D5 测试影响面（已核）

RelayGateways.test.ts 现有 34 用例：提交载荷断言不受影响（payload 不变）；受影响的是定位器（inputs[N] 位置索引——分组重排后索引变化，改用 placeholder/label 定位更稳）与列结构断言。逐用例核对后同步。

## Risks / Trade-offs

- 视图重排量大（~1200 行单页），回归靠组件测试全量 + 用户真实页面验收（#51②：验收落在用户实际操作的页面）。
- 分段选择与手工清空两腿的边界（选有网关机→清空两腿→保存）按 D2 蓝图一次性 message 处理。
