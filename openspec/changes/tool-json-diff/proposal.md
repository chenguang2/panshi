## Why

工具箱缺少 JSON 对比功能，用户需要直观地比较两个 JSON 数据的差异，诊断配置不一致问题。

## What Changes

- 工具箱新增「JSON 对比」工具
- 两个 JSON 输入框（左侧 A、右侧 B），点击「对比」按钮
- 下方展示差异树，使用与版本管理相同的 diff 渲染逻辑
- 提取 diff 函数到独立工具模块复用

## Impact

- 新增 frontend/src/utils/tools/diff.ts（diff 核心逻辑）
- 修改 frontend/src/views/Tools.vue（新增面板 + 图标）
