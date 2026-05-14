## Context

集群删除流程需要安全增强。当前只有一行确认弹窗，直接调后端删除。

## Goals / Non-Goals

**Goals:**
- 删除前展示集群资源统计（节点、上游、路由、插件组、全局规则、元数据、版本历史）
- 二次确认需要输入集群名称
- 删除过程展示进度条和日志
- 后端同步清理 Edge 节点配置

**Non-Goals:**
- 不修改其他资源的删除流程
- 不引入新依赖

## Decisions

### Step 1: 后端新增 stats 接口
`GET /clusters/{id}/stats` 返回各资源类型的计数，前端弹窗时调用。

### Step 2: 后端改造 delete 接口
参考 `delete_upstream` 模式：先查询所有子资源 → 清理 ConfigVersion → 清理子表 → 删集群 → 遍历活跃 Edge 节点逐一调用 EdgeClient 的 delete 方法。

### Step 3: 前端两步弹窗
1. `Modal.confirm` + 自定义内容：资源统计列表 + 输入框（输入集群名称才可点击确认）
2. `Modal.info` + `buildDeleteProgressContent`：进度条 + 实时日志（复用现有模式）

## Risks / Trade-offs
- 大量历史版本删除可能耗时，进度条给用户反馈
- Edge 节点同步失败时数据库已删除，用日志提示手动处理
