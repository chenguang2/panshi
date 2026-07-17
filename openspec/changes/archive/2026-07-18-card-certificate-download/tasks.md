## 0. 依赖

- [x] 0.1 安装 jszip 依赖（`cd frontend && npm install jszip`）

## 1. 文件选择对话框

- [x] 1.1 新建 `frontend/src/components/SslCertDownloadDialog.vue`
- [x] 1.2 实现对话框：接收 cert 数据作为 prop，按内容动态列出文件选项
- [x] 1.3 实现文件勾选逻辑，有内容则显示，默认全选
- [x] 1.4 实现 ZIP 打包：buildCertZip + jszip
- [x] 1.5 实现下载：downloadBlob 触发浏览器下载

## 2. 页面集成

- [x] 2.1 SslList.vue 卡片操作栏增加"下载"按钮
- [x] 2.2 点击按钮打开 SslCertDownloadDialog

## 3. 验证

- [x] 3.1 验证前端构建通过（零 TypeScript 错误）
- [x] 3.2 端到端验证：API 返回单证书和双证书数据完整
- [x] 3.3 单元测试验证：buildCertZip 正确生成 ZIP（14 个测试通过）
