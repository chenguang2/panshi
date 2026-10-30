# Tasks — 用户管理模块体验优化

> 执行约定：TDD（先失败测试再实现，约定 #16）；批间可独立交付；批 2/3 反转既有交互前先 grep 消费方与既有断言（#217）。

## 批 1 — 文案与视觉（纯前端，低风险）

- [x] 1.1 搜索框升级 a-input-search：回车/300ms 防抖触发、去首尾空格、placeholder「搜索用户名」（断言：连续 setValue 只触发一次请求；带空格 keyword 已 trim）
- [x] 1.2 角色/状态筛选原生 select → a-select showSearch（断言渲染形态；深链/既有消费方无）
- [x] 1.3 空态双形态：有筛选 →「无匹配用户 + 清除筛选」（点击清空搜索/角色/状态并刷新）；真空库 →「暂无用户」（断言两种形态与清除筛选行为）
- [x] 1.4 错误文案按 design §4 对照表更新（列表加载/删除/重置密码/保存分步定位）
- [x] 1.5 批 1 收口：UserList 全部测试 + `npx vue-tsc -b` 0 错误

## 批 2 — 交互修复（中风险）

- [x] 2.1 移除 4 列前端 sorter（待决项 1A；断言 columns 无 sorter 字段）
- [x] 2.2 状态列 BadgeStatus → a-switch（待决项 2A；点击弹确认；断言确认前不发请求、取消回弹）
- [x] 2.3 禁用/启用确认弹窗（文案按 design §4；断言确认后调用 updateUser(status)、成功 toast；初始管理员禁用拦截保持）
- [x] 2.4 ⋯ dropdown 只留「删除」（禁用/启用迁移到开关；断言菜单项构成）
- [x] 2.5 删除确认补级联后果说明文案（断言弹窗文本含「清除其资源权限与集群授权」）
- [x] 2.6 批 2 收口：全量 UserList 测试 + `npx vue-tsc -b`

## 批 3 — 状态语义（数据丢失防护）

- [x] 3.1 角色切换保留权限勾选（待决项 5A；移除 onRoleChange 清空；断言 admin↔user 来回切换勾选完整恢复）
- [x] 3.2 集群 picker 暂存态（待决项 3A：打开快照 pickerDraft、确认应用、取消还原；断言取消后 selectedClusterIds 不变）
- [x] 3.3 重置密码二次确认（待决项 4A；断言确认前不发请求、确认后调用 updateUserPassword 并清空输入框）
- [x] 3.4 编辑保存三请求序列分步失败定位文案（update 成功后 permissions 失败 →「用户基础信息已保存，但权限更新失败，请重试」；clusters 同型；断言错误分支）
- [x] 3.5 批 3 收口：全量 UserList 测试 + `npx vue-tsc -b` + 全量前端串行回归（--no-file-parallelism，#208）
- [x] 3.6 交付验收：真实 UI（12345）Playwright 走查——开关确认流/删除确认文案/picker 取消还原/角色切换勾选保持/空态清除筛选，截图对照 design-sample.html；验收微调：搜索框定宽 240px（a-input-search 撑满问题）、开关加「启/禁」单字标注
