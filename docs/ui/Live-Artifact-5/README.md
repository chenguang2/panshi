# Live-Artifact-5 · 设计页（方案 C 定稿）

本目录是磐石 Gateway 前端**页面级设计稿的唯一基线**。基线 = `proposal-c/` 下的 24 张页面 HTML + 共享主题 `theme.css` + 卡片页解剖说明 `CARD-PAGES-DESIGN-BRIEF.md`；入口是根目录的 **`index.html`（设计页目录）**。

> 2026-11-21 收敛：旧方案 A/B、工具条三变体页与 proposal-c 内 10 份过程稿已删除，历史仍在 git 里。此后**变体对比稿验证完即删**，不留在基线目录。

## 页面清单

| 分组 | 页面 | 设计文件 | 形态 | 对应实现 |
|---|---|---|---|---|
| 核心 | 概览 | `proposal-c/overview.html` | 信息页 | `views/Dashboard.vue` |
| 核心 | 集群管理 | `proposal-c/clusters.html` | 卡片页（分组/平铺） | `views/ClusterList.vue` |
| 核心 | 统一管理 | `proposal-c/central.html` | 两态（卡片网格 ⇄ 最大化面板） | `views/CentralList.vue` |
| 列表 | 节点管理 | `proposal-c/nodes.html` | 列表页 | `views/NodeList.vue` |
| 列表 | 上游管理 | `proposal-c/upstreams.html` | 列表页 | `views/UpstreamList.vue` |
| 列表 | 路由管理 | `proposal-c/routes.html` | 列表页（分组/平铺） | `views/RouteList.vue` |
| 边缘网络 | edge.env 配置 | `proposal-c/edge-env.html` | 编辑页（YAML 编辑器 + 上限诊断） | `views/EdgeEnv.vue` |
| 运维 | Ansible 主机清单 | `proposal-c/ansible-inventory.html` | 编辑页（表格 / 源码双态） | `views/AnsibleInventory.vue` |
| 运维 | 工具箱 | `proposal-c/tools.html` | 工作台页（工具栏 + 双栏对转 / 输入即算 / 表单生成器） | `views/Tools.vue` |
| 运维 | 自启动管理 | `proposal-c/edge-autostart.html` | 列表页（nodes 同构：工具条 + 状态行 + 批量条 + grid-table + ListPager） | `views/EdgeAutostart.vue` |
| 监控 | ClickHouse 配置 | `proposal-c/clickhouse-config.html` | 配置管理页（健康卡四态 + 连接列表 + 弹窗） | `views/ClickHouseConfig.vue` |
| 系统 | 数据库管理 | `proposal-c/database-management.html` | 配置管理页（当前库 hero + 连接列表 + 备份/迁移摘要双卡 + 弹窗） | `views/DatabaseManagement.vue` |
| 运维 | Edge 直连 | `proposal-c/edge-client.html` | 调试工作台（连接条 + tab 条 + grid-table + 弹窗） | `views/EdgeClient.vue` |
| 运维 | Edge 数据导入 | `proposal-c/edge-import.html` | 向导页（3 步条 + 连接计数 chips + 可选卡 + section 列表） | `views/EdgeImport.vue` |
| 卡片 | 四层代理 | `proposal-c/stream-proxies.html` | 卡片页 | `views/StreamProxyList.vue` |
| 卡片 | DNS 代理（UDP） | `proposal-c/dns-udp-proxies.html` | 卡片页 | `views/DnsUdpProxyList.vue` |
| 卡片 | DNS 代理（HTTP） | `proposal-c/dns-http-proxies.html` | 卡片页 | `views/DnsQueryList.vue` |
| 卡片 | 插件组 | `proposal-c/plugin-groups.html` | 卡片页 | `views/PluginConfigList.vue` |
| 卡片 | 插件元数据 | `proposal-c/plugin-metadata.html` | 卡片页 | `views/PluginMetadataList.vue` |
| 卡片 | 插件开关 | `proposal-c/plugin-switches.html` | 卡片页 | `views/PluginSwitches.vue` |
| 卡片 | 全局规则 | `proposal-c/global-rules.html` | 卡片页 | `views/GlobalRuleList.vue` |
| 卡片 | 静态资源 | `proposal-c/static-resources.html` | 卡片页 | `views/StaticResourceList.vue` |
| 证书 | CA 根证书 | `proposal-c/ca-certs.html` | 卡片页 | `views/CaCertList.vue` |
| 证书 | 服务器证书 | `proposal-c/server-certs.html` | 卡片页 | `views/ServerCertList.vue` |

共享资产：

- `proposal-c/theme.css` —— 全站设计 token 与共享解剖类（`.l5-*` / `.lp-*` / `.ph-lite` / `.ps-tag` / `.dtabs` …）。改设计语言只改这一处。
- `proposal-c/CARD-PAGES-DESIGN-BRIEF.md` —— 卡片页结构约定（分组带 / 卡片解剖 / 批量条 / JSON 折叠等）。

## 维护约定

1. **一页一份**：设计页只放「当前定稿」。需要方案对比时新建临时演示页，结论落地后删除（`routes-v1/v3/l2/sort-demo`、`nodes-group-toggle-demo`、`filter-architecture-demo`、`list-flat-cluster-demo`、`publish-diff-button-demo`、`republish-failed-nodes-demo` 即此前的过程稿，已删）。
2. **设计页 ↔ 实现一一对应**（AGENTS #90 / #298）：实现新增界面元素要回填设计页；设计页有、而实现已把入口放到正文/横幅/独立页的，先裁决（回填实现 或 删设计页条目），不允许两侧长期并存。
3. **改完要跑**：`frontend/src/views/__tests__/pageHeaderActions.source.test.ts`（页头动作区与设计页按钮集一致性）+ `mockupParity.source.test.ts`，并按 1600×1000 视口做真机对照（方法见 AGENTS #82）。
4. **新增页面**：复制**同形态最接近**的设计页起步（列表页抄 nodes/upstreams/routes，卡片页抄 stream-proxies，两态抄 central），不要从历史方案或已删除的过程稿复制。
5. **命名**：一页一个 kebab-case 文件名，与路由/资源同名（`nodes.html` / `plugin-groups.html` / `ca-certs.html`），`demo`/`v2`/`variant` 一律不许出现在基线目录。
6. **空态统一用 `components/EmptyState.vue`**：解剖 = 设计原语 `.empty5`（52px 虚线圆图标 + 13px/600 标题 + 12px muted 说明 + 主动作，见 `theme.css:2345-2349`）。设计页**暂不画空态**（各页展示为有数据态），新增页面直接引组件，不要再手写居中灰字或页面私有 `.empty-hint`。

## 历史

- `docs/ui/Live-Artifact-4/`：上一代设计（表格与导航语言来源）。
- 2026-11-16：`Live-Artifact-5` 立项，A/B/C 三方案对比；用户选定 **方案 C（网关控制台感）** 并逐步扩展到卡片页、证书页、概览与统一管理。
- 2026-11-21：收敛为单一基线（本文件与 `index.html`），删除 A/B 方案、工具条变体页与 10 份过程稿。
