# Design — 备份页 Tab 化改版

## Context

完整结构评估见 des-1 报告（2026-10-01）：乱感 = 历史区错放大卡尾部（③，占 45%+）+ 配置/位置同构连排（②）+ 状态被标题挤下首屏（⑥）三者叠加。用户确认方案 B。页面刚完成 `db-backup-ux-hardening`（204d79ae）：状态单一数据源、dirty 计算、轮询降级、健康聚合、三选守卫——本次**逻辑层零迁移**，只做模板重组与常驻层抽离。

## Goals / Non-Goals

**Goals:**
- 常驻状态操作层钉死首屏：状态四格、错误横幅、立即备份、恢复数据主入口、刷新、dirty 徽标（sticky 化可选，滚动历史长表时状态不丢）。
- a-tabs 三内容页：备份位置（默认）/ 策略与保留 / 备份历史；历史区获得完整纵向空间（视口内可视行数翻倍）。
- 恢复入口三叫法统一为「恢复数据」系。

**Non-Goals:**
- keep-alive、pinia/页面级状态上提（form/saved/isDirty 留在组件内，a-tabs 默认 v-show 语义白送表单态保留）。
- 总览 Tab（内容太薄且割裂工作前情——三个工作 Tab 的前情都是链路健康，状态必须常驻而非收进 Tab）。
- 恢复向导 Tab 化（低频高危要 modal 阻断感；`?wizard=1` 深链语义保持）。
- Tab 状态进 URL（单 URL，避免深链矩阵膨胀）。
- 切 Tab 拦截弹窗（不销毁前提下是多余复杂度）。

## Decisions

### D1 pane 不销毁是硬前提
三个 pane 一律 `force-render` 全量常驻 DOM（禁 `destroyInactivePane`、禁 v-if 手写 Tab）——这是表单内存态零风险保留的根基。**as-built 修正**：评估原表述为「a-tabs 默认 v-show 语义」，实现时实测发现 rc-tabs 默认只挂载**访问过**的 pane（visited 惰性语义），jsdom 下会导致既有跨 pane 用例大面积适配；`force-render` 严格强于「不销毁」，既满足 D1 契约又把断言适配量从预估 5–10 降到 1。迁移后已加组件测试断言「切走再切回，表单输入保留」，防未来回归。若误用 v-if/destroyInactivePane，dirty 三选守卫的语义前提（isDirty 存活）立即翻车。

### D2 dirty 徽标上提，不做拦截
「有未保存修改」徽标从配置区标题行上提到常驻层，点击跳回「策略与保留」Tab；保存按钮留在表单旁不动。徽标可见性（跨 Tab）由常驻层天然解决。

### D3 常驻层 sticky 化
常驻层 `position: sticky; top: <layout 头部高度以下>`，滚动历史长表时状态与主操作不离场。需实测 `.app-content` 滚动容器确认 top 偏移；若滚动容器不是最近滚动祖先导致 sticky 失效，降级为非 sticky（不阻断验收）。

### D4 Tab 命名与默认页
「备份位置 / 策略与保留 / 备份历史」；默认落「备份位置」（管理员打开页最常确认"备到哪去"）。「策略与保留」Tab 承接原全局配置全部字段 + 保存按钮，顺带补写保留跨度说明（份数×间隔），充实该 Tab 内容。

### D5 恢复入口统一
常驻层主按钮「恢复数据…」、历史行内「恢复此包」（保留指向性）、摘要卡「灾难恢复」→「恢复数据」。样式统一 secondary 系（M11 已降级，命名收口）。

### D6 留白与层级
根元素继续无 padding（`.app-content` 供留白，与数据库管理页同派）；Tabs 卡片直接落在内容区。PageHeader 保留页面标题，常驻层不再重复大标题。

## Risks / Trade-offs

- [51 个组件用例的 DOM 断言回归] → jsdom 无布局，display:none pane 内 find/text/trigger 仍可用，预期大部分不破；逐组复跑三选确认/历史筛选/位置 toggle/健康列断言，预估 5–10 处「跨区可见性」类需调整。
- [a-tabs 为本页新组件形态] → 全站 view 层已有集群子页 Tab 先例，非孤例；视觉按 AntDV 4 默认 + 站内令牌。
- [sticky 失效] → 见 D3 降级路径。
- [prettier 重排破坏模板]（AGENTS.md #25）→ 模板内多语句 handler 一律提取为 script 函数；提交后复跑挂载类 vitest。

## Migration Plan

单 PR/单 commit：模板重组 → 常驻层抽离 → 徽标上提 → 入口统一 → 测试回归。回滚 = 回退前端构建产物。与 `db-backup-ux-hardening` 变更的关系：叠加不冲突（该变更管行为，本变更管结构），归档可同期进行。

## Open Questions

无——结构评估报告已完成全部决策（含五个牵连点的解法）。
