## 1. 后端统计接口

- [ ] 1.1 在 clusters.py 新增 `GET /{cluster_id}/stats` 端点，返回各资源计数

## 2. 后端删除接口改造

- [ ] 2.1 改造 `DELETE /{cluster_id}`：查询子资源 → 批量删 ConfigVersion → 删子表 → 删集群
- [ ] 2.2 删除后遍历活跃 Edge 节点，调用 EdgeClient 各 delete 方法同步清理

## 3. 前端删除弹窗改造

- [ ] 3.1 重写 `deleteCluster`：先调 stats 接口获取资源计数
- [ ] 3.2 实现 Step 1 弹窗：资源统计列表 + 输入集群名称确认
- [ ] 3.3 实现 Step 2 弹窗：复用 `buildDeleteProgressContent` 展示删除进度
- [ ] 3.4 更新卡片删除按钮位置/样式（如需）

## 4. 验证

- [ ] 4.1 LSP 诊断 + 测试通过
