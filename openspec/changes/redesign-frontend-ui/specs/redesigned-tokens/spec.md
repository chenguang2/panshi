## Purpose

扩展现有 CSS 设计 token 体系，补充设计样稿中的字体、阴影、圆角变量，保持与现有主题系统兼容。

## Requirements

### Requirement: 新增展示字体 token

系统 SHALL 新增展示字体变量用于品牌标题。

#### Scenario: 定义展示字体变量
- **WHEN** CSS 变量定义加载
- **THEN** SHALL 存在 `--font-display` 变量，值为系统展示字体栈

### Requirement: 新增等宽字体 token

系统 SHALL 扩展等宽字体变量用于代码和数值展示。

#### Scenario: 定义等宽字体变量
- **WHEN** CSS 变量定义加载
- **THEN** SHALL 存在 `--font-mono` 变量，其值与 `--p-mono` 一致

### Requirement: 所有新组件使用 token

所有新增组件 SHALL 引用 CSS 变量而非硬编码色值。

#### Scenario: 组件引用 token
- **WHEN** 新组件（Sidebar、StatCard、TableCard 等）渲染
- **THEN** 所有颜色、阴影、圆角、间距 SHALL 引用 `--p-*` 或 `--font-*` CSS 变量
- **AND** 不硬编码任何色值

### Requirement: 兼容现有主题

新增 token SHALL 与现有 theme-light.css / theme-dark.css 兼容。

#### Scenario: 暗色模式兼容
- **WHEN** 用户切换到暗色模式
- **THEN** 新组件 SHALL 自动适配暗色背景色和文字色
- **AND** 无需额外样式覆盖
