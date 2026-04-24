## Context

产品名"盘石"应为"磐石"，需要全局替换。同时当前左侧菜单布局需改为顶部水平菜单。

## Goals / Non-Goals

**Goals:**
- 将所有"盘石"修正为"磐石"
- 将左侧垂直菜单改为顶部水平菜单栏

**Non-Goals:**
- 不改变现有功能逻辑
- 不添加新的功能特性
- 不修改API接口契约

## Decisions

### 1. 产品名修正
- 使用全局搜索替换：`盘石` → `磐石`
- 范围：前端Vue组件、后端Python文件、配置文件

### 2. 菜单布局调整
- 当前：`DefaultLayout.vue` 使用 `<a-layout-sider>` 左侧导航
- 修改为：使用 `<a-menu>` 顶部水平布局
- 组件库：Ant Design Vue Menu 支持顶部水平模式

## Risks / Trade-offs

- [Risk] 菜单响应式：顶部菜单在小屏幕需要处理 →  Mitigation: 使用 Ant Design 响应式功能
- [Risk] 测试兼容性：现有 Playwright 测试基于左侧菜单 → Mitigation: 更新测试选择器

## Migration Plan

1. 修改 `DefaultLayout.vue` 菜单结构
2. 全局替换"盘石"为"磐石"
3. 更新单元测试和Playwright测试
4. 验证构建和测试通过