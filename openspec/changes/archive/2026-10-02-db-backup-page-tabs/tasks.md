# Tasks — 备份页 Tab 化改版

> 设计决策见 design.md（D1–D6）；行为契约见 specs/。核心前提：a-tabs 默认不销毁 pane（禁 destroyInactivePane / v-if 手写 Tab）；逻辑层零迁移，只挪模板；每批 `vue-tsc -b` + 相关 vitest 通过再进下一批。

## 1. 常驻层与 Tabs 骨架

- [x] 1.1 测试先行：切到「备份历史」Tab 后状态四格、立即备份按钮、dirty 徽标（若有）仍可见可点；实现常驻层抽离（状态四格 + 错误横幅 + 主操作 + 刷新 + sticky，sticky 失效按 D3 降级）
- [x] 1.2 引入 a-tabs 三 pane（备份位置 / 策略与保留 / 备份历史），模板迁移现有区块，默认 Tab = 备份位置；「策略与保留」承接全局配置全部字段 + 保存按钮 + 保留跨度说明（份数×间隔）
- [x] 1.3 测试先行：策略 Tab 修改未保存 → 切历史再切回，输入保留、徽标仍在、无拦截弹窗；实现 pane 不销毁钉死（回归用例防未来误改）

## 2. dirty 徽标与入口收口

- [x] 2.1 测试先行：存在未保存修改时切到历史 Tab 点击常驻层徽标 → 跳回策略 Tab；实现徽标上提常驻层 + 点击切换 activeKey（保存按钮留表单旁）
- [x] 2.2 恢复入口统一「恢复数据」系：常驻层「恢复数据…」/ 历史行内「恢复此包」（不变）/ SummaryCard「灾难恢复」→「恢复数据」，样式统一 secondary 系；`?wizard=1` 深链行为回归断言
- [x] 2.3 留白对齐：根元素继续无 padding，Tabs 卡片落 `.app-content` 留白内

## 3. 回归与验收

- [x] 3.1 DbBackupCard 三套 51 用例逐组回归（三选确认/历史筛选/位置 toggle/健康列/刷新守卫/来源标识确认），适配「跨区可见性」类 DOM 断言（预估 5–10 处）；SummaryCard 套件回归
- [x] 3.2 全量 `npx vue-tsc -b` 零错误 + 相关 vitest 全绿
- [x] 3.3 真实页面截图验收（localhost:12345）：Tab 结构与默认页、常驻层 sticky、切换保态、dirty 徽标跳回、恢复 modal 与三入口命名；tasks.md 勾选更新、`openspec validate --strict` 通过
