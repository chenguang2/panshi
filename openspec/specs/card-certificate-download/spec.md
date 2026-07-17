## Purpose

支持在 SSL 证书卡片上直接下载证书文件，可选择需要的文件后打包为 ZIP。

## Requirements

### Requirement: 卡片下载按钮

系统 SHALL 在 SSL 证书卡片操作栏提供"下载"按钮。

#### Scenario: 按钮位置
- **WHEN** 用户查看 SSL 证书列表
- **THEN** 每张证书卡片的操作栏 SHALL 显示"下载"按钮
- **AND** "下载"按钮位于"查看"按钮旁边

### Requirement: 文件选择对话框

系统 SHALL 提供文件选择对话框，让用户勾选需要下载的文件。

#### Scenario: 打开对话框
- **WHEN** 用户点击卡片上的"下载"按钮
- **THEN** 弹出 SslCertDownloadDialog 模态对话框
- **AND** 对话框列出可下载的文件选项

#### Scenario: 文件选项按内容动态显示
- **WHEN** 证书有 cert 内容
- **THEN** 对话框 SHALL 显示"加密证书(cert.pem)"选项
- **WHEN** 证书有 private_key/key 内容
- **THEN** 对话框 SHALL 显示"加密私钥(key.pem)"选项
- **WHEN** 证书有 sign_cert 内容
- **THEN** 对话框 SHALL 额外显示"签名证书(sign_cert.pem)"选项
- **WHEN** 证书有 sign_key 内容
- **THEN** 对话框 SHALL 额外显示"签名私钥(sign_key.pem)"选项
- **AND** 所有有内容的选项默认全部勾选

### Requirement: ZIP 打包下载

系统 SHALL 将用户选择的文件打包为 ZIP 并下载。

#### Scenario: 下载 ZIP
- **WHEN** 用户勾选文件并点击"下载 ZIP"
- **THEN** 系统 SHALL 使用 jszip 将选中文件打包为 ZIP
- **AND** ZIP 文件名为 `{证书名称}_certs.zip`
- **AND** 内部文件名为 `{证书名称}_cert.pem`、`{证书名称}_key.pem` 等
- **AND** 浏览器下载该 ZIP 文件
