## Purpose

SSL 证书的独立管理功能，包括证书的上传、列表展示、编辑、删除、发布到 Edge 节点、版本历史管理。
## Requirements
### Requirement: SSL 证书列表展示

系统 SHALL 提供一个独立 SSL 证书管理页面（`/ssl`），以卡片网格形式展示所有集群的 SSL 证书。该页面 SHALL 受 `ssl_cert` 部署特性控制：当 `ssl_cert` 禁用时，前端路由和侧边栏菜单 SHALL NOT 注册/显示，API 端点 SHALL 返回 404。证书卡片 SHALL 展示到期信息并对临期/已过期证书给出预警徽章；卡片状态 SHALL 呈现「未发布 / 配置已修改待发布 / 已发布」三态（SSL 域不接 partial 态）；卡片技术字段（证书类型/协议/SNI）SHALL 以中文可读形态渲染。两个 SSL 列表端点（统一管理、集群内）与详情端点 SHALL 经 `_build_publish_map` 从 ConfigVersion 回查每个证书最近一次成功发布时间并回填 `published_at`（可选字段），同步状态标签据此判定；回查失败 SHALL 按「无发布记录」降级，MUST NOT 阻断列表。`pending_publish` SHALL 经 `edge_sync.derive_pending_publish` 单点推导，MUST NOT 在前端按时间戳自行实现。

#### Scenario: 页面入口
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `true`
- **AND** 用户点击侧边栏"SSL 证书"菜单项
- **THEN** 导航到 `/ssl` 路由
- **AND** 页面显示 `PageHeader`，标题为"SSL 证书"

#### Scenario: 功能禁用时隐藏
- **WHEN** `features.yaml` 中 `ssl_cert` 为 `false`
- **THEN** 侧边栏"SSL 证书"菜单项 SHALL NOT 显示
- **AND** `/ssl` 路由 SHALL NOT 注册
- **AND** 用户直接访问 `/ssl` SHALL 显示 404

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

- **WHEN** 搜索/分组/集群筛选任一激活且结果为空
- **THEN** 空态 SHALL 显示「未找到匹配的证书」并提供「清除筛选」操作（点击重置全部筛选）
- **WHEN** 无筛选激活且列表为空
- **THEN** 空态保持「暂无 SSL 证书」

#### Scenario: 客户端证书动作收敛

- **WHEN** 证书类型为 `client`（不参与发布与版本管理）
- **THEN** 卡片 SHALL 隐藏「版本管理」入口

### Requirement: 上传 SSL 证书（增加生成入口）

系统 SHALL 支持上传新的 SSL 证书或通过生成方式创建证书，数据存到 DB。上传/编辑表单中增加 mTLS 双向认证配置区域。表单 SHALL 对文件选择提供即时反馈，SNI 标签输入 SHALL 与生成对话框行为一致（支持逗号/粘贴拆分），提交失败的错误提示 SHALL 可读。

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
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 页面顶部操作栏 SHALL 显示以下按钮：
  - "添加已有证书"按钮：打开现有上传表单（SslFormDrawer）
  - "生成国密证书"按钮：打开国密证书生成对话框（SslGenerateDialog）
- **AND** 两个按钮风格一致，主次分明
- **AND** 当前集群筛选非空时打开任一弹窗，集群下拉 SHALL 预选该集群

#### Scenario: 生成国密证书对话框
- **WHEN** 用户点击"生成国密证书"按钮
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
- **AND** SSL 证书列表自动刷新
- **AND** 新证书卡片出现在列表中，带有"国密生成"标记
- **AND** 若当前停留在「CA 根证书」页签，SHALL 自动切回「全部证书」页签（生成的 server 证书在 CA 页签不可见）

#### Scenario: 生成失败
- **WHEN** 证书生成过程中发生错误（本地 openssl 不可用、SSH 连接失败、节点不支持 SM2 等）
- **THEN** 对话框显示具体错误信息
- **AND** 提供"关闭"按钮，不自动关闭
- **AND** 不创建任何 SSL 证书记录

### Requirement: 生成国密证书对话框

