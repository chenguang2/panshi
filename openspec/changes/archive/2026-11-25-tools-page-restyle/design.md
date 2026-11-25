# Design

## Context

`Tools.vue`（约 1350 行）现状：`a-layout` + `a-layout-sider(132)` 布局壳；14 个工具面板共用 `.tool-panel`（白卡）+ `.dual-panel`；按钮语义混用（`.btn-clear` 同时挂「清空」与「当前时间」，hover 均转红）；SM4 警示条硬编码 `#fffbeb/#fde68a/#92400e`；无页头（页面直接以工作台开头）；图标用 `@ant-design/icons-vue`。设计基准 `docs/ui/Live-Artifact-5/proposal-c/tools.html` 已定稿，其页内 `<style>` 的 `tb-*` 解剖值即迁移来源。约束：工具逻辑（`utils/tools/*`）、帮助抽屉（`ToolHelpDrawer`/`toolHelp.ts`）、深链（`?tool=`）全部不动；纯前端单文件改动。

## Goals / Non-Goals

**Goals:**

- Tools.vue 渲染结果与 `proposal-c/tools.html` 在 1600×1000 视口逐元素一致（#82 五步法验收）。
- 视觉规格单点化：页面解剖值只存在于 Tools.vue scoped 样式（工具箱解剖全站独一份，不进 style.css 共享层）。
- 守卫固化：新增红线进既有源码守卫测试，防止回流。

**Non-Goals:**

- 不改任何工具的转换/计算/生成行为与文案；不动 `toolHelp.ts` 帮助内容。
- 不做新功能（无新增工具、无批量、无后端改动）。
- 不动设计稿（tools.html 为验收基准，本轮零修改）。

## Decisions

1. **布局壳弃用 `a-layout`/`a-layout-sider`，改纯 flex 结构**——sider 仅提供宽度与底色，antd 自带样式需成片覆盖；设计稿外壳是「工具栏 + 工作区同卡一体」（单层描边），antd layout 的嵌套结构反而碍事。备选「保留 a-layout 只改样式」被否：覆盖成本更高、且守卫无法用「禁 a-layout-sider」钉住回流。
2. **实现类名与设计页同名（`tb-*`）**——Tools.vue scoped 样式沿用设计页 `tb-rail/tb-tool/tb-head/tb-dual/tb-pane/tb-ta/tb-result/...` 类名与值，parity 逐元素量测时两侧同名元素直接对照，降低量测映射成本。备选「另起语义名」被否：同构页多一套命名只增加对照摩擦。
3. **图标换内联 SVG（14 枚，`stroke-width:2` 圆角线性家族，与设计页逐字一致）**——antd 图标为填充/描边混合风格，与设计页线性图标肉眼可辨；统一后 `@ant-design/icons-vue` 的 14 个工具图标 import 全部退场（帮助按钮问号图标同步内联）。
4. **按钮三分**：`.tb-btn-help`（accent 弱底）/ `.tb-btn-ghost`（中性填充动作，如「当前时间」）/ `.tb-btn-clear`（清空，hover 危险色）。现 `.btn-clear` 一类两用的语义混用就此终止，守卫钉住类名分离。
5. **页头按 `PluginSwitches.vue` 同款接入**：`PageHeader`（title+description）+ `#stats` 槽 `PageStatBadges`。items = `[{ value: tools.length, label: '个工具' }, { value: 0, label: '外发请求' }]`——首枚组件逻辑恒 accent；「0 外发请求」是「全部工具纯本地转换」的静态事实，不是运行时统计（spec 已注明来源）。
6. **Keepalived 折叠保留 `a-collapse` 组件、仅覆盖样式**——设计稿折叠行是静态形态，实现保留既有交互行为（展开/收起、逐节点文件），只对齐视觉；换原生实现属行为重写，超本轮范围。
7. **守卫接线两处**：① `pageHeaderActions.source.test.ts` 的 PAGES 加 `['Tools.vue', 'tools.html']`——第三段徽标守卫自动生效（设计有 ph-inline ↔ 实现必须有 PageStatBadges），第一段页头动作守卫为「空 ↔ 空」；② `mockupParity.source.test.ts` 增 tools 段，钉三条红线：模板禁 `a-layout-sider`、必须含 `PageStatBadges`、「当前时间」与「清空」按钮类名分离（`tb-btn-ghost` ≠ `tb-btn-clear`）。
8. **文本区保留 `a-textarea`、scoped `:deep` 覆盖字体**——等宽化是纯样式，换原生 textarea 属无谓的结构替换；行高 1.7 与聚焦环均在覆盖层实现。

## Risks / Trade-offs

- [PAGES 加对后第一段页头动作断言对「空 ↔ 空」的行为未验证] → 落地第一步先加对跑测试，若断言形态不兼容再调整注册方式（不放宽既有断言）。
- [mono 字距更宽导致长 token（JWT/Base64 密文）换行点变化] → 设计稿已按 1.7 行高验证过长 token 换行；验收时对照 JWT 样张。
- [14 个工具逐一视觉回归成本] → 五类解剖覆盖全部工具形态（样张即清单），按类验收而非逐工具重复量测；设计页样张段落即为验收分组。
- [scoped 样式重写误伤帮助抽屉等子组件] → `ToolHelpDrawer` 是独立组件自带样式，页面 scoped 不外溢；跑 Tools 相关 vitest 回归。

## Migration Plan

单页面前端改动，一次提交，无数据/接口迁移；回滚 = revert 该提交。

## Open Questions

（无）
