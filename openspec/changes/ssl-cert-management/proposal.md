# Proposal: 证书管理分组重构（SSL 证书 → 证书管理）

## Why

运维经常把「服务器证书」直接发给内部系统用户安装，导致两类事故：终端显示「不安全」（服务器证书不是信任锚点，用户真正需要的是签发它的 CA 根证书），以及私钥随下载扩散（当前下载弹窗私钥默认勾选）。根因是 CA 根证书与服务器证书混在 `/ssl` 一个页面、下载产物为 `.pem` 后缀（Windows 双击无法安装）且不区分「给用户的」和「给网关的」。

## What Changes

- 侧边栏新增顶级分组「证书管理」（位于「核心功能」之后），下设「CA 根证书」（`/ssl/ca`）与「服务器证书」（`/ssl/server`）两个子菜单；旧 `/ssl` 重定向到 `/ssl/server`
- 原 `SslList.vue` 页内 Tab（全部证书/CA 根证书）拆分为两个独立视图页，语义分离：
  - **CA 根证书页**：常驻绿色横幅「可放心下载分发给用户」；卡片主操作 = 单文件直下 `.crt`（PEM 内容，无 zip、无私钥）；内置用户安装指引（Windows/macOS/Chrome/Linux，Chrome 段介绍浏览器内导入安装）；CA 临期（≤30 天）红色警示条；删除 CA 时提示「仍被 N 张服务器证书引用」（软提示不阻断）
  - **服务器证书页**：常驻琥珀色警示横幅「请勿分发给终端用户，需安装 CA 根证书，证书更新后已下载副本即失效」，一键跳转 CA 页；卡片新增「签发 CA」行（可点击跳转）
- 下载**分发链路**彻底不含私钥：下载弹窗不再提供 key 选项；单证书直下 `{名称}.crt`，国密双证书打 zip（内含加密/签名两个 `.crt`，无私钥）；客户端证书（cert_type=client）卡片不提供该弹窗入口，引导至查看抽屉既有「下载客户端证书包」通道（mTLS 客户端证书本就随私钥交付用户）；管理链路保留（生成后交付、查看抽屉 bundle）；查看抽屉内证书文件下载后缀同步改 `.crt`；私钥获取仅保留「查看」抽屉既有高风险确认通道（`/key` 按需端点 + 审计，后端零改动）
- 下载弹窗固定「当前版本副本、更新即失效」警告 + 「下载 CA 根证书」快捷按钮；下载成功 toast 追加重新分发提示

## Capabilities

### New Capabilities

- `ca-root-certificate-distribution`: CA 根证书分发能力——CA 页面的分发语义（可安全分发给用户）、`.crt` 单文件直下（无私钥）、用户安装指引、CA 临期警示与重分发提示

### Modified Capabilities

- `ssl-certificate-management`: 列表页拆分为「CA 根证书 / 服务器证书」两个页面（路由 `/ssl/ca`、`/ssl/server`，`/ssl` redirect），侧边栏入口从「核心功能」迁至「证书管理」分组；服务器证书页新增警示横幅与「签发 CA」行
- `card-certificate-download`: 下载弹窗重做——移除全部私钥选项、证书文件改 `.crt` 后缀（国密 zip 内同理）、新增失效警示与「下载 CA 根证书」快捷按钮、单证书改单文件直下
- `certificate-download`: 查看抽屉中证书文件下载后缀 `.pem` → `.crt`（私钥文件保持 `.pem`，仅查看抽屉高风险通道）
- `sidebar-layout`: 侧边栏新增「证书管理」分组（CA 根证书 / 服务器证书两项，`ssl_cert` feature/permission 门控），同步导航结构现状

## Impact

- **前端（改动主体）**：`frontend/src/router/index.ts`（`ssl_cert` 键拆双路由 + redirect）、`components/AppSidebar.vue`（分组调整）、`views/SslList.vue` 拆分为 `views/CaCertList.vue` + `views/ServerCertList.vue`、`components/SslCertDownloadDialog.vue` 重做、`components/SslViewDrawer.vue`（下载后缀）、`utils/download.ts`（`.crt` 命名/MIME）
- **后端：零改动**（`is_ca`/`ca_cert_id`/`/key` 端点均现成；无新增路由，`tests/test_security_guard.py` 采样不变）
- **测试**：`AppSidebar.test.ts`、`router/__tests__/index.test.ts`、SslList 相关组件测试与 E2E spec 随路由/菜单调整；新增下载弹窗「无私钥 + .crt + 失效提示」断言
- **设计依据**：`docs/design/ssl-cert-management-design.md`（用户已批准决策 1-6 按推荐项）+ HTML 示例页（已评审）
