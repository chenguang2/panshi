# ssl-certificate-management (Delta Specification)

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

#### Scenario: 算法分类标识

- **WHEN** SSL 证书卡片展示
- **THEN** 卡片顶部 topbar 右上角 SHALL 显示算法分类标签
- **AND** 国密算法（SM2）SHALL 显示 `🇨🇳 国密`（红色系配色）
- **AND** 国际算法（RSA、ECC 等）SHALL 显示 `🌐 国际`（蓝色系配色）

#### Scenario: 算法类型 badge

- **WHEN** 证书类型行展示算法信息
- **THEN** SM2 证书 SHALL 显示为 `🇨🇳 国密 SM2 单证书` 或 `🇨🇳 国密 SM2 双证书`（红色系 badge）
- **AND** RSA 证书 SHALL 显示为 `🌐 国际 RSA 2048`（蓝色系 badge）
- **AND** ECC 证书 SHALL 显示为 `🌐 国际 ECC P-256`（蓝色系 badge）
