# Spec Delta

## MODIFIED Requirements

### Requirement: PEM 文件下载

系统 SHALL 在 SSL 证书查看抽屉的每个内容区域提供下载按钮。证书类文件（证书/签名证书）下载后缀 SHALL 统一为 `.crt`（PEM 内容）；CA 根证书的下载文件名 SHALL 与 CA 分发页一致（`{集群名}_{证书名称}.crt`）；私钥类文件（私钥/签名私钥）SHALL 保持 `.pem` 后缀，且 SHALL 仅能经高风险确认流程获取。

#### Scenario: 下载证书文件
- **WHEN** 用户查看 SSL 证书
- **AND** 点击证书内容区域旁的"下载"按钮
- **THEN** 浏览器 SHALL 下载一个 `.crt` 文件
- **AND** 文件名格式为 `{证书名称}.crt`

#### Scenario: CA 证书下载文件名一致
- **WHEN** 用户在查看抽屉下载 CA 根证书
- **THEN** 文件名 SHALL 与 CA 分发页直下一致（`{集群名}_{证书名称}.crt`，见 `ca-root-certificate-distribution`），SHALL NOT 沿用历史 `{证书名称}_ca.crt` 命名

#### Scenario: 下载私钥文件
- **WHEN** 用户查看 SSL 证书
- **AND** 经高风险确认后在私钥内容区域点击"下载"按钮
- **THEN** 浏览器 SHALL 下载一个 `.pem` 文件
- **AND** 文件名格式为 `{证书名称}_key.pem`

#### Scenario: 下载签名证书（双证书模式）
- **WHEN** 用户查看国密双证书
- **THEN** 签名证书(sign_cert)区域 SHALL 也显示下载按钮
- **WHEN** 用户点击下载
- **THEN** 浏览器 SHALL 下载 `{证书名称}_sign.crt`

#### Scenario: 下载签名私钥（双证书模式）
- **WHEN** 用户查看国密双证书
- **THEN** 签名私钥(sign_key)区域 SHALL 也显示下载按钮（经高风险确认）
- **WHEN** 用户点击下载
- **THEN** 浏览器 SHALL 下载 `{证书名称}_sign_key.pem`
