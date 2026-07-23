## Why

当前 CA 根证书生成函数 `generate_ca_certificate` 只支持 SM2 算法（国密）。而 `LocalProvider.generate_certificate` 和前端 `SslGenerateDialog.vue` 已支持 RSA、ECC 算法用于服务器证书。当用户选择 RSA/ECC 生成服务器证书时，需要一个对应算法的 CA 根证书来签发，但目前系统无法生成 RSA/ECC 的 CA 根证书。

## What Changes

- `cert_generator.py` 的 `generate_ca_certificate` 函数新增 `algorithm` 参数，支持 `sm2` / `rsa` / `ecc` 三种算法
- 函数内部根据算法分发到不同的密钥生成函数和哈希算法
- API 层 `cluster_ssl.py` 的 create_ca 端点传递算法参数
- 前端 CA 创建流程支持算法选择

## Capabilities

### New Capabilities
- `ca-multi-algorithm`: CA 根证书生成支持 RSA、ECC 算法，不再仅限 SM2

### Modified Capabilities
- `certificate-management`: SSL 证书管理流程中 CA 创建与证书算法选择打通

## Impact

- `backend/app/services/cert_generator.py`: 修改 `generate_ca_certificate`，新增 `algorithm` 参数
- `backend/app/api/v1/cluster_ssl.py`: create_ca 端点接收算法参数并传递
- `backend/app/schemas/ssl.py`: 可能需新增算法字段
- 前端：CA 创建对话框增加算法选择器
