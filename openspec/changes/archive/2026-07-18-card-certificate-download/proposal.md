## Why

SSL 证书卡片目前只有"查看"按钮可以查看证书详情并下载，操作路径较长。用户希望直接在卡片上就能下载证书文件，无需先打开查看弹窗。

## What Changes

- **卡片增加"下载"按钮** — 在 SSL 证书卡片的操作栏（查看/编辑/删除 旁边）增加"下载"按钮
- **弹出文件选择对话框** — 点击后弹出对话框，列出证书可下载的文件（cert、key、sign_cert、sign_key）
- **打包下载** — 用户勾选需要的文件后，点击下载，将选中的文件打包为 ZIP 下载
- **双证书支持** — 双证书模式下显示全部 4 个文件，单证书模式只显示 cert 和 key

## Capabilities

### New Capabilities
- `card-certificate-download`: SSL 证书卡片增加下载按钮，支持选择文件后打包 ZIP 下载

### Modified Capabilities
- `ssl-certificate-management`: SSL 证书列表卡片操作栏增加"下载"按钮

## Impact

- **前端新增**:
  - `frontend/src/components/SslCertDownloadDialog.vue` — 文件选择对话框
- **前端修改**:
  - `frontend/src/views/SslList.vue` — 卡片操作栏增加"下载"按钮
- **新依赖**: `jszip`（或使用原生 API 打包）
