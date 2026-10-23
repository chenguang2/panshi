# Spec Delta

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

系统 SHALL 将 SSL 证书管理拆分为「CA 根证书」（`/ssl/ca`）与「服务器证书」（`/ssl/server`）两个独立页面，均以卡片网格形式展示，由侧边栏「证书管理」分组（位于「核心功能」之后）下的两个菜单项分别进入；旧 `/ssl` 路由 SHALL 重定向到 `/ssl/server`。两页面 SHALL 受 `ssl_cert` 部署特性控制：禁用时前端路由与侧边栏菜单 SHALL NOT 注册/显示，直接访问 SHALL 返回 404。服务器证书页 SHALL 常驻警示横幅，明确「请勿将服务器证书分发给终端用户、用户系统应安装 CA 根证书、证书更新后已下载副本即失效」并提供跳转 CA 根证书页的快捷操作。证书卡片 SHALL 展示到期信息并对临期/已过期证书给出预警徽章；服务器证书卡片状态 SHALL 呈现「未发布 / 配置已修改待发布 / 已发布」三态（SSL 域不接 partial 态）；卡片技术字段（证书类型/协议/SNI）SHALL 以中文可读形态渲染；服务器证书卡片 SHALL 展示「签发 CA」行并可跳转。两个 SSL 列表端点（统一管理、集群内）与详情端点 SHALL 经 `_build_publish_map` 从 ConfigVersion 回查每个证书最近一次成功发布时间并回填 `published_at`（可选字段），同步状态标签据此判定；回查失败 SHALL 按「无发布记录」降级，MUST NOT 阻断列表。`pending_publish` SHALL 经 `edge_sync.derive_pending_publish` 单点推导，MUST NOT 在前端按时间戳自行实现。

