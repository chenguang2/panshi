# edge-import-page-restyle 验收记录（2026-11-25）

基准：`docs/ui/Live-Artifact-5/proposal-c/edge-import.html`（用户已批准）。视口 1600×1000。

## parity 量测

量测脚本：本目录 `ei-parity2.cjs`（走完整真实流程后对齐量测：选 test 集群 → .13 节点 → 测试连接成功 → 推进 Step 1）。**零差异元素**：字段标签（110px 右对齐 req 星号）、ei-input、连接成功横幅全维度、成功标题、计数 chips、可选类型卡（选中态描边淡底/图标 accent/名称/✓ 角标）。

**已解释变体**（非差异）：两处 MISSING 为量测脚本状态工件——设计页主视图 = Step 1（实现需真实连接后推进）、设计页主视图卡头用了 `ck-cardhead` 类名（实现为 `ei-cardhead`，样式逐值一致）。

## 真机状态核验（真实数据）

`impl-step0-tested.png`：test 集群 192.168.0.13 真实连接成功（经中继）——绿横幅 + 8 计数 chips（路由 2 / 上游 2 / 插件 51 / 插件组 1 / 全局规则 1 / 插件元数据 1 / 四层代理 2 / SSL 证书 2）+ 下一步启用。`impl-step1.png`：步条步进（选择节点 ✓ → 选择配置 2 活动）+ 7 张可选卡全选中态。查询失败态（danger 横幅）由组件测试覆盖。

## 实施注记

- 三步 `v-if` 根分支的字面量收窄 TS2367 → `as number` 断言（vue-tsc 模板怪癖）。
- Step 0 卡结构曾少一处闭合（l5-card）→ 模板 missing end tag 暴露后补齐。
- 断言反转清单：`.a-input-password` → `input[type="password"]`（1）；`.a-select`[1] → `select.ei-input`（2）；`.section-card`/`.section-empty` → `.ei-sec`/`.ei-sec-empty`（1）；`.testing-hint` 保留零反转。

## 测试与回归

- 守卫先行 RED→GREEN：PAGES +1 对（设计/实现均无动作无徽标，两侧一致）；mockupParity edge-import 段 3 红线（禁 a-steps/a-alert 回流 + 必含 ei-steps/ei-ok/ei-counts/ei-warn/ei-types）。
- `npx vue-tsc -b` 0 error；全量 `npx vitest run --maxWorkers=4`：**243 文件 / 3501 用例全绿**（中间一轮 3 例漂移失败均未改动文件、隔离与末轮全绿——#58 波动）。
