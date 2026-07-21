## MODIFIED Requirements

### Requirement: 上传 SSL 证书（增加生成入口）

系统 SHALL 支持上传新的 SSL 证书或通过生成方式创建证书，数据存到 DB。上传/编辑表单中增加 mTLS 双向认证配置区域。

#### Scenario: 打开上传表单（新增 mTLS 配置）
- **WHEN** 用户点击"添加已有证书"按钮
- **AND** 证书类型为 `"server"`
- **THEN** 弹出表单，包含现有字段及新增的可折叠"双向认证 (mTLS)"配置区域
- **AND** mTLS 区域包含以下字段：
  - `client_ca`：CA 证书内容（Textarea，PEM 格式粘贴，可选）
  - `client_depth`：证书链校验深度（数字输入，默认 1，可选）
  - `skip_mtls_uri_regex`：跳过 mTLS 的 URI 正则列表（独立输入框 + "添加"按钮，每行一条，右侧删除按钮，可选）

#### Scenario: 客户端证书类型隐藏 mTLS
- **WHEN** 用户点击"添加已有证书"按钮
- **AND** 证书类型选择为 `"client"`
- **THEN** mTLS 配置区域 SHALL 隐藏
- **AND** 切换回 `"server"` 时 SHALL 重新显示

#### Scenario: 非国密隐藏 mTLS
- **WHEN** 用户打开上传表单
- **AND** 未勾选"国密双证书"（`gm=false`）
- **THEN** mTLS 配置区域 SHALL 隐藏

#### Scenario: 取消国密时清空 mTLS
- **WHEN** 用户编辑一个 `gm=true` 的证书，取消勾选"国密双证书"
- **THEN** 提交保存后后端 SHALL 将 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 清空为 null

#### Scenario: 编辑时回填 mTLS 数据
- **WHEN** 用户编辑已有 SSL 证书
- **AND** 该证书的 `client_ca` 不为空
- **THEN** mTLS 区域展开后 SHALL 回填 `client_ca`、`client_depth`、`skip_mtls_uri_regex` 的值

### Requirement: 发布 SSL 证书到 Edge

系统 SHALL 支持将 SSL 证书发布到集群的 Edge 节点，并记录版本历史。发布时根据配置携带 `client` 对象用于 mTLS 双向认证。

#### Scenario: 发布流程（携带 client 配置）
- **WHEN** 用户点击证书卡片的"发布"按钮
- **AND** 证书的 `client_ca` 不为空
- **THEN** 调用 `EdgeClient.api("ssl", "update", edge_uuid, data)` 时
- **AND** `data` SHALL 包含 `client` 对象：`{"ca": client_ca, "depth": client_depth, "skip_mtls_uri_regex": [...]}`
- **AND** 当 `client_ca` 为空时，`data` SHALL 不包含 `client` 字段（现有行为不变）
- **AND** 非国密证书（`gm=false`）即使有 `client_ca` 值也不发送 `client` 字段

### Requirement: 生成国密证书对话框

系统 SHALL 在 SSL 证书生成对话框中增加 mTLS 配置。mTLS 区域与"同时生成客户端证书"复选框解耦。

#### Scenario: 国密 server 证书显示 mTLS 区域
- **WHEN** 用户打开生成国密证书对话框
- **AND** 证书类型为 server
- **THEN** 对话框 SHALL 显示可折叠的"双向认证 (mTLS)"区域

#### Scenario: 勾选客户端证书时自动填充 CA
- **WHEN** 用户勾选"同时生成客户端证书"
- **AND** `client_ca` 当前为空
- **THEN** 自动将所选 CA 证书 PEM 填入 `client_ca`

#### Scenario: 未勾选也可手动配置
- **WHEN** 用户未勾选"同时生成客户端证书"
- **THEN** 仍可展开 mTLS 区域手动填写 `client_ca`、`client_depth`、`skip_mtls_uri_regex`（`skip_mtls_uri_regex` 为列表输入，每行一条正则，通过"添加"和"删除"按钮管理）
