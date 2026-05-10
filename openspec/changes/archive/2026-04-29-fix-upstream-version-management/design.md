## Context

上游版本管理功能允许用户查看历史版本、切换到指定版本、对比不同版本。但目前存在两个 Bug：

1. **Bug 1**：`VersionManagementModal.vue` 中选择版本后右侧 JSON 详情为空
   - 用户点击版本列表中的某个版本，右侧面板应该显示该版本的 JSON 配置
   - 但实际上显示的是"点击左侧版本号查看详情"的提示

2. **Bug 2**：版本切换后编辑仍显示旧内容
   - 用户在版本管理弹窗中切换到新版本（如 v3）
   - 关闭弹窗后点击上游列表的"编辑"按钮
   - 打开的编辑弹窗内容仍是切换**前**的旧版本

**问题根因分析**：

1. **Bug 1 根因**：API 返回字段不一致
   - `plugin_metadata` API (`/clusters/{clusterId}/plugin-metadata/{pluginName}/versions`) 返回 `metadata` 字段
   - `upstream/route` API (`/clusters/{clusterId}/upstreams/{upstreamId}/history`) 返回 `config` 字段
   - 前端 `ConfigVersion` 接口统一定义为 `metadata`，导致 upstream/route 版本详情访问时得到 `undefined`

2. **Bug 2 根因**：`ClusterList.vue` 中 `VersionManagementModal` 没有监听 `@published` 事件
   - `GlobalPluginSelector.vue` 正确监听了 `@published` 事件
   - `ClusterList.vue` 没有监听，导致版本切换后上游列表没有刷新

**相关文件**：
- `frontend/src/components/VersionManagementModal.vue` - 版本管理弹窗组件
- `frontend/src/views/ClusterList.vue` - 集群列表页面，包含上游管理
- `frontend/src/components/GlobalPluginSelector.vue` - 全局插件选择器（正确实现了 `@published` 监听，作为参考）

**约束**：
- 这是现有功能的 Bug 修复，不涉及 API 变更
- 只需要修改前端代码
- 必须注意共用代码，`plugin_metadata` 类型的正常工作不能被破坏

## Goals / Non-Goals

**Goals:**
- 修复版本选择后右侧 JSON 不显示的问题
- 修复版本切换后编辑上游时仍显示旧内容的问题

**Non-Goals:**
- 不修改后端 API
- 不破坏 `plugin_metadata` 类型的版本管理功能
- 不修改版本管理的核心交互逻辑

## Decisions

### Bug 1 修复：兼容 `metadata` 和 `config` 字段

**问题**：前端 `ConfigVersion` 接口使用 `metadata` 字段，但 upstream/route API 返回 `config`。

**解决方案**：修改 `VersionManagementModal.vue` 中 `formattedConfig` 计算属性，同时检查 `metadata` 和 `config` 字段：

```typescript
const formattedConfig = computed(() => {
  if (!selectedVersionData.value) return ''
  // 兼容两种字段名称：plugin_metadata 使用 metadata，upstream/route 使用 config
  const rawData = selectedVersionData.value.metadata || selectedVersionData.value.config
  if (!rawData) return ''
  try {
    if (typeof rawData === 'string') {
      return JSON.stringify(JSON.parse(rawData), null, 2)
    }
    return JSON.stringify(rawData, null, 2)
  } catch {
    return typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2)
  }
})
```

同时，`copyConfig` 和 `handleRepublish` 中也需要使用相同的方式获取配置数据。

### Bug 2 修复：监听 `@published` 事件刷新上游列表

**问题**：`ClusterList.vue` 中 `VersionManagementModal` 没有监听 `@published` 事件。

**解决方案**：
1. 在 `ClusterList.vue` 中 `VersionManagementModal` 组件添加 `@published` 事件处理
2. 实现 `versionModalOnPublished` 函数：
   - 刷新上游列表 (`loadUpstreams(cluster)`)
   - 根据 `versionModalResourceId` 找到更新后的上游对象
   - 自动打开编辑弹窗显示新版本内容

```typescript
// ClusterList.vue
const versionModalOnPublished = async () => {
  if (versionModalType.value !== 'upstream') return
  const cluster = clusters.value.find(c => c.id === versionModalClusterId.value)
  if (!cluster) return

  // 刷新上游列表
  await loadUpstreams(cluster)

  // 找到当前选中的上游（已切换到新版本）
  const updatedUpstream = cluster.upstreams?.find(
    (u: Upstream) => u.id === versionModalResourceId.value
  )
  if (updatedUpstream) {
    cluster.selectedUpstream = updatedUpstream
    editUpstreamByRecord(cluster, updatedUpstream)
  }
}
```

注意：`handleRepublish` 已经在成功后会调用 `emit('published', ...)`，只需要在 ClusterList 中监听即可。

## Risks / Trade-offs

[Risk] `formattedConfig` 修改可能影响 `plugin_metadata` 类型
→ [Mitigation] 代码同时检查 `metadata` 和 `config`，`plugin_metadata` 类型的 `metadata` 字段有值时会优先使用，不受影响

[Risk] `published` 事件处理可能触发多次刷新
→ [Mitigation] 只在 `versionModalType === 'upstream'` 时处理，其他类型（route、plugin_metadata）不处理

[Risk] 刷新上游列表后用户可能丢失选中状态
→ [Mitigation] 刷新后通过 `versionModalResourceId` 重新定位并选中，保持用户体验

## Open Questions

无

## Migration Plan

1. **部署**：直接替换修改后的前端文件即可，无数据库迁移需求
2. **回滚**：恢复到修改前的 `VersionManagementModal.vue` 和 `ClusterList.vue`
3. **测试验证**：
   - 测试上游：打开版本管理弹窗，选择某个版本，确认右侧 JSON 显示正确；切换版本后关闭，点击编辑，确认是新版本内容
   - 测试路由：同样验证
   - 测试全局插件：确认插件的版本管理仍然正常工作
