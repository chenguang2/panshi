# Design

## Context

机制零改动：预览端点/编排/diff 机器（`publish_preview.preview_publish_diff`、`diff_edge_payload`、采集）全部类型无关，注册表天然支持新键。主 spec 已随 publish-diff-preview 归档生成（2026-11-13），本变更 MODIFIED 其范围需求。

三类载荷构造（publish 端点现文，逐字抽取为 build_candidate）：
- `plugin_config`（cluster_plugin_configs.py）：`config_data = {id, edge_uuid, name, description, plugins=json.loads(config)}`；`edge_data = {desc: name, plugins: parsed or {}}`
- `global_rule`（cluster_global_rules.py）：同插件组形态（rule.plugins 解析）
- `plugin_metadata`（cluster_plugin_metadata.py）：`config_data = {plugin_name, config_data: parsed}`；`edge_data = parsed config 本体`（注意：publish 路径按 plugin_name 定位资源，预览端点按 id 定位——注册表 model=PluginMetadata、edge_attr=plugin_name，两者不冲突）

入口现状（6 处均已渲染 PublishStatusTag，列表响应已输出 pending_publish/last_publish_status，无列表端点改动）：PluginConfigList、ClusterPluginConfigs（Tab）、GlobalRuleList、ClusterGlobalRules（Tab，两处 PublishStatusTag——90 行处为卡片/详情形态，接线时逐处核实）、PluginMetadataList、PluginMetadata（统一管理 Tab 组件）。

## Goals / Non-Goals

**Goals:**
- 三类资源的预览与发布同源（builder 抽取 + publish 端点改调 + 守卫逐域扩展）
- 六入口按钮/弹窗一致接入，「去发布」回接各页面既有发布流程
- 上游/路由批次沉淀的列宽经验直接沿用（status-cell-flex + 定宽≥200）

**Non-Goals:**
- SSL 证书（卡片 UI、无 partial、入口形态待拍板）、四层/DNS 代理（同表双载荷形态，注册表需双键）——批 2 单独立项
- 不改预览端点/编排/弹窗机制（仅 resourceType 联合类型与 labels 扩展）
- 不改列表端点（三类 pending 字段均已接线）

## Decisions

**D1 builder 逐字抽取，不做任何「顺手优化」。**
三个 builder 复制 publish 端点现有构造代码（含 `or {}`、json.loads 边界），publish 端点改调后由各域既有发布测试回归兜底（plugin_config/global_rule/plugin_metadata 域 pytest -k 收口）。守卫 test_publish_candidate_single_source.py 扩展三个域（断言 build_candidate 调用 + 无内联构造）。

**D2 plugin_metadata 注册表键与快照类型。**
注册表键 `plugin_metadata`（model/edge_attr/edge_key/mask/normalize 引用 DRIFT_TYPE_REGISTRY 单一事实源）。normalize（展平 {plugin_name, config_data} 信封）既有钩子直接生效：候选先 normalize 再与节点条目 diff，与漂移检测同构。快照查询按 resource_type='plugin_metadata'，publish 留痕即此类型，无需快照类型映射。

**D3 弹窗扩展仅动类型层。**
`PublishPreviewModal.props.resourceType: 'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'plugin_metadata'`；RESOURCE_LABELS 补 插件组/全局规则/插件元数据。弹窗渲染逻辑零改动（响应形状类型无关）。

**D4 入口接线两态显隐沿用。**
六入口 PublishDiffButton 显隐 = pending===true || lastPublishStatus==='partial'（与上游/路由同款，PublishDiffButton 组件自判）；「去发布」emit 回接各页面既有发布入口（PluginConfigList/ClusterPluginConfigs 的 publishXxx、GlobalRuleList/ClusterGlobalRules 同理、PluginMetadataList/PluginMetadata 的发布函数——实施时逐页核对既有函数名）。发布状态单元格包 status-cell-flex（style.css 单点）；发布状态列如已定宽且 <200 同步调至 200（实施时核实六入口列宽，独立页 auto 不动）。

**D5 测试与守卫。**
- 后端：test_publish_preview.py 扩展三类用例（候选构造正确性：插件组/全局规则 plugins 解析、插件元数据 edge_data 本体；400 未接入类型示例换 SSL）；端点 404 语义三类各一条（plugin_metadata 按 id 定位）。
- 前端：consumers 守卫源码测试 ENTRY_FILES 扩至 6 文件（nowrap + 按钮存在 + @publish）；PublishPreviewModal 类型放宽的既有用例不动。
- 发布域回归：`pytest -k "plugin_config or global_rule or plugin_metadata or publish"` 全绿；前端 6 入口既有测试全绿。

## Risks / Trade-offs

- **发布主链路 3 处调用侧改造**：与上游/路由批次同性质（已有先例与守卫），风险受控；逐域跑既有发布测试兜底。
- **ClusterGlobalRules 双 PublishStatusTag 位置**：接线时逐处核实（卡片形态处是否也接按钮）——原则：列表行接，非列表形态（详情卡片）不接，与 D4 抽屉不加按钮的批 2 拍板精神一致。
- **plugin_metadata 候选与漂移基线的信封差异**：normalize 钩子已覆盖（漂移检测实测真实抓形），预览复用同钩子，无新增风险。
