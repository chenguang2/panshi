## 1. Backend — 数据库模型扩展

- [x] 1.1 `backend/app/models/ssl.py` 的 `SslCertificate` 类新增 `gm`（Boolean, default=False）、`sign_cert`（Text, nullable）、`sign_key`（Text, nullable）字段

## 2. Backend — Pydantic Schema 扩展

- [x] 2.1 `backend/app/schemas/ssl.py` 的 `SslCertificateBase` 新增 `gm: bool = False`、`sign_cert: str = ""`、`sign_key: str = ""`
- [x] 2.2 `SslCertificateCreate` 中 `gm=true` 时 `sign_cert` 和 `sign_key` 为必填（通过 `field_validator` 校验）
- [x] 2.3 `SslCertificateUpdate` 新增可选字段
- [x] 2.4 `SslCertificateResponse` 自动继承

## 3. Backend — 发布适配

- [x] 3.1 修改 `cluster_ssl.py` 的 `publish_ssl_certificate` 函数，`cert.gm=True` 时在 `config_data` 中添加 `certs`、`keys`、`gm: true`
- [x] 3.2 修改 `cluster_ssl.py` 更新接口：取消国密时清空 `sign_cert` 和 `sign_key`

## 4. Backend — Edge 导入适配

- [x] 4.1 修改 `edge_import_service.py` 的 `convert_ssl_certificate` 函数，提取 `gm`、`certs`(→`sign_cert`)、`keys`(→`sign_key`) 字段

## 5. Backend — 数据库对比适配

- [x] 5.1 修改 `cluster_nodes.py` 的 `_compare_ssl_certificate` 函数，增加 `gm`、`sign_cert`(↔Edge `certs`)、`sign_key`(↔Edge `keys`) 的对比字段

## 6. Frontend — 类型定义

- [x] 6.1 `frontend/src/types/ssl.ts` 的接口新增 `gm`、`sign_cert`、`sign_key` 字段

## 7. Frontend — SslFormDrawer 组件

- [x] 7.1 表单中新增"国密双证书"复选框，绑定 `form.gm`
- [x] 7.2 `gm=true` 时动态显示签名证书和签名私钥的上传/粘贴字段
- [x] 7.3 验证逻辑：`gm=true` 时 `sign_cert` 和 `sign_key` 为必填
- [x] 7.4 提交时 `gm=true` 则附带 `sign_cert` 和 `sign_key`；取消 gm 则清空
- [x] 7.5 编辑回显：`gm=true` 时加载签名证书和签名私钥的值

## 8. Frontend — SSL 列表展示

- [x] 8.1 `SslList.vue` 的卡片或详情中，`gm=true` 时显示"国密"标签
