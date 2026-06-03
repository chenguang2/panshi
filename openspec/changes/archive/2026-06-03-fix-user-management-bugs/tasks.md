## 1. 用户列表页面 UI 修复

- [x] 1.1 设置角色列和状态列的固定宽度（角色列 100px，状态列 80px）
- [x] 1.2 修改权限列渲染逻辑：显示实际权限标签而非"在编辑中设置"，使用 `permissionKeyToLabel` 映射渲染权限中文标签

## 2. 编辑页面文案和布局修复

- [x] 2.1 将 `allPermissions` 中 `edge_nodes` 的 label 从"边缘节点管理"改为"Edge直连"
- [x] 2.2 同步修改 `permissionKeyToLabel` 映射中的 `edge_nodes` 值为"Edge直连"
- [x] 2.3 给重置密码输入框添加宽度限制（max-width: 220px），确保输入框和按钮在同一行

## 3. 验证

- [x] 3.1 检查 LSP 诊断无错误
- [x] 3.2 前端构建通过
