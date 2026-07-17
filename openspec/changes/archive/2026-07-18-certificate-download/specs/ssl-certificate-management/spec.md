## DELTA: SSL 证书管理 — 增加文件下载

## MODIFIED Requirements

### Requirement: SSL 证书列表展示

#### Scenario: 查看界面增加下载
- **WHEN** 用户打开 SSL 证书查看弹窗
- **THEN** 每个 PEM 展示区域旁 SHALL 显示"下载"按钮
- **AND** 点击后下载对应的 `.pem` / `.key` 文件

#### Scenario: 生成成功快捷下载
- **WHEN** 国密证书生成成功
- **THEN** 成功提示中 SHALL 提供"下载证书"操作入口
- **AND** 点击后打开该证书的查看弹窗（用户可在查看界面下载文件）
