## MODIFIED Requirements

### Requirement: SSL 证书操作弹窗

Edge 直连页面 SSL 证书 Tab 中的查看和删除弹窗 SHALL 与其他 Tab 风格一致。

#### Scenario: 查看弹窗
- **WHEN** 用户点击 SSL 证书行的「JSON」按钮
- **THEN** 系统 SHALL 打开页面的统一 JSON 弹窗（jsonModal），展示证书完整 JSON 数据
- **AND** 该弹窗与四层代理、上游等其他 Tab 的 JSON 查看弹窗风格一致

#### Scenario: 删除确认
- **WHEN** 用户点击 SSL 证书行的「删除」按钮
- **THEN** 系统 SHALL 弹出 `Modal.confirm` 确认对话框
- **AND** 确认后调用 DELETE API 删除证书
- **AND** 该确认弹窗与四层代理、上游等其他 Tab 的删除确认弹窗风格一致
