## Why

当前四层代理界面将协议固定为 TCP：侧边栏菜单名为"TCP代理"，创建向导 Step2 的"协议"是只读徽标（normal 类型固定显示 TCP）。但实际上系统已支持 UDP（DNS 代理走 `scheme='udp'`），且用户需要区分 TCP / UDP / TLS 三种四层转发协议。继续叫"TCP代理"名不副实，且用户无法在界面上看到三种协议的区别。

## What Changes

- **菜单改名**：侧边栏"TCP代理" → "四层代理"（路由 `/stream-proxies` 不变）
- **列表页文案**：PageHeader 标题"TCP 代理"→"四层代理"，描述更新为涵盖 TCP/UDP/TLS；"新建 TCP 代理"按钮 → "新建四层代理"；`useStreamProxyList` 的 `pageTitle`/`itemLabel` 同步更新
- **协议选择交互**：创建/编辑向导 Step2 的协议字段从只读徽标改为 **Radio 三选一（TCP 默认 / UDP / TLS）**，每个选项卡片带一句话协议说明，选中后下方显示动态提示
- **TLS 处理**：仅将 `scheme` 设为 `'tls'`，不选证书、不加额外字段
- **UDP 处理**：仅 `scheme` 设为 `'udp'`，其余与 TCP 完全一致
- **列表协议徽标**：卡片保留协议徽标，`schemeLabel` 补充 `tls → TLS`（`StreamProxyList.vue` 与 `StreamProxyViewDrawer.vue` 两处）
- **后端**：`StreamProxyCreate`/`StreamProxyUpdate` 的 `scheme` 增加 `Literal["tcp", "udp", "tls"]` 校验（**仅约束写入**，`StreamProxyBase` 保持 `str`，避免响应 schema 继承校验导致读取 500）；发布逻辑 `scheme.upper()` 已天然支持 `"TLS"`，无需额外改动
- **导入归一化**：`edge_import_service.convert_stream_proxy` 对导入的 upstream scheme 归一化（`tcp_udp`→`tcp`，非三值→`tcp`），防止导入路径绕过校验写入非法值
- **数据迁移**：将存量 `ps_stream_proxy.scheme` 非三值（历史 `tcp_udp`）归一位 `'tcp'`
- **Edge 文档同步**：使用手册 Stream 路由 `protocol` 枚举加 `"TLS"`、Stream 上游 `scheme` 枚举加 `tls`（Edge 现已支持 TLS）

## Capabilities

### New Capabilities
<!-- Capabilities being introduced. Replace <name> with kebab-case identifier (e.g., user-auth, data-export, api-rate-limiting). Each creates specs/<name>/spec.md -->
- 无（本变更不引入全新能力）

### Modified Capabilities
<!-- Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Only list here if spec-level behavior changes (not just implementation). Each needs a delta spec file.
     Use existing spec names from openspec/specs/. Leave empty if no requirement changes. -->
- `stream-proxy-management`: 协议从固定 TCP 扩展为 TCP/UDP/TLS 三选一（Radio 交互 + 协议说明提示）；菜单与列表页名称从"TCP 代理"改为"四层代理"
- `tcp-proxy-list`: 该 spec 定义的"TCP 代理独立列表视图"语义改为"四层代理视图"，页面标题与菜单名同步更新

## Impact

- **前端**：`frontend/src/components/AppSidebar.vue`（菜单项）、`frontend/src/views/StreamProxyList.vue`（标题/描述/按钮/schemeLabel）、`frontend/src/components/StreamProxyFormWizard.vue`（协议 Radio + 说明 + 代理类型切换按钮文案）、`frontend/src/composables/useStreamProxyList.ts`（pageTitle/itemLabel）、`frontend/src/views/DefaultLayout.vue`、`frontend/src/components/VersionManagementModal.vue`（"TCP 代理"标签）、`frontend/src/components/StreamProxyViewDrawer.vue`（schemeLabel 补 tls）、`frontend/src/views/DnsUdpProxyList.vue`（继承文案）、`frontend/src/types/index.ts`（scheme 字面量联合）
- **后端**：`backend/app/schemas/stream_proxy.py`（Create/Update 的 scheme 加 Literal 校验）、`backend/app/services/edge_import_service.py`（导入 scheme 归一化）、`backend/app/core/migrate.py`（存量数据迁移）
- **文档**：`docs/edge/user-guide/使用手册.md`（Stream protocol/scheme 枚举加 TLS）
- **测试**：`backend/tests/`（新增 3 个回归测试：422 拒绝非法 scheme、DB 含 tcp_udp 时读取正常、导入非法 scheme 后正常读取）、`frontend/src/composables/__tests__/useStreamProxyList.test.ts:23`（pageTitle 断言同步更新）
- **不影响**：数据库结构（scheme 列已存在）、Edge 发布协议字段（`scheme.upper()` 已支持 "TLS"）、DNS 代理（proxy_type='dns' 不受影响）
