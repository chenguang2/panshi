# Spec Delta

## MODIFIED Requirements

### Requirement: 入口按钮状态范围

上游、路由、插件组、全局规则、插件元数据的列表（各含独立页与统一管理 Tab，共十入口）SHALL 在「待发布」与「发布未完全生效（partial）」两种发布状态旁渲染差异预览按钮；「未发布」「已发布」状态 SHALL NOT 显示该按钮。十入口的按钮形态与行为 SHALL 一致（共享按钮组件，不逐页复制）。

#### Scenario: 待发布与 partial 显示

- **WHEN** 列表行的 pending_publish 为 true 或 last_publish_status 为 partial
- **THEN** 该行发布状态旁 SHALL 渲染预览按钮，悬浮提示「查看与 Edge 节点的差异」

#### Scenario: 其他状态不显示

- **WHEN** 列表行处于「未发布」或正常「已发布」状态
- **THEN** 该行 SHALL NOT 渲染预览按钮

#### Scenario: 四入口一致接入

<!-- publish-diff-preview-batch1：范围由上游/路由四入口扩展为五类资源十入口，标题为稳定标识符保留 -->

- **WHEN** 五类资源分别在独立页与统一管理 Tab 展示
- **THEN** 十个入口 SHALL 经同一按钮组件与同一预览弹窗呈现，SHALL NOT 出现入口间行为分叉

### Requirement: 首批范围与类型注册表扩展

预览范围 SHALL 为上游、路由、插件组、全局规则、插件元数据五类（SSL 证书与四层/DNS 代理留后续批次，未接入前按未接入类型处理）；类型接入 SHALL 经类型注册表驱动（复用漂移检测的类型注册表结构：edge_key/脱敏/normalize + 候选构造器），新增类型零硬编码分支。请求未接入的类型 SHALL 返回 400 并明示「该类型尚未接入发布差异预览」，SHALL NOT 静默当作无差异。

#### Scenario: 未接入类型明示拒绝

<!-- publish-diff-preview-batch1：示例由「插件组」换为批 2 未接入的「SSL」，标题为稳定标识符保留 -->

- **WHEN** 对未接入类型（如 SSL 证书）请求预览
- **THEN** 端点 SHALL 返回 400，错误信息明示该类型未接入
