## Context

前端 5 个 resource composable 的 delete 函数都使用 `showDeleteConfirm` + `onOk` 回调，但回调体是 100+ 行的重复代码（progress modal 创建、API 调用、edge results 处理、刷新）。后端 6 个 publish endpoint 也有重复的 node 迭代循环（EdgeClient 创建、加密、日志、成功/失败计数）。

## Goals / Non-Goals

**Goals:**
- 前端: 将 delete 的 progress 回调提取为 `executeDeleteWithProgress` 放在 `useClusterUtils.ts`
- 后端: 将 publish 的 node 循环提取为 `_publish_to_nodes` 放在共享模块
- 删除约 600 行重复代码

**Non-Goals:**
- 不改业务逻辑
- 不改 API 响应格式
- 不改数据库 schema

## Decisions

1. **前端: executeDeleteWithProgress**: 复用 `buildDeleteProgressContent` 模式，新函数接受 `title`、`apiEndpoint`、`cluster`、`refreshFn`、`clearSelectedFn` 参数。所有 5 个 composable 的 onOk 回调替换为 1 行调用。
2. **后端: _publish_to_nodes**: 放在 `app/api/v1/common.py`。接受 active_nodes、edge_data、edge_api_callable、logger_callable 参数。返回 results/success_count/fail_count。
3. **每个 endpoint 保持独特的 data_prep 逻辑不变** - 只提取 node 迭代部分。

## Risks / Trade-offs

- 后端 `_publish_to_nodes` 需要传递不同的 EdgeClient 方法和 logger 方法作为 callable
- 前端改动后需要运行路由 publish E2E 测试验证不破坏功能
