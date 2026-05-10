## Why

上游版本管理存在两个交互问题：1) 在版本列表中选择版本后，右侧详情面板显示空白而非 JSON 内容；2) 切换版本后关闭弹窗，点击上游列表的编辑按钮，打开的仍是旧版本内容而非切换后的版本。这两个问题严重影响用户体验，使用户无法确认当前查看/编辑的是哪个版本。

## What Changes

1. **修复 Bug 1**：版本列表选择后右侧 JSON 为空
   - **根因**：API 返回字段不一致
     - `plugin_metadata` 类型 API 返回 `metadata` 字段（正常工作）
     - `upstream/route` 类型 API 返回 `config` 字段（与前端接口 `ConfigVersion.metadata` 不匹配）
   - 前端 `ConfigVersion` 接口定义统一使用 `metadata`，导致 upstream/route 版本详情访问 `metadata` 时得到 `undefined`
   - **修复**：在 `VersionManagementModal` 中同时兼容 `metadata` 和 `config` 字段

2. **修复 Bug 2**：版本切换后编辑仍显示旧内容
   - **根因**：`ClusterList.vue` 中 `VersionManagementModal` 没有监听 `@published` 事件
   - `handleRepublish` 成功后只是刷新了版本历史，没有刷新上游列表
   - **修复**：在 `ClusterList.vue` 中监听 `@published` 事件，刷新上游列表后再打开编辑弹窗

## Capabilities

### New Capabilities
- `upstream-version-display`: 修复上游版本选择后正确显示版本详情 JSON
- `upstream-version-switch-refresh`: 修复版本切换后自动刷新上游列表

### Modified Capabilities
- 无（现有 spec 中无直接相关的版本管理规范，这是 Bug 修复而非功能变更）

## Impact

### 影响的代码文件
- `frontend/src/components/VersionManagementModal.vue`
  - `formattedConfig` 计算属性：同时兼容 `metadata` 和 `config` 字段
  - `handleRepublish` 成功后 emit `published` 事件
- `frontend/src/views/ClusterList.vue`
  - `VersionManagementModal` 组件添加 `@published` 事件监听
  - 实现 `versionModalOnPublished` 函数刷新上游列表

### 受影响的 API
- `POST /clusters/{clusterId}/upstreams/{upstreamId}/rollback/{version}` - 版本切换 API 本身正常
- `GET /clusters/{clusterId}/upstreams` - 需要在版本切换后重新拉取

### 共用代码注意事项
- `VersionManagementModal` 被 `upstream`、`route`、`plugin_metadata` 三种类型共用
- `plugin_metadata` API 返回 `metadata` 字段（正常）
- `upstream/route` API 返回 `config` 字段
- 修改 `formattedConfig` 时必须同时照顾两种情况，不能破坏 `plugin_metadata` 的正常工作

### 用户体验改进
- 选择版本后立即看到正确的 JSON 详情
- 切换版本后编辑确认看到的是最新版本内容