#### Scenario: 页面入口
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true`
- **AND** 用户点击侧边栏「证书管理」分组下的「服务器证书」菜单项
- **THEN** 导航到 `/ssl/server` 路由
- **AND** 页面显示 `PageHeader`，标题为「服务器证书」
- **WHEN** 用户点击「CA 根证书」菜单项
- **THEN** 导航到 `/ssl/ca` 路由（页面行为见 `ca-root-certificate-distribution` 能力）

#### Scenario: 旧路由重定向
- **WHEN** `ssl_cert` 启用且用户访问旧路由 `/ssl`
- **THEN** SHALL 重定向到 `/ssl/server`（兼容旧链接与收藏）

#### Scenario: 功能禁用时隐藏
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** 侧边栏「证书管理」分组及其两项菜单 SHALL NOT 显示
- **AND** `/ssl/ca`、`/ssl/server` 路由 SHALL NOT 注册，直接访问 SHALL 显示 404
- **AND** 旧路由 `/ssl` SHALL NOT 注册，直接访问 SHALL 显示 404

#### Scenario: 服务器证书页警示横幅
- **WHEN** 用户进入服务器证书页面
- **THEN** 页面顶部 SHALL 常驻警示横幅，说明：请勿将服务器证书分发给终端用户（它不是信任锚点，装入用户系统会显示「不安全」）；用户系统应安装 CA 根证书；证书更新或重新生成后已下载副本即失效
- **AND** 横幅 SHALL 提供「前往 CA 根证书下载」快捷操作，点击导航到 `/ssl/ca`
- **AND** 横幅 SHALL 补充说明：客户端证书（cert_type=client）请在该证书的「查看」抽屉中下载完整安装包（客户端证书本就随私钥交付用户安装，不受此警示约束）

#### Scenario: 客户端证书下载引导
- **WHEN** 证书类型为 `client`
- **THEN** 卡片 SHALL NOT 显示「下载证书」按钮（分发弹窗不适用客户端证书）
- **AND** 卡片 SHALL 保留「查看」入口（查看抽屉内提供既有「下载客户端证书包」通道，含私钥，随客户端证书交付用户）

#### Scenario: 服务器证书卡片签发 CA 行
- **WHEN** 服务器证书卡片渲染且该证书 `ca_cert_id` 指向有效的 CA 根证书
- **THEN** 卡片 SHALL 显示「签发 CA」行，值为该 CA 的名称
- **AND** 点击该值 SHALL 导航到 `/ssl/ca`
- **WHEN** 该证书非本平台 CA 签发（`ca_cert_id` 为空或指向已删除记录）
- **THEN** 「签发 CA」行 SHALL 显示「—」且不可点击

#### Scenario: 证书卡片展示到期徽章

- **WHEN** 证书卡片渲染且证书含有效期信息
- **THEN** 有效期 SHALL 以仅日期形态显示（不含时分）
- **AND** 卡片 SHALL 显示到期徽章「剩余 N 天」
- **AND** 剩余天数 < 0 时 SHALL 显示「已过期 N 天」预警
- **AND** 剩余天数 ≤ 30 时 SHALL 显示临期预警
- **AND** 其余情况 SHALL 正常显示剩余天数
- **AND** 有效期解析失败（`expire_at` 为空，如国密双证）SHALL 降级显示「—（无法解析）」，SHALL NOT 整行隐藏造成「未到期」误读

#### Scenario: 列表响应携带到期计算字段

- **WHEN** 前端请求 SSL 证书列表
- **THEN** 后端响应 SHALL 包含证书到期时间与剩余天数计算字段（守卫测试 `backend/tests/test_ssl_expiry.py`）
- **AND** 响应 SHALL 包含 `pending_publish` 布尔字段（经 `derive_pending_publish` 推导）

#### Scenario: 列表回填最近发布时间

- **WHEN** 前端请求 SSL 证书列表（统一管理或集群内）且某证书曾成功发布
- **THEN** 该证书 SHALL 携带自 ConfigVersion 回查的最近发布时间（`published_at`）
- **AND** 同步状态标签 SHALL 据此显示「已同步」，SHALL NOT 因刷新/重进而恒显「未同步」
- **AND** 无发布记录的证书保持「未同步」语义；发布时间回查失败时按无发布记录降级

#### Scenario: 待发布状态呈现

- **WHEN** 某证书 `current_version` 非空且在最近一次发布后又被编辑（`derive_pending_publish` 为 true）
- **THEN** 卡片状态标签 SHALL 显示「配置已修改，发布后生效」
- **AND** 卡片 SHALL NOT 同时渲染独立的「已发布」徽章与状态标签（双徽章冗余去除）
- **WHEN** 用户编辑已发布证书并保存
- **THEN** 保存提示 SHALL 说明平台侧语义（「已更新（平台侧），重新发布后 Edge 生效」）

#### Scenario: 卡片技术字段中文化

- **WHEN** 证书卡片或查看抽屉渲染
- **THEN** 证书类型 SHALL 显示中文（`server`→服务端、`client`→客户端，共享映射工具）
- **AND** SSL 协议 SHALL 以分隔形态显示（如 `TLSv1.2 / TLSv1.3`），SHALL NOT 直接渲染 JSON 数组原值

#### Scenario: CA 根证书卡片字段

- **WHEN** CA 根证书卡片渲染
- **THEN** SHALL 隐藏「SNI」「证书类型」行，显示「CN」行（CA 的 `sni` 字段存储 CN，直译为 SNI 语义错位）

#### Scenario: 空态与清除筛选

- **WHEN** 服务器证书页搜索/分组/集群筛选任一激活且结果为空
- **THEN** 空态 SHALL 显示「未找到匹配的证书」并提供「清除筛选」操作（点击重置全部筛选）
- **WHEN** 服务器证书页无筛选激活且列表为空
- **THEN** 空态显示「暂无服务器证书」
- **WHEN** CA 根证书页无 CA 且无筛选激活
- **THEN** 空态显示「暂无 CA 根证书」并提供「创建 CA 根证书」引导

#### Scenario: 客户端证书动作收敛

- **WHEN** 证书类型为 `client`（不参与发布与版本管理）
- **THEN** 卡片 SHALL 隐藏「版本管理」入口

### Requirement: 生成国密证书对话框

系统 SHALL 在 SSL 证书生成对话框中增加 mTLS 配置。mTLS 区域与"同时生成客户端证书"复选框解耦，仅由算法（SM2）和证书类型（server）决定是否显示。CA 选择的提示与校验 SHALL 一致：未选集群显示中性提示，未选 CA 时生成按钮统一禁用。对话框内引导创建 CA 成功后 SHALL 原地返回并刷新 CA 列表（两页拆分后不再切换页签）。

#### Scenario: 国密 server 证书显示 mTLS 区域
- **WHEN** 用户打开生成国密证书对话框
- **AND** 证书类型为 server
- **THEN** 对话框 SHALL 显示可折叠的"双向认证 (mTLS)"区域
- **AND** 信息架构重排后该区域默认折叠、展开可达（显示条件不变）

#### Scenario: 勾选客户端证书时自动填充 CA
- **WHEN** 用户勾选"同时生成客户端证书"
- **AND** `client_ca` 当前为空
- **THEN** 自动将所选 CA 证书 PEM 填入 `client_ca`

#### Scenario: 未勾选也可手动配置
- **WHEN** 用户未勾选"同时生成客户端证书"
- **THEN** 仍可展开 mTLS 区域手动填写 `client_ca`、`client_depth`、`skip_mtls_uri_regex`（`skip_mtls_uri_regex` 为列表输入，每行一条正则，通过"添加"和"删除"按钮管理）

#### Scenario: 未选集群时 CA 区域中性提示
- **WHEN** 用户打开生成对话框且尚未选择集群
- **THEN** CA 下拉区域 SHALL 显示灰色提示「请先选择集群，将列出该集群可用的 CA 根证书」
- **AND** SHALL NOT 显示红色错误（「该集群没有 CA 根证书」为已选集群且确实无 CA 时的专属语义）

#### Scenario: CA 列表加载失败
- **WHEN** 生成对话框加载所选集群的 CA 列表失败（网络/服务错误）
- **THEN** CA 区域 SHALL 显示「CA 根证书列表加载失败」并提供重试操作
- **AND** SHALL NOT 显示「该集群没有 CA 根证书」红字（加载失败不是空列表）

#### Scenario: CA 必选校验全算法一致
- **WHEN** 用户未选择签发 CA（任意证书算法）
- **THEN** 「生成并保存」按钮 SHALL 禁用并带指引提示
- **AND** SHALL NOT 出现「按钮可点击、点击后才提示」的不一致行为（后端对所有算法均要求 CA）

#### Scenario: 已选集群但无可用 CA
- **WHEN** 用户已选择集群且该集群没有任何 CA 根证书
- **THEN** CA 区域 SHALL 显示红色提示指引创建 CA
- **AND** 提示文案 SHALL NOT 包含 API 路径等技术细节

#### Scenario: 对话框内创建 CA 后返回
- **WHEN** 用户经生成对话框的「创建 CA」引导完成 CA 创建
- **THEN** 页面 SHALL 停留在服务器证书页（SHALL NOT 导航到 CA 根证书页）
- **AND** 生成对话框 SHALL 保持打开状态
- **AND** 对话框内 CA 下拉 SHALL 自动刷新并包含新建的 CA

### Requirement: 上传 SSL 证书（增加生成入口）

系统 SHALL 支持上传新的 SSL 证书或通过生成方式创建证书，数据存到 DB。上传/编辑表单中增加 mTLS 双向认证配置区域。表单 SHALL 对文件选择提供即时反馈，SNI 标签输入 SHALL 与生成对话框行为一致（支持逗号/粘贴拆分），提交失败的错误提示 SHALL 可读。上传与生成入口 SHALL 位于服务器证书页。

#### Scenario: 打开上传表单（新增 mTLS 配置）
- **WHEN** 用户点击"添加已有证书"按钮
- **AND** 证书类型为 `"server"`
- **THEN** 弹出表单，包含现有字段及新增的可折叠"双向认证 (mTLS)"配置区域
- **AND** mTLS 区域包含以下字段：
  - `client_ca`：CA 证书内容（Textarea，PEM 格式粘贴，可选）
  - `client_depth`：证书链校验深度（数字输入，默认 1，可选）
  - `skip_mtls_uri_regex`：跳过 mTLS 的 URI 正则列表（独立输入框 + "添加"按钮，每行一条，右侧删除按钮，可选）
- **AND** 非 server 类型证书隐藏 mTLS 区域

#### Scenario: 客户端证书类型隐藏 mTLS
- **WHEN** 用户点击"添加已有证书"按钮
- **AND** 证书类型选择为 `"client"`
- **THEN** mTLS 配置区域 SHALL 隐藏
- **AND** 切换回 `"server"` 时 SHALL 重新显示

#### Scenario: 非国密隐藏 mTLS
- **WHEN** 用户打开上传表单
- **AND** 未勾选"国密双证书"（`gm=false`）
- **THEN** mTLS 配置区域 SHALL 隐藏

#### Scenario: 取消国密时清空 mTLS
- **WHEN** 用户编辑一个 `gm=true` 的证书，取消勾选"国密双证书"
- **THEN** 提交保存后后端 SHALL 将 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 清空为 null

#### Scenario: 编辑时回填 mTLS 数据
- **WHEN** 用户编辑已有 SSL 证书
- **AND** 该证书的 `client_ca` 不为空
- **THEN** mTLS 区域展开后 SHALL 回填 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 的值

#### Scenario: 保存证书
- **WHEN** 用户填写表单并点击"保存"
- **THEN** 系统 SHALL 自动生成 `edge_uuid`（UUID）作为 Edge 标识
- **AND** 写入 DB（`ps_ssl_certificate` 表）
- **AND** 成功后关闭表单并刷新列表

#### Scenario: 创建校验
- **WHEN** 用户提交创建 SSL 证书表单且 `cert` 或 `private_key` 为空
- **THEN** 系统 SHALL 返回 422 校验错误
- **AND** 前端 SHALL 提示相应字段必填

#### Scenario: 上传文件即时反馈
- **WHEN** 用户通过文件选择导入证书或私钥
- **THEN** 表单 SHALL 显示「已读取 {文件名}」反馈
- **AND** 用户 SHALL 可切换到粘贴模式查看/校对已读入内容
- **AND** SHALL NOT 出现选择文件后无任何可见变化的情况

#### Scenario: SNI 标签支持粘贴拆分
- **WHEN** 用户在 SNI 标签输入框粘贴或输入含逗号分隔的多个域名（如 `a.com,b.com`）
- **THEN** SHALL 拆分为多个独立标签（与生成对话框 `splitSniTags` 行为一致）
- **AND** 输入提示 SHALL 说明「Enter 或逗号添加，支持粘贴多个」

#### Scenario: 保存失败错误可读
- **WHEN** 保存证书请求失败且响应 `detail` 为校验错误数组（FastAPI 422 形态）
- **THEN** 前端 SHALL 将数组逐条拼接为可读文案（「保存失败：{原因}」）
- **AND** SHALL NOT 显示数组原值或裸「操作失败」

#### Scenario: 操作入口
- **WHEN** 用户查看服务器证书页面
- **THEN** 页面顶部操作栏 SHALL 显示以下按钮：
  - "添加已有证书"按钮：打开现有上传表单（SslFormDrawer）
  - "生成证书"按钮：打开证书生成对话框（SslGenerateDialog）
- **AND** 两个按钮风格一致，主次分明
- **AND** 当前集群筛选非空时打开任一弹窗，集群下拉 SHALL 预选该集群
- **AND** CA 根证书页 SHALL NOT 提供服务器证书的上传/生成入口（避免产物落在错误的页面语义中）

#### Scenario: 生成国密证书对话框
- **WHEN** 用户点击"生成证书"按钮
- **THEN** 弹出 `SslGenerateDialog` 模态对话框
- **AND** 对话框包含以下区域：
  - **生成方式选择**：本地生成 / 远程生成（Radio）
  - **集群/节点选择**：所属集群下拉框；远程时额外显示执行节点下拉框
  - **证书参数**：证书名称（必填）、通用名称 CN（必填）
  - **SAN 输入**：域名 SAN（Tag 输入，支持多个） + IP SAN（Tag 输入，支持多个）
  - **其他**：有效期（默认 365 天）、双证书模式开关（默认开启）、证书类型（server/client）
- **AND** 包含"取消"和"生成并保存"按钮

#### Scenario: 生成中状态
- **WHEN** 用户确认生成
- **THEN** 对话框切换为进度提示状态
- **AND** 显示步骤进度：检测环境 → 生成密钥对 → 生成 CSR → 签发证书 → 保存记录
- **AND** 按钮禁用，防止重复提交

#### Scenario: 生成成功
- **WHEN** 证书生成并保存成功
- **THEN** 对话框自动关闭
- **AND** 服务器证书列表自动刷新
- **AND** 新证书卡片出现在服务器证书页列表中，带有"国密生成"标记（生成入口仅在服务器证书页，生成成功后 SHALL 停留在服务器证书页）

#### Scenario: 生成失败
- **WHEN** 证书生成过程中发生错误（本地 openssl 不可用、SSH 连接失败、节点不支持 SM2 等）
- **THEN** 对话框显示具体错误信息
- **AND** 提供"关闭"按钮，不自动关闭
- **AND** 不创建任何 SSL 证书记录

### Requirement: 私钥按需获取与掩码

系统 SHALL 对 SSL 证书私钥（含国密签名私钥 `sign_key`）实施统一保护：列表与详情响应 SHALL 掩码全部私钥字段并携带有无布尔字段，私钥获取 SHALL 走单一按需端点（全证书类型生效，替代 `/ca-key`）并留审计痕，编辑表单 SHALL NOT 回填明文私钥且「留空」SHALL 表示不修改。**分发链路**（CA 根证书下载、服务器证书下载弹窗）SHALL 彻底不含私钥；**管理链路**（生成成功后的证书交付包、查看抽屉「下载客户端证书包」）SHALL 保留既有含私钥打包（mTLS 客户端证书本就随私钥交付用户、本地生成后随私钥交付运维）；私钥入口 SHALL 仅保留「查看」抽屉的高风险通道。

#### Scenario: 列表与详情响应掩码
- **WHEN** 前端请求 SSL 证书列表或详情
- **THEN** 响应中 `private_key` 与 `sign_key` SHALL 均为空串（含 server/client 证书，不再仅掩 CA；`sign_key` 为国密签名私钥，敏感性等同）
- **AND** 响应 SHALL 携带 `has_private_key`/`has_sign_key` 布尔字段（服务端真实有无）
- **AND** 私钥 MUST NOT 随列表接口全量下发

#### Scenario: 私钥有无判定不依赖字段内容
- **WHEN** 查看抽屉决定是否展示私钥显示/下载操作
- **THEN** SHALL 依据 `has_private_key`/`has_sign_key` 布尔判定
- **AND** MUST NOT 依据掩码后恒空的字段内容真值判定（否则私钥操作静默消失）

#### Scenario: 按需获取私钥
- **WHEN** 用户在查看抽屉显示或下载私钥
- **THEN** 前端 SHALL 经高风险确认弹窗后调用单一按需端点 `GET /clusters/{id}/ssl/{cert_id}/key`
- **AND** 该端点 SHALL 对全部证书类型生效（含 CA 根证书），国密证书 SHALL 返回加密与签名两个私钥
- **AND** 该端点 SHALL 记录操作审计（查看/下载私钥）
- **AND** 高风险确认弹窗 SHALL 说明：CA 私钥绝不可分发给终端用户（私钥仅用于签发证书）
- **AND** 既有 `/ca-key` 端点 SHALL 保持删除状态（不做双实现）

#### Scenario: 分发链路无私钥
- **WHEN** 用户打开服务器证书下载弹窗、或在 CA 根证书页下载证书
- **THEN** 界面 SHALL NOT 提供任何私钥选项或私钥文件产物
- **AND** 弹窗 SHALL 说明：私钥仅用于平台发布部署，如需查看请在「查看」抽屉中操作（高风险、将被审计）
- **WHEN** 用户使用管理链路（生成成功后的交付包、查看抽屉「下载客户端证书包」）
- **THEN** 既有含私钥打包行为 SHALL 保持不变（属合法交付场景，不视为分发泄露）

#### Scenario: 编辑不回填明文私钥
- **WHEN** 用户编辑已有证书
- **THEN** 私钥输入区 SHALL 显示占位「已保存，留空表示不修改」且不回填明文
- **AND** 提交时私钥留空（未提供、None 或空串）SHALL 表示不修改原私钥（前端省略空值 + 后端仅对 `private_key` 跳过，不影响其它字段的清空语义）
- **AND** 编辑不碰私钥保存后，库中私钥 SHALL 与修改前逐字节一致
