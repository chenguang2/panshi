## 0. 基础设施：Tongsuo openssl 二进制

- [x] 0.1 确认 `product/linux/tongsuo/bin/openssl` 已就位（Tongsuo 8.5.0-pre1，7MB）
- [ ] 0.2 `git add product/linux/tongsuo/bin/openssl` 纳入版本管理（用户决定后再执行）
- [x] 0.3 `product/linux/gen-linux.sh`：增加拷贝 Tongsuo openssl 到 `panshi/backend/bin/openssl` 的步骤（已完成）
- [ ] 0.4 验证 `gen-linux.sh` 生成的部署包中 `backend/bin/openssl` 存在且可执行

## 1. Backend: 数据库变更

- [x] 1.1 在 `backend/app/models/ssl.py` 的 `SslCertificate` 模型新增 `create_method` 列（String(32), default="upload"）
- [x] 1.2 在 `backend/app/core/migrate.py` 新增 `create_method` 字段的迁移
- [x] 1.3 在 `backend/app/schemas/ssl.py` 的 `SslCertificateBase` / `SslCertificateResponse` 新增 `create_method` 字段

## 2. Backend: 证书生成服务

- [x] 2.1 新建 `backend/app/services/cert_generator.py`，实现 SM2 证书生成服务
- [x] 2.2 实现 `detect_openssl()` 函数 — 检测优先级：bundled Tongsuo → 系统 PATH → 检测版本、SM2 支持、发行版类型
- [x] 2.3 实现 `generate_openssl_cnf()` 函数 — 动态生成最小 openssl.cnf（Tongsuo 需要）
- [x] 2.4 实现 `generate_sm2_keypair()` 函数 — 生成 SM2 密钥对
- [x] 2.5 实现 `generate_csr()` 函数 — 生成 CSR，支持 DNS SAN 和 IP SAN 自动格式化
- [x] 2.6 实现 `self_sign_certificate()` 函数 — 自签名证书
- [x] 2.7 实现 `generate_dual_certificates()` 函数 — 同时生成加密+签名双证书（共用 CN/SAN）
- [x] 2.8 实现 OpenSSL 版本适配：Tongsuo 加 `-sigopt`，标准 OpenSSL 3.x 不加
- [x] 2.9 实现 SSH 远程生成逻辑：复用 `ansible_service` SSH 连接节点（在 3.2/3.3 中实现）
- [x] 2.10 实现 `LocalProvider` — 本地 openssl 生成接口

## 3. Backend: API 端点

- [x] 3.1 在 `backend/app/schemas/ssl.py` 新增 `SslCertificateGenerateRequest`
- [x] 3.2 在 `backend/app/api/v1/cluster_ssl.py` 新增 `POST /clusters/{cluster_id}/ssl/generate` 端点
- [x] 3.3 实现端点逻辑：参数校验 → mode 判断 → 本地/远程生成 → 创建记录（含 create_method）→ 返回 201
- [x] 3.4 在列表/详情接口中返回 `create_method` 字段（继承 schema 自动带出）
- [x] 3.5 编写 API 测试（路由注册 + Schema 测试）

## 4. Frontend: 证书生成对话框组件

- [x] 4.1 新建 `frontend/src/components/SslGenerateDialog.vue`
- [x] 4.2 实现生成方式切换（本地/远程 Radio）
- [x] 4.3 实现集群下拉框 + 远程时节点下拉框
- [x] 4.4 实现表单字段：证书名称、CN、域名 SAN（Tag 输入）、IP SAN（Tag 输入）、有效期、双证书开关、证书类型
- [x] 4.5 实现进度状态展示（检测环境 → 密钥对 → CSR → 签发 → 保存）
- [x] 4.6 实现错误处理和成功回调

## 5. Frontend: 页面集成

- [x] 5.1 在 `frontend/src/types/ssl.ts` 新增生成请求/响应类型
- [x] 5.2 在 `frontend/src/api/ssl.ts` 新增 `generateSslCertificate()` API 调用
- [x] 5.3 在 `frontend/src/views/SslList.vue` 顶部操作栏添加"生成国密证书"按钮
- [x] 5.4 实现按钮事件：打开 SslGenerateDialog，接收回调刷新列表
- [x] 5.5 在证书卡片上根据 `create_method` 显示来源标识

## 6. 验证与测试

- [x] 6.1 编写 `backend/tests/test_cert_generator.py` 单元测试
- [x] 6.2 验证后端单元测试全部通过（`cd backend && uv run pytest`）
- [x] 6.3 验证前端构建 —— 既有文件类型错误（SslFormDrawer 等），新增代码无错误
- [x] 6.4 端到端验证：本地生成国密证书成功，`create_method=local_generate` ✅
- [ ] 6.5 远程生成需集群节点 SSH 可达（环境限制，待有条件时验证）
- [ ] 6.6 发布到 Edge 节点需 Edge 环境（待有条件时验证）
