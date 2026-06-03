## Purpose

自定义 section 分组式侧边栏导航，替代现有 Ant Design a-menu 实现，提供更专业的品牌呈现和导航体验。

## Requirements

### Requirement: 侧边栏品牌 Logo 区域

侧边栏顶部 SHALL 显示磐石品牌标识。

#### Scenario: 显示品牌 Logo
- **WHEN** 侧边栏渲染完成
- **THEN** 顶部 SHALL 显示"磐"字圆形图标 + "磐石" 文字 + "v1.0" 版本号
- **AND** "磐"字图标 SHALL 使用品牌色渐变背景
- **AND** 点击 Logo 区域 SHALL 导航至仪表盘

### Requirement: 侧边栏导航分组

侧边栏导航项 SHALL 按照 section 分组显示，每个分组有标题和多个导航项。

#### Scenario: 核心功能分组
- **WHEN** 用户加载任一认证后页面
- **THEN** 侧边栏 SHALL 显示"核心功能"分组
- **AND** 分组下 SHALL 包含：概览、集群管理、路由管理、上游管理、节点管理、插件组、全局规则、静态资源

#### Scenario: 系统管理分组
- **WHEN** 当前用户角色为 admin
- **THEN** "系统管理"分组 SHALL 显示
- **AND** 分组下 SHALL 包含：插件管理、用户管理

#### Scenario: 非管理员隐藏系统管理
- **WHEN** 当前用户角色非 admin
- **THEN** "系统管理"分组 SHALL 隐藏

#### Scenario: Edge功能分组
- **WHEN** 当前用户拥有 edge_nodes 权限
- **THEN** "Edge功能"分组 SHALL 显示
- **AND** 分组下 SHALL 包含：Edge直连、数据导入、工具箱

### Requirement: 导航项激活和交互

侧边栏导航项 SHALL 具有激活状态标识和 hover 交互效果。

#### Scenario: 当前页面高亮
- **WHEN** 用户导航至某页面
- **THEN** 对应的导航项 SHALL 显示激活状态（高亮背景 + 强调色文字）
- **AND** section 分组标题 SHALL 不高亮

#### Scenario: Hover 效果
- **WHEN** 鼠标悬停在导航项上
- **THEN** 导航项 SHALL 显示 hover 背景色
- **AND** 文字颜色 SHALL 变亮

### Requirement: 侧边栏底部用户信息

侧边栏底部 SHALL 显示当前登录用户信息和退出按钮。

#### Scenario: 显示用户信息和退出
- **WHEN** 侧边栏渲染完成
- **THEN** 底部 SHALL 显示用户头像（用户名首字）、用户名、角色
- **AND** SHALL 显示退出登录链接
- **AND** 点击退出 SHALL 执行登出并跳转至登录页

### Requirement: 侧边栏可折叠

侧边栏 SHALL 支持折叠/展开切换，目前通过顶部 header 的汉堡菜单按钮控制。

#### Scenario: 折叠侧边栏
- **WHEN** 用户点击汉堡菜单按钮
- **THEN** 侧边栏 SHALL 折叠为窄模式（仅图标）
- **AND** 导航文字、分组标题、底部用户信息 SHALL 隐藏
- **AND** 折叠状态 SHALL 跨页面导航保持
