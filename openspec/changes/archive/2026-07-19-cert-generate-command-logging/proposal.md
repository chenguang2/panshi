## Why

用户点击"生成并保存"证书时，后端执行了复杂的 openssl 命令链（本地 subprocess 或远程 SSH 脚本）。这些命令完成后即丢弃，没有任何记录。当证书生成失败或出现兼容性问题时，运维人员无法追溯当时执行了哪些命令，排查困难。

## What Changes

1. **后端记录命令日志**：在证书生成过程中，将所有执行的 openssl 命令（含参数、退出码、输出）记录到日志文件 `logs/edge/cert_generate.log`
2. **API 响应返回命令日志**：`POST /clusters/{id}/ssl/generate` 的响应新增 `generate_log` 字段，包含分步骤的命令执行记录
3. **前端展示真实命令**：`SslGenerateDialog` 的进度条从假动画改为显示真实执行的命令，每个步骤可查看完整命令和输出
4. **证书详情可追溯**：在证书查看弹窗或详情中展示生成时的命令记录

## Capabilities

### New Capabilities
- `cert-generate-command-log`: 证书生成命令的日志记录与展示能力，包括后端日志落地、API 返回命令记录、前端命令展示

### Modified Capabilities
- `ssl-certificate-generation`: 生成 API 的响应结构变更（新增 `generate_log` 字段），前端生成对话框的进度展示方式变更（从假动画改为真实命令展示）

## Impact

- **后端** `backend/app/api/v1/cluster_ssl.py`：`_generate_local()` 和 `_generate_remote()` 收集命令执行记录
- **后端** `backend/app/services/cert_generator.py`：`_run_openssl()` 返回命令和输出信息
- **后端** `backend/app/services/edge_logger.py`：新增 `log_cert_generate()` 方法
- **后端** `backend/app/schemas/ssl.py`：`SslCertificateResponse` 增加 `generate_log` 可选字段
- **前端** `frontend/src/components/SslGenerateDialog.vue`：进度条从假 setTimeout 改为真实命令展示
- **前端** `frontend/src/types/ssl.ts`：`SslCertificateResponse` 类型增加 `generate_log`
- **日志目录** `logs/edge/cert_generate.log`：新增日志文件
