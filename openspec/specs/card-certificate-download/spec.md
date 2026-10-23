## Purpose

支持在 SSL 证书卡片上直接下载证书文件，可选择需要的文件后打包为 ZIP。

## Requirements

### Requirement: 卡片下载按钮

系统 SHALL 在服务器证书卡片操作栏提供"下载证书"按钮（仅 `cert_type=server` 的证书显示；客户端证书不适用分发弹窗，引导查看抽屉）。CA 根证书卡片的下载为单文件直下（见 `ca-root-certificate-distribution`），不使用本对话框。

#### Scenario: 按钮位置
- **WHEN** 用户查看服务器证书列表
- **THEN** 每张服务器证书（`cert_type=server`）卡片的操作栏 SHALL 显示"下载证书"按钮
- **AND** "下载证书"按钮位于"查看"按钮旁边

#### Scenario: 客户端证书不提供分发下载
- **WHEN** 证书类型为 `client`（mTLS 客户端证书，本就随私钥交付用户安装）
- **THEN** 卡片 SHALL NOT 显示"下载证书"按钮（分发弹窗的无私钥语义不适用于客户端证书）
- **AND** 客户端证书的获取走查看抽屉既有「下载客户端证书包」通道
### Requirement: 文件选择对话框

系统 SHALL 提供下载对话框，仅列出证书文件选项（SHALL NOT 出现任何私钥选项），文件名一律使用 `.crt` 后缀，并 SHALL 固定展示失效警示与「下载 CA 根证书」快捷操作。

#### Scenario: 打开对话框
- **WHEN** 用户点击服务器证书卡片上的"下载证书"按钮
- **THEN** 弹出下载对话框
- **AND** 对话框仅列出证书文件选项（无私钥选项）

#### Scenario: 文件选项按内容动态显示
- **WHEN** 证书有 cert 内容
- **THEN** 对话框 SHALL 显示「服务器证书 {证书名称}.crt」选项
- **WHEN** 证书有 sign_cert 内容（国密双证书）
- **THEN** 对话框 SHALL 额外显示「签名证书 {证书名称}_sign.crt」选项
- **AND** 证书选项默认全部勾选
- **AND** 对话框 SHALL NOT 提供「私钥 (key.pem)」「签名私钥 (sign_key.pem)」等任何私钥选项（`has_private_key`/`has_sign_key` 与对话框无关，仅约束查看抽屉）

#### Scenario: 国密双证书选项命名
- **WHEN** 证书为国密双证书（`gm=true` 且含签名证书）
- **THEN** 选项 SHALL 命名为「服务器证书」「签名证书」（`.crt` 后缀，经文件名区分，不再有私钥对故无「加密/签名私钥」前缀需求）
- **WHEN** 证书为单证体系（RSA/ECC 非国密）
- **THEN** 选项 SHALL 命名为「服务器证书」，SHALL NOT 使用「加密」前缀造成困惑

#### Scenario: 失效警示
- **WHEN** 下载对话框打开
- **THEN** 对话框 SHALL 固定展示警示块，说明：① 此文件是当前版本的副本，证书更新或重新生成后即失效，届时需重新下载；② 终端用户请勿安装本文件，应安装 CA 根证书
- **AND** 警示块内 SHALL 提供「下载 CA 根证书」按钮，点击后下载该证书签发 CA 的 `.crt`（`ca_cert_id` 有效时）

#### Scenario: 敏感数据提示
- **WHEN** 下载对话框打开
- **THEN** 对话框 SHALL 说明私钥去向：私钥不随证书下载（对话框无私钥选项，替代原「ZIP 内含私钥」提示），仅用于平台发布部署；如需查看请在「查看」抽屉中操作（高风险、将被审计）
### Requirement: 下载产物

系统 SHALL 按证书形态产出下载结果：单证书直接下载单个 `.crt` 文件，国密双证书打包为 zip（内含两个 `.crt`，SHALL NOT 包含任何私钥）；下载成功提示 SHALL 包含重新分发提醒。

#### Scenario: 单证书单文件直下
- **WHEN** 用户下载非国密（单证书）服务器证书
- **THEN** 系统 SHALL 直接下载单个文件 `{证书名称}.crt`（PEM 内容）
- **AND** SHALL NOT 打包 zip、SHALL NOT 弹出文件格式选择

#### Scenario: 下载 ZIP
- **WHEN** 用户下载国密双证书（同时勾选加密与签名证书）
- **THEN** 系统 SHALL 打包下载 `{证书名称}_certs.zip`
- **AND** zip 内为 `{证书名称}.crt` 与 `{证书名称}_sign.crt`（PEM 内容）
- **AND** zip 内 SHALL NOT 包含任何私钥文件（无私钥选项可选，与旧版含 key 打包语义不同）

#### Scenario: 下载成功提示
- **WHEN** 服务器证书下载成功
- **THEN** 成功提示 SHALL 追加说明：此副本在证书更新后即失效，请勿分发给终端用户（终端用户应安装 CA 根证书）
