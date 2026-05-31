## 1. 新建 Drawer 组件

- [ ] 1.1 创建 `frontend/src/components/NodeExecutionResultDrawer.vue`，包含 Drawer 骨架、进度条、Tab 切换
- [ ] 1.2 实现关键信息 Tab 内容渲染
- [ ] 1.3 实现 stdout/stderr/命令 Tab 内容渲染
- [ ] 1.4 实现复制日志按钮（clipboard API）

## 2. 修改 Composable

- [ ] 2.1 在 `useClusterNodes.ts` 中添加 reactive 的 Drawer 状态（visible, logs, progress, result）
- [ ] 2.2 修改 `executeNodeAction` 改为驱动 Drawer 状态而非 Modal
- [ ] 2.3 修改 `queryNodeStatus` 同样使用 Drawer
- [ ] 2.4 在 `startNode`/`stopNode` 中添加 `Modal.confirm` 二次确认

## 3. 注册到页面

- [ ] 3.1 在 `ClusterNodes.vue` 模板中注册 `NodeExecutionResultDrawer` 组件
- [ ] 3.2 传递 reactive 状态，绑定 v-model:visible

## 4. 验证

- [ ] 4.1 确认启动/停止有确认弹窗
- [ ] 4.2 确认结果展示为 Drawer + Tab 布局
- [ ] 4.3 确认复制日志功能正常
- [ ] 4.4 确认状态查询也使用 Drawer 但跳过确认
