## Why

内外网分离的网络中，同一台服务器同时拥有内网地址（如 `192.192.9.2`）和外网地址（如 `10.158.40.51`）。现有 DNS 代理（StreamProxy UDP 模式）只支持单一地址返回：内网客户端查询 `qcg.com` 返回内网地址，外网客户端查询却拿不到对应的外网地址。

Edge 已新开发 `dns_upstream-ww` 插件支持内外网分离：通过 `export_nodes`（内网→外网地址映射）和 `_meta.filter`（按来源 IP 过滤）区分内/外网查询。磐石需要提供配套的配置界面、发布转换与导入兼容。

## What Changes

- **StreamProxyFormWizard DNS 模式**页面重构（讨论确认 2026-08-05）：
  - **开关放第一页**（端口选择页，DNS 代理时显示）
  - **不隔离** → 第二页与现状完全一致
  - **隔离** → 域名/健康检查/TTL 只输入一次，节点行内联「外网地址」列（只填 IP，端口复用内网端口）；`export_nodes` 内联于域名下，发布时组装为 `dns_upstream-ww` 插件
  - **外网访问来源过滤**（表单化）：包含/排除 IP 或 CIDR 列表，自动生成 `_meta.filter`（`priority=2110` 固定）
- **dns_config 持久化扩展**：`export_nodes` 内联于各域名（key=内网 `ip:port`，value=外网纯 IP），新增 `wan_enabled` / `wan_filter` 字段（磐石内部格式），旧配置无这些字段 → 行为不变
- **publish_dns_proxy 发布转换**：开关开启时在 edge `plugins` 中追加 `dns_upstream-ww`（hosts 复制内网配置 + export_nodes 端口拼接 + 插件级 `_meta`，filter 数组内 AND 判定）
- **edge_import_service 导入兼容**：检测 edge 配置中的 `dns_upstream-ww` 插件，还原 export_nodes（去端口）与 `wan_enabled`/`wan_filter`
- **配置校验（强化）**：启用时每个节点必须填写外网地址（IPv4，端口复用）；前端+后端双重拦截
- **CIDR 隐藏**：DNS 域名目标的「客户端 CIDR」输入框默认隐藏，不参与内外网逻辑
- **详情展示**：StreamProxyViewDrawer 显示「内外网分离」状态徽标
- **兼容**：内网 `dns_upstream` 不携带 export_nodes；导入时 ww 域名若不存在于内网 hosts 则丢弃并告警；开关切换保留已填数据

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `stream-proxy-management`: DNS 代理（UDP）模式支持内外网分离配置——新增开关、域名级外网映射、来源过滤，发布生成 `dns_upstream-ww` 插件，导入还原。
- `edge-import-stream-proxy`: DNS 代理导入时识别 `dns_upstream-ww` 插件并还原内外网分离配置。

## Impact

- 后端：`app/api/v1/cluster_dns_proxies.py`（publish_dns_proxy）、`app/services/edge_import_service.py`（convert_stream_proxy）
- 前端：`frontend/src/components/StreamProxyFormWizard.vue`（DNS 模式表单 + 提交/回填）、`DnsUdpProxyList.vue`（透传）
- 数据：`ps_stream_proxy.dns_config` JSON 结构扩展（向后兼容，无 DB 迁移）
- 测试：后端 publish/import 单测、前端表单单元测试
