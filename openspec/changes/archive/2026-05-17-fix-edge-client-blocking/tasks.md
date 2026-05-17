## 1. 前端：边缘节点页面改为手动查询

- [x] 1.1 去掉 onMounted 中的自动 loadAllData() 调用
- [x] 1.2 去掉 watch(selectedNode) 中的自动 loadAllData() 调用
- [x] 1.3 添加 AbortController，每次查询创建新 controller
- [x] 1.4 添加「查询」按钮调用 startQuery()
- [x] 1.5 添加「取消查询」按钮调用 cancelQuery()
- [x] 1.6 onUnmounted 时取消进行中的请求

## 2. 后端：Edge 请求改为非阻塞

- [x] 2.1 添加 run_edge_sync() 辅助函数（asyncio.to_thread + asyncio.wait_for）
- [x] 2.2 修改 list_upstreams 端点使用 run_edge_sync
- [x] 2.3 修改 list_routes 端点使用 run_edge_sync
- [x] 2.4 修改 list_global_rules 端点使用 run_edge_sync
- [x] 2.5 修改 list_plugin_configs 端点使用 run_edge_sync
- [x] 2.6 修改 list_plugin_metadata 端点使用 run_edge_sync
- [x] 2.7 修改 list_available_plugins 端点使用 run_edge_sync
- [x] 2.8 EdgeClient httpx 超时 30s → 5s
