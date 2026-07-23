# ca-multi-algorithm Specification

## Purpose

CA 根证书生成支持 RSA、ECC 算法，与已有的算法选择体系打通。服务器证书签发统一要求绑定 CA，不支持自签名。

## Requirements

### Requirement: CA 根证书支持算法选择
系统 SHALL 支持在创建 CA 根证书时指定算法，支持 sm2 / rsa / ecc 三种算法。

#### Scenario: 创建 SM2 CA 根证书（默认）
- **WHEN** 用户创建 CA 根证书且不指定算法（使用默认值 sm2）
- **THEN** 系统 SHALL 使用 SM2 椭圆曲线生成密钥对
- **AND** 证书签名使用 SM3 哈希算法
- **AND** 行为与当前 SM2 CA 创建完全一致

#### Scenario: 创建 RSA CA 根证书
- **WHEN** 用户创建 CA 根证书且指定算法为 rsa
- **THEN** 系统 SHALL 生成 2048 位 RSA 密钥对
- **AND** 证书签名使用 SHA256 哈希算法
- **AND** CA 证书扩展字段（basicConstraints、keyUsage）与其他算法一致

#### Scenario: 创建 ECC CA 根证书
- **WHEN** 用户创建 CA 根证书且指定算法为 ecc
- **THEN** 系统 SHALL 生成 P-256（prime256v1）椭圆曲线密钥对
- **AND** 证书签名使用 SHA256 哈希算法
- **AND** CA 证书扩展字段与其他算法一致

### Requirement: API 接受算法参数
系统 SHALL 在 `POST /api/v1/clusters/{cluster_id}/ssl/ca` 接口中接受 `algorithm` 参数。

#### Scenario: 传递算法参数
- **WHEN** 客户端请求创建 CA 根证书
- **THEN** 请求体 SHALL 支持字段 `algorithm`（默认值 `"sm2"`，可选值 `"sm2"` / `"rsa"` / `"ecc"`）
- **AND** 当 `algorithm` 为 `"rsa"` 或 `"ecc"` 时，SHALL 跳过 SM2 曲线支持检查
- **AND** 当 `algorithm` 为 `"sm2"` 时，SHALL 保持现有 SM2 曲线支持检查
- **AND** openssl 不可用时（path 为空），无论何种算法都 SHALL 报错

#### Scenario: 存储算法信息
- **WHEN** CA 根证书创建成功并存入数据库
- **THEN** `SslCertificate.algorithm` SHALL 存储实际算法名称（`"sm2"` / `"rsa"` / `"ecc"`）
- **AND** `SslCertificate.gm` SHALL 在 `algorithm == "sm2"` 时为 `True`，否则为 `False`

#### Scenario: RSA/ECC CA 使用 SHA256 签名
- **WHEN** 创建 RSA 或 ECC 算法的 CA 根证书
- **THEN** CSR 生成和自签名时 SHALL 使用 `sha256` 哈希算法（非默认的 `sm3`）

### Requirement: 前端 CA 创建支持算法选择
系统 SHALL 在 CA 创建界面提供算法选择器，选项与证书生成算法选择一致。

#### Scenario: CA 创建对话框
- **WHEN** 用户打开创建 CA 根证书对话框
- **THEN** 对话框 SHALL 包含算法选择下拉框（SM2 / RSA / ECC）
- **AND** 算法选择器 SHALL 位于所属集群选择框上方
- **AND** 默认选中 SM2
- **AND** API payload SHALL 包含 `algorithm` 字段

### Requirement: 服务器证书强制 CA 签发
系统 SHALL 要求所有服务器证书（无论 SM2 / RSA / ECC）必须指定 CA 根证书签发，不支持自签名。

#### Scenario: 选择 CA
- **WHEN** 用户生成服务器证书
- **THEN** 必须选择一个与算法匹配的 CA 根证书
- **AND** SM2 证书可选择任意 CA；RSA 证书仅显示 RSA 类型的 CA；ECC 证书仅显示 ECC 类型的 CA

#### Scenario: CA 签发
- **WHEN** 选择 CA 后生成服务器证书
- **THEN** 系统 SHALL 使用 CA 私钥签名 CSR，而非自签名
- **AND** 生成的证书包含完整的 CA 签发链信息

### Requirement: CA 证书卡片显示算法
系统 SHALL 在 SSL 证书列表的 CA 卡片中显示算法信息。

#### Scenario: 类型行标签
- **WHEN** 卡片渲染且证书为 CA 根证书
- **THEN** 类型行 SHALL 显示 `CA 根证书 SM2` / `CA 根证书 RSA` / `CA 根证书 ECC`
