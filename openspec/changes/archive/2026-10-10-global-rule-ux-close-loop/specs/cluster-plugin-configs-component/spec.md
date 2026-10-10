# cluster-plugin-configs-component Delta

## ADDED Requirements

### Requirement: 插件组集群子页加载失败与空态区分

插件组集群子页 SHALL 区分「加载失败」「加载中」「空数据」三态（与全局规则集群子页同契约，共享 `useClusterPluginEntity` 失败态语义），MUST NOT 把接口失败吞成空态。

#### Scenario: 加载失败态
- **WHEN** 插件组列表接口请求失败（网络错误、5xx 等）
- **THEN** 页面 SHALL 显示失败提示（含经 `getApiErrorMessage` 透出的原因）与「重试」按钮
- **AND** MUST NOT 显示「暂无插件组」空态文案或引导创建
