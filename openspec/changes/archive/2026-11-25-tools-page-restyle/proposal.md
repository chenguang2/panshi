# Proposal

## Why

工具箱是本轮「页面美化（proposal-c 控制台语言）」中唯一未覆盖的核心页面：实现仍是 antd 布局壳 + 旧工具条视觉，警示条为硬编码色值、无页头、按钮语义混用（「当前时间」与「清空」同为红 hover），与已定稿的列表页/卡片页设计语言脱节。设计页 `docs/ui/Live-Artifact-5/proposal-c/tools.html` 已完成并经用户定稿（2026-11-25），本轮按设计页实施。

## What Changes

- **工作台外壳重构**：`a-layout-sider` 布局壳退场，改为设计稿解剖——132px「图标 + 文字」工具栏（`--bg` 底 + 右描边，激活项 accent 实底白字，悬停 accent 8%）+ 右侧工作区（同卡一体，不再双层卡片）。
- **新增页头**：`PageHeader` + `PageStatBadges`（「14 个工具」accent 首枚 +「0 外发请求」，数值来源为工具清单长度与纯本地转换的静态事实）；页头无动作按钮（与实现一致，工具页面级无动作）。
- **工具头规范统一**：标题 15px/600 + 用途提示灰字 + 右侧「帮助」（accent 弱底、带图标）与「清空」（悬停转红）；「当前时间」类中性填充动作改挂普通 ghost 按钮，SHALL NOT 复用清空的危险色悬停语义。
- **文本区等宽化**：全部输入/输出文本区 12.5px `--font-mono`、行高 1.7、聚焦 accent 环（Lua/JSON/YAML/Base64/令牌均为机器文本，按「值用 mono」约定）。
- **结果格容器化**：时间戳/IP·CIDR/哈希/JWT exp 的识别结果包进 1px 描边卡片逐行分隔，主行（北京时间 / IP·前缀）accent 6% 底 + accent 标签；JWT「剩余 N 分钟 / 已过期」用绿/红徽标。
- **差异结果区 token 化**：JSON 对比 / 文本 Diff 的逐行差异配色迁到 token（语义不变：红=删除/旧值，绿=新增/新值）。
- **SM4 警示条 token 化**：`#fffbeb/#fde68a/#92400e` 硬编码色值迁到 `--warning` 同族 token，语义不变（非阻断黄条）。
- **Keepalived 生成器按设计稿解剖**：表单字段/三列高级参数网格/组标题/文件卡片（灰底头 + mono 文件名 + 复制/下载）/节点折叠行全部对齐设计页。
- **守卫接线**：`pageHeaderActions.source.test.ts` 的 PAGES 清单增加 `Tools.vue ↔ tools.html` 对（页头徽标两侧一致 + 页头动作区两侧一致）；`mockupParity.source.test.ts` 增 tools 段源码红线（禁 a-layout-sider 回流、PageStatBadges 必在、当前时间/清空按钮类名分离）。
- **零行为变更**：14 个工具的转换/计算/生成逻辑（`utils/tools/*`）、帮助文档（`toolHelp.ts`）、深链（`?tool=`）全部不动；后端零改动。

## Capabilities

### New Capabilities

（无——工具箱域已有既有 capability 承载）

### Modified Capabilities

- `dev-tools`：MODIFIED「工具箱页面布局」——修正需求正文的工具数漂移（现文写 7 个，实现已 14 个），并升级为设计语言下的工作台外壳契约（工具栏解剖、mono 文本区、中性/危险按钮语义分离）；ADDED「工具箱页头」——页头 + 统计徽标 + 无页级动作按钮。

## Impact

- `frontend/src/views/Tools.vue`：模板结构（布局壳、页头、按钮类名）+ scoped 样式重写；`<script>` 逻辑不动（仅模板类名/结构相应微调）。
- `frontend/src/views/__tests__/pageHeaderActions.source.test.ts`：PAGES 清单 +1 对。
- `frontend/src/views/__tests__/mockupParity.source.test.ts`：新增 tools 段守卫。
- 后端零改动；`toolHelp.source.test.ts` 等既有工具域测试不受影响。
- 设计页 `proposal-c/tools.html` 为验收基准（#82 五步法逐元素量测），本轮不动设计稿。