系统 SHALL 在 SSL 证书生成对话框中增加 mTLS 配置。mTLS 区域与"同时生成客户端证书"复选框解耦，仅由算法（SM2）和证书类型（server）决定是否显示。CA 选择的提示与校验 SHALL 一致：未选集群显示中性提示，未选 CA 时生成按钮统一禁用。

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

### Requirement: SSL 证书列表页搜索框

SSL 证书列表页搜索框样式 SHALL 与其他页面（如四层代理）一致。

#### Scenario: 搜索框样式
- **WHEN** 用户查看 SSL 证书列表页
- **THEN** 搜索框 SHALL 使用固定宽度（200px），不拉伸占据整行
- **AND** 搜索框 SHALL 与其他页面风格一致

### Requirement: 发布 SSL 证书到 Edge

系统 SHALL 支持将 SSL 证书发布到集群的 Edge 节点，并记录版本历史。发布时根据配置携带 `client` 对象用于 mTLS 双向认证。

#### Scenario: 发布流程（携带 client 配置）
- **WHEN** 用户点击证书卡片的"发布"按钮
- **THEN** 弹出节点选择对话框，默认选择集群下所有活跃节点
- **AND** 确认后系统 SHALL 调用 `EdgeClient.api("ssl", "update", edge_uuid, data)` 将证书推送到 Edge 节点
- **AND** 显示发布进度和结果
- **AND** 发布成功后 `current_version` 递增，创建 `ConfigVersion`（`resource_type="ssl"`）记录
- **AND** 证书的 `client_ca` 不为空时，`data` SHALL 包含 `client` 对象：`{"ca": client_ca, "depth": client_depth, "skip_mtls_uri_regex": [...]}`
- **AND** `client_ca` 为空时，`data` SHALL 不包含 `client` 字段
- **AND** 非国密证书（`gm=false`）即使有 `client_ca` 值也不发送 `client` 字段

#### Scenario: Edge 通过 SNI 匹配
- **WHEN** 证书已发布到 Edge 节点
- **THEN** 客户端发起 HTTPS 请求时，Edge 根据 TLS SNI 自动匹配对应证书
- **AND** 无需在路由上配置任何 SSL 关联

### Requirement: 删除 SSL 证书

系统 SHALL 支持删除 SSL 证书，包含已发布保护提示。

#### Scenario: 删除流程
- **WHEN** 用户点击证书卡片的"删除"按钮
- **THEN** 如果证书已发布（`current_version > 0`），弹出警告：`该证书已发布到 N 个节点，确定要删除吗？`
- **AND** 弹出确认对话框，可选：从数据库删除、从 Edge 节点删除、选择目标节点
- **AND** 确认后执行相应删除操作

### Requirement: SSL 证书版本历史

系统 SHALL 支持查看 SSL 证书的发布版本历史。

#### Scenario: 版本历史
- **WHEN** 用户点击证书卡片的"版本管理"按钮
- **THEN** 打开 `VersionManagementModal`（`resource_type="ssl"`），显示版本列表和配置 diff
- **AND** 用户可回滚到指定版本
- **AND** 用户可删除非当前版本的历史记录

### Requirement: Edge 直连 SSL 证书操作弹窗

Edge 直连页面 SSL 证书 Tab 中的查看和删除弹窗 SHALL 与其他 Tab 风格一致。

#### Scenario: 查看弹窗
- **WHEN** 用户点击 SSL 证书行的「JSON」按钮
- **THEN** 系统 SHALL 打开页面的统一 JSON 弹窗（jsonModal），展示证书完整 JSON 数据
- **AND** 该弹窗与四层代理、上游等其他 Tab 的 JSON 查看弹窗风格一致

#### Scenario: 删除确认
- **WHEN** 用户点击 SSL 证书行的「删除」按钮
- **THEN** 系统 SHALL 弹出 `Modal.confirm` 确认对话框
- **AND** 确认后调用 DELETE API 删除证书
- **AND** 该确认弹窗与四层代理、上游等其他 Tab 的删除确认弹窗风格一致

### Requirement: Edge API 日志

系统 SHALL 将 SSL 证书的 Edge API 调用记录到独立日志文件。

