## 1. 后端：CommandLogEntry 数据结构和 Schema

- [x] 1.1 在 `backend/app/schemas/ssl.py` 中新增 `CommandLogEntry` Pydantic 模型，包含 `step`、`command`、`exit_code`、`stdout`、`stderr` 字段
- [x] 1.2 在 `SslCertificateResponse` 中增加可选字段 `generate_log: list[CommandLogEntry] | None = None`
- [x] 1.3 在 `frontend/src/types/ssl.ts` 中新增 `CommandLogEntry` TypeScript 接口

## 2. 后端：本地生成模式收集命令日志

- [x] 2.1 修改 `cert_generator.py` 的 `_run_openssl()` 返回增强信息（`CommandResult` 含 command、returncode、stdout、stderr）
- [x] 2.2 修改 `generate_sm2_keypair()`、`generate_rsa_keypair()`、`generate_ecdsa_keypair()` 返回 `(pem, logs)` 元组
- [x] 2.3 修改 `generate_csr()` 返回 `(csr_pem, logs)` 元组
- [x] 2.4 修改 `self_sign_certificate()` 返回 `(cert_pem, logs)` 元组
- [x] 2.5 修改 `generate_dual_certificates()`、`generate_standard_certificate()` 返回 `(result_dict, logs)` 元组
- [x] 2.6 修改 `LocalProvider.generate_certificate()` 收集并返回所有步骤的命令日志
- [x] 2.7 修改 `detect_openssl()` 接受 `detect_logs` 参数收集探测命令记录

## 3. 后端：远程生成模式收集命令日志

- [x] 3.1 修改 `_remote_generate_single()` 在 SSH 脚本中插入 `===PASHI_STEP:xxx===` 和 `===PASHI_EXIT:$?===` 标记，解析 stdout 分割出每步命令日志
- [x] 3.2 修改 `_remote_generate_dual()` 同样增加标记和解析逻辑
- [x] 3.3 确保远程模式的命令日志包含完整的 openssl 命令文本、独立退出码、错误输出

## 4. 后端：生成 API 返回命令日志

- [x] 4.1 修改 `_generate_local()` 将收集到的探测命令 + 生成命令日志附加到响应中
- [x] 4.2 修改 `_generate_remote()` 将收集到的探测命令 + 生成命令日志附加到响应中
- [x] 4.3 确保 `generate_ssl_certificate()` 端点返回的响应体包含 `generate_log` 字段

## 5. 后端：日志写入文件（Python logging）

- [x] 5.1 在 `cert_generator.py` 中配置 `logging.getLogger("cert_generate")` + 独立 FileHandler，写入 `logs/cert_generate.log`，JSON Lines 格式
- [x] 5.2 在 `_generate_local()` 中将每个命令步骤写入日志
- [x] 5.3 在 `_generate_remote()` 中将每个命令步骤写入日志
- [x] 5.4 探测阶段命令也写入日志，即使失败（自动包含在 all_logs 中）

## 6. 后端：DB 持久化命令日志

- [x] 6.1 在 `SslCertificate` ORM 模型中增加 `generate_log` Text 字段，可空
- [x] 6.2 在 `_generate_local()` 和 `_generate_remote()` 中，生成成功后将 `generate_log` JSON 序列化存入模型
- [x] 6.3 自动迁移：在 `migrate.py` 的 `COLUMN_MIGRATIONS` 中注册 `generate_log TEXT`

## 7. 前端：生成对话框展示真实命令

- [x] 7.1 修改 `SslGenerateDialog.vue` 的 `handleGenerate()`：移除假 setTimeout 步骤，改为等待 API 返回后直接用 `generate_log` 渲染
- [x] 7.2 新增命令展示区域：每个步骤显示名称、状态图标（✓/✗）、可折叠的命令详情
- [x] 7.3 失败时高亮错误步骤，展示 stderr 内容
- [x] 7.4 成功时全部步骤标记为绿色勾

## 8. 前端：证书详情展示生成日志

- [x] 8.1 修改 `SslViewDrawer.vue`，当证书 `create_method` 为 `local_generate` 或 `remote_generate` 且 `generate_log` 有值时，显示"生成日志"折叠面板
- [x] 8.2 复用命令日志展示组件展示 `generate_log` 内容

## 9. 测试

- [x] 9.1 后端单元测试：验证 `CommandLogEntry` schema 定义（`TestCommandLogEntry`）
- [x] 9.2 后端单元测试：验证本地生成模式返回正确的 `generate_log`（`TestGeneratorReturnsLogs`）
- [x] 9.3 后端单元测试：验证日志文件写入正确（`TestDetectOpenssl::test_collects_detect_logs`）
- [x] 9.4 后端单元测试：验证远程脚本标记解析逻辑（`TestRemoteMarkerParsing`）
- [x] 9.5 后端单元测试：验证探测命令收集（`TestDetectOpenssl::test_collects_detect_logs`）
