## Why

SSL 证书卡片上只显示 SM2、RSA 2048、ECC P-256 等技术名称，用户无法直观区分国密算法和国际算法，容易混淆。

## What Changes

- SSL 证书卡片顶部 topbar 增加算法分类标签（🇨🇳 国密 / 🌐 国际）
- SSL 证书类型 badge 增加图标和分类前缀（🇨🇳 国密 SM2 双证书 / 🌐 国际 RSA 2048）
- 国密使用红色系配色，国际使用蓝色系配色

## Capabilities

### Modified Capabilities
- `ssl-certificate-management`: SSL 证书卡片展示增加算法分类标识，修改类型 badge 显示文案和样式

## Impact

- `frontend/src/views/SslList.vue`：卡片 topbar 增加标签、算法 badge 增加前缀和图标、新增 CSS 样式
