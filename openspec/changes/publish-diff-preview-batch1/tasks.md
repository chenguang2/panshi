# Tasks

## 1. 三类候选载荷构造单点（发布主链路，先行回归）

- [ ] 1.1 RED：test_publish_candidate_single_source.py 扩展三域（cluster_plugin_configs / cluster_global_rules / cluster_plugin_metadata 的 publish 端点断言 build_candidate + 无内联构造），验证失败
- [ ] 1.2 GREEN：publish_preview.py 注册表 +3 build_candidate（plugin_config/global_rule/plugin_metadata，逐字抽取 publish 端点现文；plugin_metadata 引用既有 normalize 钩子）；三个 publish 端点改调共享构造，行为零变化
- [ ] 1.3 回归：`uv run pytest -k "plugin_config or global_rule or plugin_metadata or publish"` 全绿（含各域既有发布/回滚/版本断言）

## 2. 预览用例扩展（TDD）

- [ ] 2.1 RED：test_publish_preview.py 扩展——三类候选构造正确性（插件组/全局规则 plugins 解析形态、插件元数据 edge_data=config_data 本体）；三类 matrix/behind 各一条；未接入类型 400 示例换 SSL；plugin_metadata 按 id 定位 404
- [ ] 2.2 GREEN：如用例暴露注册表缺口（normalize/edge_attr 引用）最小修复；确认编排/端点零改动即满足
- [ ] 2.3 全量 pytest 收口（conftest 隔离库）

## 3. 前端六入口接线（TDD）

- [ ] 3.1 RED：PublishDiffButton.consumers.source.test.ts ENTRY_FILES 扩至 6 文件（按钮/弹窗/@publish/nowrap 断言），验证失败
- [ ] 3.2 GREEN：api/clusters.ts resourceType 类型放宽；PublishPreviewModal RESOURCE_LABELS + 联合类型扩展；六入口（PluginConfigList、ClusterPluginConfigs、GlobalRuleList、ClusterGlobalRules 两处逐一核实、PluginMetadataList、PluginMetadata）publish_status 单元格包 status-cell-flex + 按钮 + 弹窗挂载，「去发布」回接各页既有发布流程；已定宽发布状态列不足 200 的同步调整
- [ ] 3.3 前端验证：npx vue-tsc -b 0 error；六入口既有测试 + 新守卫全绿；全量 vitest run --maxWorkers=4 收口

## 4. 真实页面验收（#51：多渲染路径必须真实页面核对）

- [ ] 4.1 构造/选用插件组、全局规则、插件元数据的待发布（或 partial）真实数据，六入口逐一点开预览弹窗核对（矩阵/开关/结论条/去发布闭环），截图留档
- [ ] 4.2 插件元数据重点核对：Edge 展平信封形态下差异路径与漂移检测口径一致

## 5. 收口

- [ ] 5.1 AGENTS.md 约定 #77 的首批范围描述同步更新（五类已接入，SSL/四层 DNS 留批 2）
- [ ] 5.2 openspec validate --all 0 error；tasks 逐项打勾；git commit
