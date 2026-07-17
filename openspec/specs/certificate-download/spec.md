## Purpose

支持在 SSL 证书查看界面直接下载 PEM 文件，无需手动复制粘贴。

## Requirements

### Requirement: PEM 文件下载

系统 SHALL 在 SSL 证书查看界面的每个 PEM 显示区域提供下载按钮。

#### Scenario: 下载证书文件
- **WHEN** 用户查看 SSL 证书
- **AND** 点击证书内容区域旁的"下载"按钮
- **THEN** 浏览器 SHALL 下载一个 `.pem` 文件
- **AND** 文件名格式为 `{证书名称}_cert.pem`

#### Scenario: 下载私钥文件
- **WHEN** 用户查看 SSL 证书
- **AND** 点击私钥内容区域旁的"下载"按钮
- **THEN** 浏览器 SHALL 下载一个 `.pem` 文件
- **AND** 文件名格式为 `{证书名称}_key.pem`

#### Scenario: 下载签名证书（双证书模式）
- **WHEN** 用户查看国密双证书
- **THEN** 签名证书(sign_cert)区域 SHALL 也显示下载按钮
- **WHEN** 用户点击下载
- **THEN** 浏览器 SHALL 下载 `{证书名称}_sign_cert.pem`

#### Scenario: 下载签名私钥（双证书模式）
- **WHEN** 用户查看国密双证书
- **THEN** 签名私钥(sign_key)区域 SHALL 也显示下载按钮
- **WHEN** 用户点击下载
- **THEN** 浏览器 SHALL 下载 `{证书名称}_sign_key.pem`