#### Scenario: 日志记录
- **WHEN** SSL 证书发布到 Edge 节点
- **THEN** 调用日志 SHALL 写入 `logs/edge/ssl.log`
- **AND** 日志格式与其他资源类型（路由、上游等）一致

### Requirement: 国密双证书录入
系统 SHALL 支持在 SSL 证书表单中录入国密双证书（NTLS/TLCP）。表单中新增"国密双证书"开关，开启后显示签名证书（sign_cert）和签名私钥（sign_key）两个上传/粘贴字段。`gm=true` 时签名证书和签名私钥为必填。

#### Scenario: 创建国密证书
- **WHEN** 用户打开 SSL 证书创建表单
- **AND** 勾选"国密双证书"开关
- **THEN** 表单 SHALL 显示签名证书和签名私钥字段
- **WHEN** 用户填写加密证书、加密私钥、签名证书、签名私钥并提交
- **THEN** 系统 SHALL 在数据库中创建记录，`gm=true`、`sign_cert` 和 `sign_key` 保存对应值
- **AND** 响应状态码 SHALL 为 200

#### Scenario: 国密模式下签名证书为必填
- **WHEN** 用户勾选"国密双证书"但未填写签名证书
- **THEN** 前端 SHALL 提示"请上传签名证书"
- **AND** 表单 SHALL 不提交

#### Scenario: 编辑时取消国密模式
- **WHEN** 用户编辑一个 `gm=true` 的证书，取消勾选"国密双证书"并保存
- **THEN** 后端 SHALL 将 `gm` 设为 false，`sign_cert` 和 `sign_key` 清空为 null

#### Scenario: 非国密模式不受影响
- **WHEN** 用户未勾选"国密双证书"
- **THEN** 表单 SHALL 不显示签名证书字段
- **AND** 提交时 `gm` 默认为 false，`sign_cert` 和 `sign_key` 为 null

### Requirement: 国密双证书发布到 Edge
系统 SHALL 在发布 SSL 证书到 Edge 节点时，根据 `gm` 字段决定发送格式。`gm=true` 时发送国密双证书格式（`cert`/`key` 加密 + `certs[]`/`keys[]` 签名 + `gm: true`），否则发送原有单证书格式。

#### Scenario: 发布国密证书
- **WHEN** 用户点击发布按钮，证书 `gm=true`
- **THEN** 后端 SHALL 组装 `config_data` 包含 `cert`、`key`、`certs`、`keys`、`gm: true`
- **AND** Edge API SHALL 收到正确的双证书格式
- **AND** 响应 SHALL 包含发布结果

#### Scenario: 发布普通证书不受影响
- **WHEN** 用户点击发布按钮，证书 `gm=false` 或 `gm` 为空
- **THEN** 后端 SHALL 发送原有单证书格式（仅 `cert` + `key`）

### Requirement: 从 Edge 导入国密双证书
系统 SHALL 在从 Edge 节点导入 SSL 证书时，识别 `gm: true` 标记，并将 `certs`/`keys` 数组中的签名证书和签名私钥存入数据库。

#### Scenario: 导入国密证书
- **WHEN** 用户从 Edge 节点导入数据
- **AND** Edge 返回的 SSL 证书包含 `gm: true`、`certs: ["sign_cert_pem"]`、`keys: ["sign_key_pem"]`
- **THEN** `convert_ssl_certificate` SHALL 将 `gm`、`sign_cert`、`sign_key` 存入返回的 dict
- **AND** 导入到数据库后 `gm=true`、`sign_cert`、`sign_key` 值正确

### Requirement: 证书创建方式字段

系统 SHALL 在 `ps_ssl_certificate` 表中新增 `create_method` 字段，记录证书创建方式。

#### Scenario: 数据库迁移
- **WHEN** 系统执行数据库迁移
- **THEN** `ps_ssl_certificate` 表 SHALL 新增 `create_method` 列，String(32)，默认值 `"upload"`

#### Scenario: 创建方式写入
- **WHEN** 通过手动上传表单创建证书
- **THEN** `create_method` SHALL 为 `"upload"`
- **WHEN** 通过生成本地 API 创建证书
- **THEN** `create_method` SHALL 为 `"local_generate"`
- **WHEN** 通过生成远程 API 创建证书
- **THEN** `create_method` SHALL 为 `"remote_generate"`

