## 1. 后端 Schema — 修复 Pydantic 校验失败

- [x] 1.1 `SslCertificateBase` 中 `cert` 移除 `min_length=1`，改为 `cert: str = ""`
- [x] 1.2 `SslCertificateBase` 中 `private_key` 移除 `min_length=1`，改为空字符串默认值
- [x] 1.3 `SslCertificateBase` 中 `name` 移除 `min_length=1`，改为 `name: str = ""`
- [x] 1.4 `SslCertificateBase` 中 `sni` 移除 `min_length=1`，改为 `sni: str = ""`
- [x] 1.5 `SslCertificateCreate` 中为 `name`、`sni`、`cert`、`private_key` 添加 `min_length=1` 约束

## 2. 前端 SslList — 修复搜索框样式

- [x] 2.1 `.search-input-wrap` 移除 `flex: 1`，设为固定宽度 `200px`

## 3. 前端 SslList — 加载失败时清除旧数据

- [x] 3.1 `loadCerts()` catch 中重置 `certs.value = []` 和 `totalCount.value = 0`
