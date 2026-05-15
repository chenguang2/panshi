## 1. Backend: 修复插件元数据空配置误判

- [x] 1.1 将 `_compare_plugin_metadata` 中 `if not edge_data` 改为 `if edge_data is None`

## 2. Frontend: 上游高级配置开关重置

- [x] 2.1 添加 `watch(() => upstreamForm.advancedEnabled, ...)` 监听关闭时重置 checks、retries、timeout、pass_host、scheme、keepalive_pool

## 3. Frontend: 路由高级匹配开关重置

- [x] 3.1 添加 `watch(() => routeForm.advancedMatchEnabled, ...)` 监听关闭时重置 vars 为空数组

## 4. Testing

- [x] 4.1 编写单元测试 `ClusterList.advanced-toggle.spec.ts`
- [x] 4.2 运行测试验证 9 个用例全部通过
