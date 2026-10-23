## Purpose

CA 根证书分发管理：平台明确「发给用户的永远是 CA 根证书」的分发语义——CA 根证书页提供绿色分发横幅、单文件 .crt 直下（不含任何私钥）、跨平台用户安装指引（Windows/macOS/Chrome/Linux，不含 Firefox）、临期警示与删除引用软提示，确保终端用户安装正确的信任根。

# Spec Delta

## Purpose

CA 根证书分发能力：将 CA 根证书从服务器证书中语义分离，明确「CA 根证书是发给最终用户安装信任的唯一正确选择」，提供用户可直接安装的 `.crt` 单文件下载、安装指引与 CA 临期重分发警示。

## Requirements
### Requirement: CA 根证书页面

系统 SHALL 提供独立的 CA 根证书管理页面（`/ssl/ca`），由侧边栏「证书管理」分组下的「CA 根证书」菜单项进入。该页面 SHALL 受 `ssl_cert` 部署特性与权限门控（与服务器证书页同键）。页面 SHALL 常驻展示分发指引横幅，明确 CA 根证书可以放心分发给最终用户（不含私钥、是终端显示「安全」的正确选择），并与服务器证书划清界限。

#### Scenario: 页面入口
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true` 且用户持有 `ssl_cert` 权限
- **AND** 用户点击侧边栏「证书管理 → CA 根证书」菜单项
- **THEN** 导航到 `/ssl/ca` 路由
- **AND** 页面显示 `PageHeader`，标题为「CA 根证书」

#### Scenario: 功能禁用时隐藏
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** 侧边栏「证书管理」分组及其两项菜单 SHALL NOT 显示
- **AND** `/ssl/ca`、`/ssl/server` 路由 SHALL NOT 注册，直接访问 SHALL 显示 404

#### Scenario: 分发指引横幅
- **WHEN** 用户进入 CA 根证书页面
- **THEN** 页面顶部 SHALL 常驻信息横幅，说明：CA 根证书可放心下载分发给用户（单文件 `.crt`、不含私钥）；终端系统安装 CA 根证书后即可信任平台签发的全部服务器证书
- **AND** 横幅 SHALL 提示服务器证书不应分发给用户

#### Scenario: CA 列表与卡片
- **WHEN** CA 根证书页面加载
- **THEN** SHALL 以卡片网格展示全部集群的 CA 根证书（`is_ca=true`），支持搜索/分组/集群筛选（与服务器证书页同款筛选行）
- **AND** CA 卡片 SHALL 展示 CN、算法、有效期与到期徽章（复用既有到期徽章语义）
- **AND** CA 卡片 SHALL NOT 显示「SNI」「证书类型」行

### Requirement: CA 根证书单文件下载

系统 SHALL 在 CA 卡片操作栏提供「下载根证书 (.crt)」主操作，将 CA 证书以单文件 `.crt`（PEM 内容）直接下载。下载产物 SHALL 永不包含私钥，SHALL NOT 打包 zip。

#### Scenario: 单文件直下
- **WHEN** 用户点击 CA 卡片上的「下载根证书 (.crt)」
- **THEN** 浏览器 SHALL 直接下载单个文件（不经 zip 打包、不弹出文件选择对话框）
- **AND** 文件名格式为 `{集群名}_{证书名称}.crt`，内容为 CA 证书 PEM

#### Scenario: 双击可安装
- **WHEN** 用户在 Windows/macOS 上双击下载的 `.crt` 文件
- **THEN** 操作系统 SHALL 识别其为证书文件并打开安装/钥匙串流程（PEM 内容 + `.crt` 后缀）

#### Scenario: 下载成功提示
- **WHEN** CA 根证书下载成功
- **THEN** 提示 SHALL 说明：可直接分发给用户安装（单文件、不含私钥）

#### Scenario: 私钥不入分发链路
- **WHEN** 用户浏览 CA 根证书页面的列表与卡片操作
- **THEN** SHALL NOT 出现任何私钥下载入口（CA 私钥仅可在「查看」抽屉经高风险确认获取）

#### Scenario: 下载文件名全站一致
- **WHEN** 用户从任一入口下载同一 CA 根证书（CA 页直下、查看抽屉内 CA 证书下载）
- **THEN** 文件名 SHALL 一致为 `{集群名}_{证书名称}.crt`（集群名取 `display_name`，为空时回退 `name`、再回退 `cluster_id`）

#### Scenario: 删除 CA 引用软提示
- **WHEN** 用户点击 CA 卡片「删除」且该集群存在 `ca_cert_id` 指向此 CA 的服务器证书
- **THEN** 删除确认 SHALL 显示「仍被 N 张服务器证书引用」提示（N 为引用计数）
- **AND** 提示 SHALL 说明后果：已发布证书在 Edge 上不受影响，但无法再向新用户分发该根证书
- **AND** 该提示为软提示，SHALL NOT 阻断删除

### Requirement: 用户安装指引

CA 根证书页面 SHALL 内置可折叠的「用户安装指引」，覆盖 Windows、macOS、Chrome（浏览器内安装）、Linux (Debian/Ubuntu) 四类环境，步骤 SHALL 达到「发给用户即可照做」的粒度。

#### Scenario: 指引展开
- **WHEN** 用户在 CA 根证书页面展开「用户安装指引」
- **THEN** SHALL 显示 Windows（双击 .crt → 安装证书 → 本地计算机 → 受信任的根证书颁发机构）、macOS（钥匙串访问 → 始终信任）、Chrome（设置 → 隐私与安全 → 安全 → 管理证书 → 「证书颁发机构」导入 .crt 并勾选「信任此 CA 标识网站」；Windows 下引导至系统导入向导，Linux 下导入 Chrome 自身证书库）、Linux（复制到 /usr/local/share/ca-certificates/ 并 update-ca-certificates）四段步骤
- **AND** SHALL NOT 包含 Firefox 段（已移除）

#### Scenario: 指引入口
- **WHEN** 用户查看分发指引横幅
- **THEN** 横幅 SHALL 提供「查看安装指引」操作，点击后展开指引面板并滚动定位

### Requirement: CA 临期警示

CA 根证书临期（剩余 ≤30 天）或已过期时，系统 SHALL 在其卡片上呈现红色警示条，说明 CA 过期将导致所有已安装该证书的终端重新显示「不安全」，并提示尽快更换 CA 并重新分发。

#### Scenario: 临期红色警示
- **WHEN** 某 CA 根证书剩余有效期 ≤30 天或已过期
- **THEN** 该卡片 SHALL 顶部展示红色警示条与红色到期徽章（区别于普通证书的临期徽章强度）
- **AND** 警示条 SHALL 说明后果（已装终端全部失效）并提示更换 CA 后重新分发
