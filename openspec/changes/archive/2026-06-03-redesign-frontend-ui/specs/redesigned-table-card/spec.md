## Purpose

表格卡片容器组件，将标准表格包装在带 header 和 footer 的卡片中，提供统一样式。

## Requirements

### Requirement: 表格卡片容器结构

表格组件 SHALL 被包裹在卡片容器内，包含可选的 header 和 footer。

#### Scenario: 显示表格卡片
- **WHEN** 表格卡片渲染完成
- **THEN** 卡片顶部 SHALL 显示 header 区域（标题 + 可选计数）
- **AND** 卡片中部 SHALL 显示 Ant Design a-table
- **AND** 卡片底部 SHALL 可选的 footer 区域（含链接或分页信息）

#### Scenario: 表头样式
- **WHEN** 表格渲染
- **THEN** 表格表头 SHALL 使用浅色背景
- **AND** 表头文字 SHALL 小号大写（uppercase）
- **AND** 表头 SHALL 显示边框分隔线

#### Scenario: 表格行样式
- **WHEN** 表格数据行渲染
- **THEN** 行 SHALL 显示底部边框分隔线
- **AND** 最后一行 SHALL 不显示边框
- **AND** 鼠标悬停行 SHALL 显示浅色 hover 背景
- **AND** 奇偶行 SHALL 使用交替背景色

### Requirement: 表格卡片 footer

表格卡片 footer SHALL 支持查看全部链接或分页控件。

#### Scenario: Footer 链接
- **WHEN** 表格卡片有 footer 链接
- **THEN** footer SHALL 居中显示"查看全部 →"链接
- **AND** 链接 SHALL 使用品牌强调色
- **AND** 链接 SHALL 可点击跳转至对应管理页面
