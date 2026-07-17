## 1. SslViewDrawer 下载按钮

- [x] 1.1 实现 `downloadPem(content, filename)` 工具函数
- [x] 1.2 证书内容区域标题旁加下载按钮，下载 `{name}_cert.pem`
- [x] 1.3 私钥内容区域标题旁加下载按钮，下载 `{name}_key.pem`
- [x] 1.4 签名证书区域（双证书时）加下载按钮，下载 `{name}_sign_cert.pem`
- [x] 1.5 签名私钥区域（双证书时）加下载按钮，下载 `{name}_sign_key.pem`

## 2. 生成成功快捷入口

- [x] 2.1 SslGenerateDialog emit('success') 改为携带证书数据
- [x] 2.2 SslList.vue onGenerateSuccess 接收证书数据，toast 点击后打开查看弹窗

## 3. 验证

- [x] 3.1 验证前端构建通过（零 TypeScript 错误）
- [x] 3.2 端到端验证：证书生成成功，详情 API 返回完整数据
- [x] 3.3 端到端验证：双证书 cert/key/sign_cert/sign_key 全部有值
