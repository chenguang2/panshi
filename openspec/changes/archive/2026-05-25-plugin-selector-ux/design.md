## Context

PluginSelector 是路由/插件组配置的核心交互组件，此前经历了多轮修改（选中态、移除按钮、树形结构），但主题色未统一、页面背景染色等问题一直存在。

## Decisions

- **树形结构**: 分类标题 + 竖线 + 水平连接线，缩进 32px，2px 主题色半透明树线
- **选中态**: 改用 --p-color-primary 而非 --p-color-success，跟随主题色
- **右侧**: 保持单行列表，加 3px 左色条（继承分类颜色），hover 4% 高亮
- **主题背景**: tokens.css 基值改为 #f0f2f5，theme-light/dark 不再覆盖
- **现代模式**: 不设置 --p-bg-page，回退到 CSS 级联默认值
