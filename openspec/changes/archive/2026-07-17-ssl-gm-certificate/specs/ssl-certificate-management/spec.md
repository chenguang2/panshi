## ADDED Requirements

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

### Requirement: 国密双证书数据库对比
系统 SHALL 在数据库与 Edge 节点配置对比（SSL 证书部分）时，对比 `gm`、签名证书（`sign_cert` ↔ `certs`）、签名私钥（`sign_key` ↔ `keys`）字段。

#### Scenario: 对比国密证书
- **WHEN** 用户执行数据库对比
- **AND** DB 中的证书 `gm=true`、`sign_cert="sign_pem"`，Edge 端 `certs=["sign_pem"]`
- **THEN** `_compare_ssl_certificate` SHALL 检测 `sign_cert`/`certs` 一致
- **AND** 对比结果 SHALL 包含 `gm`、`sign_cert`、`sign_key` 字段的对比信息
