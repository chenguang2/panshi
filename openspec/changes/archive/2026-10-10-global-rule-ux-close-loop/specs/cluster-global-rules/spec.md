# cluster-global-rules Delta

## ADDED Requirements

### Requirement: 全局规则删除确认展示集群级影响警示

删除全局规则 SHALL 在共享删除确认弹窗中展示「作用于全部路由」的影响警示，且两个入口一致。

#### Scenario: 集群级警示行
- **WHEN** 用户对全局规则触发删除（主页面或集群子页）
- **THEN** 删除确认弹窗 SHALL 展示集群级警示行（警示样式）：「全局规则作用于集群「{集群名}」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置」
- **AND** 该警示行 SHALL 以共享删除确认的可选参数实现，其他资源调用点默认行为不变（向后兼容，MUST NOT 波及既有资源文案）

#### Scenario: 既有提示保留
- **WHEN** 删除确认弹窗渲染
- **THEN** 既有「仅删除平台记录，Edge 节点将继续运行该全局规则」语义 SHALL 保留，与新增警示行并存（数据库 scope 与 Edge scope 语义分别可辨）

### Requirement: 全局规则插件口径统一专用清单

全局规则的可用插件集合 SHALL 两入口同源：以 features.yaml 专用 key `global_rule_plugins` 为准（共享表单单点过滤插件目录），MUST NOT 在前端维护任何入口级硬编码白名单；`enabled_plugins` 仅作为平台层硬上限并行生效，MUST NOT 被挪用承担本语义。

#### Scenario: 两入口同源
- **WHEN** 主页面与集群子页渲染全局规则表单的插件选择器
- **THEN** 可选插件集合 SHALL 由共享表单按 `global_rule_plugins` 清单过滤同一目录端点得出，MUST NOT 出现前端第二份入口级白名单（现状集群子页硬编码 `['traceid','monitor']` SHALL 删除）

#### Scenario: 清单调整
- **WHEN** 部署管理员调整 features.yaml `global_rule_plugins`
- **THEN** 两入口可用插件集合 SHALL 在下次进入表单后同步变化（mtime 热加载，免改代码、免重启）

#### Scenario: 空清单不限制
- **WHEN** `global_rule_plugins` 未配置或为空列表
- **THEN** 可用插件集合 SHALL 为插件目录全量（对齐 `enabled_plugins` 空列表惯例），MUST NOT 视为「不可选任何插件」

#### Scenario: 默认清单
- **WHEN** 本变更合入
- **THEN** `backend/features.yaml` SHALL 默认发 `global_rule_plugins: [traceid, monitor]`（集群子页现状精确保留，主页面全局规则表单收紧到该清单）
