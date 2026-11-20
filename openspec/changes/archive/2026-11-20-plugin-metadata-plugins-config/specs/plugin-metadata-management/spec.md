# Spec Delta

## MODIFIED Requirements

### Requirement: 新建插件元数据

用户 SHALL 能够在跨集群页面新建插件元数据；「添加」入口的可选插件集合 SHALL 由 features.yaml 顶层 `plugin_metadata_plugins` 清单控制（空/未配置 = 不限制，目录全量），MUST NOT 依赖写死在插件定义里的字段。

#### Scenario: 新建流程
- **WHEN** 用户点击 PageHeader 的"+ 添加插件元数据"按钮
- **THEN** 弹出新建 Modal，包含集群选择器和插件名称选择器
- **AND** 插件列表从 `GET /plugins/builtin` 获取，按 features.yaml 顶层 `plugin_metadata_plugins` 清单过滤后仅显示清单内且未配置的插件（清单空/未配置 = 不限制，目录全量）
- **AND** 点击"保存"后调用 `POST /clusters/{cluster_id}/plugin-metadata?plugin_name={name}` 创建空记录
- **AND** 创建成功关闭 Modal 并刷新列表
- **AND** 提示"创建后可在列表页编辑配置"

#### Scenario: 统一管理 Tab 添加入口同清单过滤
- **WHEN** 统一管理集群 Tab 的插件元数据面板展示可添加插件（目录分类卡片）
- **THEN** 可添加集合 SHALL 与独立页经同一份 `plugin_metadata_plugins` 清单过滤（空/未配置 = 不限制）
- **AND** 两入口 MUST NOT 各自维护第二套清单来源或写死过滤

#### Scenario: 已配置条目不受清单影响
- **WHEN** 某插件已在集群配置过元数据后被移出 `plugin_metadata_plugins` 清单
- **THEN** 该已配置条目 SHALL 仍显示、可编辑、可删除、可发布
- **AND** 清单 SHALL 仅约束「添加」入口的可选项

#### Scenario: 后端创建不做清单校验
- **WHEN** 以清单外的插件名调用 `POST /clusters/{cluster_id}/plugin-metadata?plugin_name={name}`
- **THEN** 后端 SHALL 维持既有行为正常创建（仅保留集群内查重拦截），MUST NOT 新增清单校验
- **AND** 清单定位为前端可选性门控而非安全边界（与全局规则清单同取舍；Edge 直连页另有第二写入路径，平台校验拦不干净）
