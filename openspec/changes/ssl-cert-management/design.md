# Design

## Context

后端已具备全部能力：`SslCertificate` 模型的 `is_ca`/`ca_cert_id`、CA 生成端点、按需私钥端点（`GET /clusters/{id}/ssl/{cert_id}/key`，高风险 + 审计）、列表响应掩码 + `has_private_key`/`has_sign_key` 布尔。前端现状为单页 `/ssl`（`SslList.vue`，页内 Tab「全部证书/CA 根证书」）+ `SslCertDownloadDialog`（zip 内 cert.pem/key.pem，私钥默认勾选）。路由经 `featureRouteMap` 的 `ssl_cert` 键注册（已有同键多路由先例：`metrics`）。设计依据 `docs/design/ssl-cert-management-design.md`（用户已批准决策 1-6 按推荐项）与已评审 HTML 示例页。

## Goals / Non-Goals

**Goals:**
- 两页语义分离（CA 分发 vs 网关部署），下载产物用户可直接安装（`.crt`），私钥彻底退出下载链路
- 纯前端改造，后端零改动（含测试采样不变）

**Non-Goals:**
- 不改签发/发布/版本回滚逻辑与数据模型
- 不做证书到期自动轮换、重分发通知（后续独立立项）
- 不动「统一管理」「Edge 直连」内嵌的 SSL 展示（仅主导航两页）

## Decisions

1. **路由：`ssl_cert` 键挂数组三条目**（仿 `metrics` 先例）——`/ssl/ca`、`/ssl/server` 两个视图 + `/ssl` → redirect `/ssl/server`。redirect 放入同一 feature 数组内，保证禁用时旧路由同样不注册（直接 404，而非 redirect 到 404）。备选「redirect 常驻注册」被否：违反禁用语义。
2. **视图拆分 + 共享卡片组件**：`SslList.vue` 拆为 `views/CaCertList.vue`、`views/ServerCertList.vue`；证书卡片（顶栏/CN/SNI/算法/有效期/到期徽章/签发 CA 行/操作栏）抽为共享 `components/SslCertCard.vue`，两页复用（约定 #51 教训：防第二份内联实现漂移）。筛选行/加载/空态各自保留（文案语义不同）。备选「单视图 + query 参数」被否：横幅与菜单语义分叉，守卫成本更高。
3. **下载实现（无私钥收口在分发链路 UI 层）**：`utils/download.ts` 新增证书文件命名工具（`.crt` 后缀 + `application/x-x509-ca-cert` MIME），单文件直下复用 `downloadPem`；**`buildCertZip` 保持通用不收窄**（消费方查证：`SslCertDownloadDialog`、`SslViewDrawer` 客户端证书包、`SslGenerateDialog` 生成后交付、auth-session.test 守卫——后两者合法含私钥：mTLS 客户端证书本就随私钥交付用户、本地生成后随私钥交付运维）。无私钥约束落在**分发链路 UI 层**：CA 页下载与服务器证书下载弹窗不提供任何私钥选项/产物；`SslCertDownloadDialog` 重做：选项仅证书文件、固定警示块（失效 + 勿分发 + 「下载 CA 根证书」按钮）、私钥去向说明；删除组件内 `fetchSslPrivateKey` 调用。
4. **查看抽屉**：证书类下载（cert/sign_cert）后缀改 `.crt`；私钥类（key/sign_key）保持 `.pem` 与既有高风险确认 + 审计流程不动。`/key` 端点不动。
5. **签发 CA 行零后端方案**：`ServerCertList` 本就拉全量列表（含 CA），前端以 `ca_cert_id → name` 建映射渲染；无效引用显示「—」。备选「后端回填 ca_name」被否：违反零改动边界。
6. **CA 临期警示（E4）**：复用响应既有 `expire_days`，前端 ≤30 天渲染红色警示条与红色徽章；不改后端计算。
7. **CA 证书文件名全站统一** `{集群名}_{证书名称}.crt`：终端用户多集群场景下可辨识来源；**所有入口一致**（CA 页直下与查看抽屉的 CA 下载，抽屉内补一次集群名查找）；集群后改名不影响已下载文件（一次性产物）。
8. **客户端证书（cert_type=client）特例**：client 证书本就是「发给用户安装」的产物（含私钥，装用户侧做 mTLS），与新页面「请勿分发」文案语义冲突。处理：服务器证书页警示横幅仅针对服务器证书，并补一句「客户端证书请在该证书的查看抽屉中下载完整安装包」；client 卡片**不显示**「下载证书」按钮（引导抽屉既有「下载客户端证书包」bundle 通道），分发弹窗不对 client 类型提供入口。

## Risks / Trade-offs

- [旧测试/E2E 大范围引用 `/ssl` 与「SSL 证书」菜单项] → 全量 grep `/ssl`、`SslList`、`ssl_cert` 引用逐一改向；前端全量单测以 `npx vitest run --no-file-parallelism` 串行收口（约定 #208）
- [规格同步涉及 `sidebar-layout` 陈旧条目] → 本次仅重写该 change 触碰的「Sidebar navigation layout」需求并按代码现状如实描述，其余陈旧需求不扩散处理
- [示例页与真实实现像素偏差] → 验收以真实页面（用户实操）为准，示例页仅定语义与文案
- [下载弹窗删除私钥后个别运维场景不便] → 查看抽屉通道保留（高风险 + 审计），属有意收紧（用户拍板 #4）

## Migration Plan

纯前端 + 路由改造，无数据迁移、无后端部署依赖，单次发布即可；回滚 = revert 前端提交。旧 `/ssl` 链接经 redirect 自动兼容。

## Open Questions

无（决策 1-6 已由用户批准按推荐项执行；Chrome 安装指引已补入）。
