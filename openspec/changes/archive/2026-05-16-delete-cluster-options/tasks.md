## 1. 后端

- [ ] 1.1 创建 `DeleteClusterRequest` 请求体 schema（`delete_db: bool = False`，`delete_edge: bool = False`）
- [ ] 1.2 修改 `DELETE /clusters/{cluster_id}` 接受请求体，根据参数条件执行删除逻辑

## 2. 前端

- [ ] 2.1 修改 `deleteCluster` 函数，确认弹窗增加两个 checkbox
- [ ] 2.2 确认按钮绑定禁用条件：`!deleteDb && !deleteEdge`
- [ ] 2.3 API 调用时传入 `{ delete_db, delete_edge }`
- [ ] 2.4 进度日志文案根据选项动态显示
