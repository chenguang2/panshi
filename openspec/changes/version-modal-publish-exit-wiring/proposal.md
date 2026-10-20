# Proposal: version-modal-publish-exit-wiring

## Why

用户实测发现：静态资源版本管理弹窗恢复成功后没有「立即发布恢复的配置」按钮（路由等域有）。核验确认这是共享组件 `VersionManagementModal` 的 `canPublish` prop 接线缺口，而非组件能力缺失。同型排查发现：

1. **静态资源两入口未接线**（独立页 + 集群子页 Tab）——恢复链路本身是通的（弹窗含 static_resource rollback 分支、后端端点在），仅发布出口条未显示。
2. **stream_proxy rollback 端点分支缺失（真缺陷）**：弹窗 rollback 端点三元链无 `stream_proxy` 分支，恢复落到 else = `/clusters/{cid}/routes/{rid}/rollback/{v}`——拿着流代理 id 调**路由**回滚端点，要么 404 要么错误回滚同 id 路由。后端正确端点已存在（`cluster_stream_proxies.py:611`）。
3. **其它可发布域未接线**：StreamProxyList（流代理）、DnsUdpProxyList（DNS UDP 代理）、SslList 同样渲染版本弹窗但未传 `can-publish`，同款「恢复后无发布出口」缺口。（EdgeEnv 有意不接：其语义是「加载到编辑器」；DnsQueryList 复用 route 类型，随路由语义覆盖。）

## What Changes

- **弹窗 rollback 端点精确路由**：`VersionManagementModal` rollback 端点链补 `stream_proxy` 分支（`/clusters/{cid}/stream-proxies/{rid}/rollback/{v}`），并加守卫断言：任何 resourceType 的 rollback 端点 MUST NOT 落到其它资源类型的端点。
- **静态资源两入口接线**（已实施验证，随本变更入库）：`StaticResourceList.vue` / `ClusterStaticResources.vue` 传 `:can-publish="true"` + `@publish-requested` → 各自既有发布链路。
- **三域接线**：`StreamProxyList.vue` / `DnsUdpProxyList.vue` / `SslList.vue` 同款接线——handler 按弹窗上下文（`vmId`）回查本域列表记录，调既有 `publishProxyAction` / `publishCert`，复用各页既有 `PublishConfirmModal` 发布确认。
- **spec 同步**：`config-version-management`「版本回滚语义（恢复不自动发布）」需求修订——已接线清单扩充 + 新增「回滚端点按资源类型精确路由」场景。

## Impact

- **Affected specs**: `config-version-management`（MODIFIED）
- **Affected code**:
  - `frontend/src/components/VersionManagementModal.vue`（rollback 端点分支 +1）
  - `frontend/src/views/StaticResourceList.vue`、`frontend/src/views/clusters/ClusterStaticResources.vue`（已实施）
  - `frontend/src/views/StreamProxyList.vue`、`frontend/src/views/DnsUdpProxyList.vue`、`frontend/src/views/SslList.vue`
- **测试**: VersionManagementModal rollback 端点守卫（stream_proxy 分支 RED→GREEN）+ 五个入口的接线断言（canPublish 传递 + publish-requested → 发布链路）
- **风险**: 低——弹窗仅补正确分支；三域 handler 均复用页面既有发布函数，零新发布实现（约定：发布编排单实现）
