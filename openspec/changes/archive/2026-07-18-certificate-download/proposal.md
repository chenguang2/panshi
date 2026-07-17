## Why

SSL 证书查看界面目前只展示 PEM 文本，用户无法直接下载证书文件。运维人员需要将证书文件部署到其他系统或备份时，需要手动复制粘贴 PEM 内容再保存为文件，操作繁琐且容易漏掉换行符导致证书不可用。

## What Changes

- **查看界面增加下载按钮** — 在 SslViewDrawer 的每个 PEM 预览区域旁添加下载按钮，点击直接下载为 `.pem` / `.key` 文件
- **双证书支持** — 双证书模式下分别提供加密证书(cert)、加密私钥(key)、签名证书(sign_cert)、签名私钥(sign_key)的下载
- **生成成功快捷下载** — 证书生成成功后，message.success 通知中增加"下载证书"操作入口
- **存量证书同样支持** — 所有证书无论创建方式，均可在查看界面下载

## Capabilities

### New Capabilities
- `certificate-download`: SSL 证书文件下载，在查看界面提供 PEM 文件下载功能

### Modified Capabilities
- `ssl-certificate-management`: SSL 证书查看界面增加下载按钮，SSL 证书生成成功通知增加下载入口

## Impact

- **后端**: 无改动（PEM 内容已在现有 API 响应中）
- **前端修改文件**:
  - `frontend/src/components/SslViewDrawer.vue` — 每个 PEM 区域增加下载按钮
  - `frontend/src/components/SslGenerateDialog.vue` — 生成成功后 toast 增加下载操作