### Requirement: 国密双证书数据库对比
系统 SHALL 在数据库与 Edge 节点配置对比（SSL 证书部分）时，对比 `gm`、签名证书（`sign_cert` ↔ `certs`）、签名私钥（`sign_key` ↔ `keys`）字段。

#### Scenario: 对比国密证书
- **WHEN** 用户执行数据库对比
- **AND** DB 中的证书 `gm=true`、`sign_cert="sign_pem"`，Edge 端 `certs=["sign_pem"]`
- **THEN** `_compare_ssl_certificate` SHALL 检测 `sign_cert`/`certs` 一致
- **AND** 对比结果 SHALL 包含 `gm`、`sign_cert`、`sign_key` 字段的对比信息

### Requirement: 查看抽屉关键属性

系统 SHALL 在 SSL 证书查看抽屉中展示有效期与算法信息，使详情信息量不低于列表卡片。

#### Scenario: SSL 证书查看属性完整
- **WHEN** 用户打开 server/client 证书的查看抽屉
- **THEN** SHALL 显示「有效期」行（仅日期 + 到期预警语义，解析失败降级「—（无法解析）」）
- **AND** SHALL 显示「算法」行
- **AND** SNI SHALL 以标签形态渲染，证书类型 SHALL 中文显示

#### Scenario: CA 查看属性完整
- **WHEN** 用户打开 CA 根证书的查看抽屉
- **THEN** SHALL 显示「有效期」行
- **AND** 原「状态：CA 根证书」行 SHALL 改为「类型」语义（状态行不应承载类型信息）

### Requirement: 私钥按需获取与掩码

系统 SHALL 对 SSL 证书私钥（含国密签名私钥 `sign_key`）实施统一保护：列表与详情响应 SHALL 掩码全部私钥字段并携带有无布尔字段，私钥获取 SHALL 走单一按需端点（全证书类型生效，替代 `/ca-key`）并留审计痕，编辑表单 SHALL NOT 回填明文私钥且「留空」SHALL 表示不修改。

#### Scenario: 列表与详情响应掩码
- **WHEN** 前端请求 SSL 证书列表或详情
- **THEN** 响应中 `private_key` 与 `sign_key` SHALL 均为空串（含 server/client 证书，不再仅掩 CA；`sign_key` 为国密签名私钥，敏感性等同）
- **AND** 响应 SHALL 携带 `has_private_key`/`has_sign_key` 布尔字段（服务端真实有无）
- **AND** 私钥 MUST NOT 随列表接口全量下发

#### Scenario: 私钥有无判定不依赖字段内容
- **WHEN** 下载对话框或查看抽屉决定是否展示私钥选项/👁 操作
- **THEN** SHALL 依据 `has_private_key`/`has_sign_key` 布尔判定
- **AND** MUST NOT 依据掩码后恒空的字段内容真值判定（否则私钥选项静默消失）

#### Scenario: 按需获取私钥
- **WHEN** 用户在查看抽屉显示或下载私钥、或在下载对话框打包含私钥的 ZIP
- **THEN** 前端 SHALL 经高风险确认弹窗后调用单一按需端点 `GET /clusters/{id}/ssl/{cert_id}/key`
- **AND** 该端点 SHALL 对全部证书类型生效（含 CA 根证书），国密证书 SHALL 返回加密与签名两个私钥
- **AND** 该端点 SHALL 记录操作审计（查看/下载私钥）
- **AND** 既有 `/ca-key` 端点 SHALL 在调用方迁移后删除（不做双实现）

#### Scenario: 编辑不回填明文私钥
- **WHEN** 用户编辑已有证书
- **THEN** 私钥输入区 SHALL 显示占位「已保存，留空表示不修改」且不回填明文
- **AND** 提交时私钥留空（未提供、None 或空串）SHALL 表示不修改原私钥（前端省略空值 + 后端仅对 `private_key` 跳过，不影响其它字段的清空语义）
- **AND** 编辑不碰私钥保存后，库中私钥 SHALL 与修改前逐字节一致

