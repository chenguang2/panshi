# Tasks

- [x] 1.1 写 MODIFIED delta：`Upstreams referenced by routes excluded from deletion`（全部被引用 → 阻断弹窗；部分被引用 → 确认框提示带引用路由名）
- [ ] 1.2 实现：`UpstreamList.vue` 全部被引用路径改用 `showOverlayModal`（对齐插件组 `showReferencedDeleteBlock` 形态）
- [ ] 1.3 实现：部分被引用路径的 `extraWarning` 补引用路由名（每上游最多 3 个，超出折叠）
- [ ] 1.4 测试：全阻断弹窗（标题/上游名/路由名/无删除入口/无 DELETE 请求）、部分跳过提示含路由名
- [ ] 1.5 真机截图 + 归档并 `openspec validate --all` 收口
