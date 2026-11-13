## MODIFIED Requirements

### Requirement: 集群内上游表单交互

集群上游 Tab 的内联表单 SHALL 与全局 `UpstreamFormModal` 保持一致的关键交互语义（保存后发布引导、校验反馈、误关保护、概念 hint）；组件合并另立 change，本需求只约束行为。

#### Scenario: 保存成功提示语义
- **WHEN** 用户在集群内表单保存成功（新建/编辑/复制保存）
- **THEN** 系统 SHALL NOT 弹出成功 toast（`message.success`）
- **AND** 保存成功与「配置尚未发布」语义 SHALL 由随后的「稍后/立即发布」引导弹窗承担（标题「保存成功」，与全局表单一致）
- **AND** SHALL NOT 使用「上游已添加」等无发布语义文案
<!-- 2026-11-12 裁决（save-guide-single-feedback）：单通道，理由见 `save-feedback-single-channel`。 -->

#### Scenario: 校验失败自动切换到首个出错 Tab
- **WHEN** 用户在基础配置 Tab 点击保存且校验失败字段位于高级配置 Tab
- **THEN** 表单 SHALL 自动切换到首个含错误的 Tab 并定位错误提示
- **AND** 界面 SHALL NOT 表现为「点击保存无反应」

#### Scenario: 误关保护
- **WHEN** 表单存在未保存修改且用户点击 × 或「取消」
- **THEN** 系统 SHALL 经 `useOverlayModal` 确认「更改尚未保存，确定放弃？」
- **WHEN** 表单无修改
- **THEN** 关闭 SHALL NOT 出现确认

#### Scenario: 保存按钮文案
- **WHEN** 集群内表单打开（新建或编辑）
- **THEN** 提交按钮 SHALL 统一显示「保存」（与全局表单一致）

#### Scenario: 高级配置概念 hint 与中文占位
- **WHEN** 用户展开高级配置
- **THEN** 一致性哈希 Key SHALL 附 hint（header 填请求头名，cookie 填 Cookie 名）
- **AND** 超时三项 SHALL 附中文 hint 并使用中文占位符（SHALL NOT 使用 `connect/send/read` 英文占位）
- **AND** 权重校验失败 SHALL 提示「权重需为 1-100 的整数」
