## 1. 修复 TableCard slot 转发

- [x] 1.1 添加 explicit slot 转发（#bodyCell, #headerCell, #customFilterDropdown）
- [x] 1.2 保留 header/footer slots 由 TableCard 自身消费

## 2. 修复 vitest 配置

- [x] 2.1 从 vitest.config.ts 的 `isCustomElement` 中移除 `a-` 规则
- [x] 2.2 全部 132 tests 通过（新增 2 个 slot 转发测试）

## 3. 验证受影响页面

- [x] 3.1 UserList.vue 操作按钮（编辑/重置密码/删除）通过 slot 转发正常渲染
- [x] 3.2 PluginSwitches.vue switch 开关通过 slot 转发正常渲染
- [x] 3.3 Dashboard.vue 表格 bodyCell slot 正常
