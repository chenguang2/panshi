## 1. 后端 diff API

- [ ] 1.1 在 clusters.py 新增 `GET /{cluster_id}/nodes/{node_id}/diff` 端点
- [ ] 1.2 实现对比逻辑：查询 DB 各资源 → EdgeClient.list_*() 拉取 Edge 配置 → 按资源 ID 逐项比对 → 返回结构化结果
- [ ] 1.3 处理默认值：DB 中未显式配置的字段使用 schema 默认值参与对比
- [ ] 1.4 处理仅 DB / 仅 Edge 的项

## 2. 前端对比页面

- [ ] 2.1 新建 `frontend/src/views/ConfigDiff.vue` 对比页面组件
- [ ] 2.2 双栏布局：左侧 DB 配置、右侧 Edge 配置；差异项高亮
- [ ] 2.3 按资源类型分组（上游、路由、插件组、全局规则、插件元数据）
- [ ] 2.4 状态统计概览（一致/差异/仅DB/仅Edge）
- [ ] 2.5 节点切换下拉框

## 3. 路由 + 入口

- [ ] 3.1 router/index.ts 注册 `/clusters/:clusterId/diff/:nodeId` 路由
- [ ] 3.2 ClusterList.vue 节点操作列加"数据库对比"按钮

## 4. 验证

- [ ] 4.1 LSP 诊断 + 测试
