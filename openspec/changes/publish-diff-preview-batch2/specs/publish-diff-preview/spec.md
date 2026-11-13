# Spec Delta

## ADDED Requirements

### Requirement: SSL 证书链拼接的候选与基线一致性

SSL 证书的预览候选载荷 SHALL 包含发布 post_version_hook 的证书链拼接变换（CA 签发的证书实发 cert 字段 = 服务器证书 + CA 链），使候选与实发逐字段一致；漂移检测基线与预览平台侧变更的基线快照 SHALL 经同一镜像展开（按证书当前 CA 关联拼接），SHALL NOT 因拼接本身产生恒定噪声差异。

#### Scenario: 候选含证书链拼接

- **WHEN** 预览一张由 CA 签发的服务器证书
- **THEN** 候选载荷的 cert 字段 SHALL 与实际发布发送的拼接后内容一致（同一构造逻辑产出）

#### Scenario: 拼接不产生噪声差异

- **WHEN** 证书内容未变更，仅因 CA 链拼接导致快照与实发不同
- **THEN** 平台侧变更段 SHALL NOT 报出拼接本身，漂移检测 SHALL NOT 因拼接报漂移

## MODIFIED Requirements

### Requirement: 入口按钮状态范围

上游、路由、插件组、全局规则、插件元数据、SSL 证书（服务器证书卡片）、四层代理与 DNS 代理（列表行）的状态标签旁 SHALL 渲染差异预览按钮，覆盖「待发布」与「发布未完全生效（partial）」两种发布状态；「未发布」「已发布」状态 SHALL NOT 显示该按钮。按钮形态与行为 SHALL 一致（共享按钮组件，表格行与卡片形态通用，状态标签旁贴靠）。SSL 查看抽屉与四层/DNS 查看抽屉 SHALL NOT 渲染该按钮（列表行为主入口）。

#### Scenario: 待发布与 partial 显示

- **WHEN** 列表行或卡片的 pending_publish 为 true 或 last_publish_status 为 partial
- **THEN** 该行/卡片状态标签旁 SHALL 渲染预览按钮，悬浮提示「查看与 Edge 节点的差异」

#### Scenario: 其他状态不显示

- **WHEN** 列表行或卡片处于「未发布」或正常「已发布」状态
- **THEN** 该行/卡片 SHALL NOT 渲染预览按钮

#### Scenario: 四入口一致接入

<!-- publish-diff-preview-batch2：范围扩展至全部已接入类型的表格行与卡片形态（含 SSL 卡片），
     标题为稳定标识符保留 -->

- **WHEN** 已接入类型分别在独立页与统一管理 Tab（表格行或卡片）展示
- **THEN** 各入口 SHALL 经同一按钮组件与同一预览弹窗呈现，SHALL NOT 出现入口间行为分叉

### Requirement: 首批范围与类型注册表扩展

预览范围 SHALL 覆盖全部经统一发布编排的资源类型（上游、路由、插件组、全局规则、插件元数据、SSL 证书、四层代理与 DNS 代理）；类型接入 SHALL 经类型注册表驱动（复用漂移检测的类型注册表结构：edge_key/脱敏/normalize + 候选构造器；共用同一张表/同一快照类型的双形态资源 SHALL 以注册表双键 + 快照类型映射支持），新增类型零硬编码分支。不经统一发布编排的资源类型（静态资源、节点）SHALL 返回 400 并明示「该类型尚未接入发布差异预览」，SHALL NOT 静默当作无差异。

#### Scenario: 未接入类型明示拒绝

<!-- publish-diff-preview-batch2：七类全部接入，示例由 SSL 换为范围外类型（静态资源），标题为稳定标识符保留 -->

- **WHEN** 对不经统一发布编排的类型（如静态资源）请求预览
- **THEN** 端点 SHALL 返回 400，错误信息明示该类型未接入
