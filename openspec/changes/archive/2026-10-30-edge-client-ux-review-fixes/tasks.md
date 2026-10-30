# tasks: edge-client-ux-review-fixes

> 裁决（2026-10-30）：失败聚合反馈=A、分页=B（保持全量渲染，不接入）、编辑弹窗警示=A

## 批 1 — 查询反馈与正确性

- [x] 1.1 8 路 loadXxx 返回成败（catch 收集失败标签，不再纯 console.error）；loadAllData 聚合：全失败 → queryError 横幅 + 不设 loadedNode + 清数据；部分失败 → warning 横幅列失败类别；先写失败测试
- [x] 1.2 未选节点查询 → warning「请先选择节点」（cluster/manual 两模式）
- [x] 1.3 手动输入直读：移除 @blur 依赖，resolveNode() 统一取值 + ip:port 格式校验
- [x] 1.4 横幅渲染（filter-bar 与 tabs 之间，closable）

## 批 2 — 一致性

- [x] 2.2 6 个编辑/新建弹窗顶部调试模式警示（单点片段复用）
- [x] 2.3 空态三态 computed（未连接/失败/无数据）
- [x] 2.1 🔍 → SearchOutlined（8 处）；manual placeholder 改 192.168.0.14:16620

## 批 3 — spec 漂移与收口

- [x] 3.1 delta spec validate 通过（场景标题稳定标识符核对：Page loads without auto query 保留改名反转）
- [x] 3.2 组件测试：全失败/部分失败/未选节点/直读/弹窗警示/搜索图标；既有 RouteLabel + SslPagination 回归绿
- [x] 3.3 vue-tsc 0 错误 + 全量前端串行回归
- [x] 3.4 真实 UI 验收：不可达横幅、编辑弹窗警示、搜索图标、截图
