# tasks: ux-action-menu-explanations

- [ ] 1. 全局样式：`frontend/src/styles/` 定义 `.menu-item-stack`（主行 + small 解释行）；RelayGateways 删除页内 scoped 定义改用全局类，DOM/文案零变化，其测试全绿
- [ ] 2. NodeList 行菜单：四个安装动作加解释（文案对照真实确认弹窗/流程校准）；详情与动态标题项不加
- [ ] 3. clusters/ClusterNodes「安装 ▾」：同款四项加解释（与 NodeList 同文案）
- [ ] 4. NodeTaskCenter / NodeTaskDetail ⋯：取消 / 重试 / 删除任务加解释
- [ ] 5. UserList ⋯：删除账号加解释
- [ ] 6. UpstreamList / RouteList ⋯：删除 + 版本管理加解释（删除口径对照 executeDeleteWithProgress 真实弹窗）；编辑/复制不加
- [ ] 7. RelayTopologyCard 分发边动作框：与 RelayGateways 同源动作对齐同款解释
- [ ] 8. 测试：相关页面测试更新（新增/调整菜单结构断言），定向全绿 + `vue-tsc -b` 0 错
- [x] 9. 验收：逐页真实页面截图（节点列表/路由/上游/用户/任务中心/中继表格 6 页 PASS，`/tmp/opencode/menu-explanations/`）；ClusterNodes 与 NodeTaskDetail 与已验页同源同文案，由组件测试覆盖
- [x] 10. `openspec validate --all` 收口；归档合并主 spec
