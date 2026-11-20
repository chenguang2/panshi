# page-header-actions 变更规格

## ADDED Requirements

### Requirement: 页头动作区承载范围与主次

页头动作区（`PageHeader` 的 `#actions` 槽）SHALL 只承载页面级动作：创建类、导入/导出类、页面级模式或跳转类。
行内动作、工具条动作（刷新/列配置/分组收起）、批量选中后的动作、破坏性动作 SHALL NOT 出现在页头。
每页 SHALL 至多一颗 `.btn-primary`，且恒为动作区最右一颗；其余按钮 SHALL 为 `.btn-secondary`。

#### Scenario: 主操作恒为主色且最右

- **WHEN** 页面渲染页头动作区
- **THEN** 动作区内 `.btn-primary` 数量不超过 1
- **THEN** 若存在 `.btn-primary`，它是动作区最后一个按钮

#### Scenario: 破坏性动作不进页头

- **WHEN** 页面存在删除类或其它破坏性操作入口
- **THEN** 该入口不出现在页头动作区（归行内动作或批量条）

### Requirement: 页头按钮图标

创建/新建/添加类按钮 SHALL 使用 `StrokeIcon` 的 `plus`；导入类 SHALL 使用 `upload`；下载/导出类 SHALL 使用 `download`。
图标尺寸 SHALL 为 13px、`stroke-width: 2`，位于文案左侧，间距由按钮自身 `gap` 提供。
批量管理、跳转、查看类按钮 SHALL 不带图标。页头按钮 SHALL NOT 内联复制 `<svg>`。

#### Scenario: 创建类按钮带加号图标

- **WHEN** 页头渲染「新建/添加」类按钮
- **THEN** 按钮内文案左侧渲染 13px 的 `plus` 图标
- **THEN** 按钮文案本身不含 `+` 或 `＋`

#### Scenario: 批量管理与跳转类不带图标

- **WHEN** 页头渲染「批量管理」「插件开关」「查看安装指引」「前往 CA 根证书下载」类按钮
- **THEN** 按钮内不渲染图标

### Requirement: 页头按钮文案

页头按钮文案 SHALL 为「动词 + 名词」，长度不超过 8 个汉字，且 SHALL NOT 带 `+` 或 `＋` 前缀。
同一域内动词 SHALL 保持一致。

#### Scenario: 禁止加号前缀

- **WHEN** 页面渲染任意页头按钮
- **THEN** 按钮文本不以 `+` 或 `＋` 开头

### Requirement: 页头动作区顺序与布局

动作区按钮顺序 SHALL 为：批量管理 → 导入/导出类 → 创建类。
按钮间距 SHALL 只由容器提供；页头按钮 SHALL NOT 使用内联 `margin-left` / `margin-right`。
按钮 SHALL 为 `flex-shrink: 0`，标题与描述列可收缩。

#### Scenario: 批量管理在创建类左侧

- **WHEN** 页面同时存在批量管理与创建类按钮
- **THEN** 批量管理位于创建类按钮左侧

#### Scenario: 间距不由按钮内联样式提供

- **WHEN** 页面渲染页头动作区
- **THEN** 动作区按钮不带 `style="margin-left: …"` 或 `style="margin-right: …"`

### Requirement: 页头动作权限

无权限的页头动作 SHALL 整颗不渲染（`v-if`），不以禁用态或置灰形式出现。

#### Scenario: 无权限不出现入口

- **WHEN** 当前用户缺少某页头动作所需权限
- **THEN** 该按钮不渲染（既非 disabled 也非置灰）

### Requirement: 设计页与实现动作集一致

设计页 `docs/ui/Live-Artifact-5/proposal-c/*.html` 的页头动作区 SHALL 与本页实现的按钮集一一对应：数量、顺序、主次、文案、图标有无。
新增或退役页头按钮时 SHALL 同步修改设计页与实现两侧。

#### Scenario: 实现新增按钮同步设计页

- **WHEN** 实现侧页头新增一颗按钮
- **THEN** 对应设计页 HTML 同步补同形按钮（同文案、同主次、同图标）

#### Scenario: 设计页条目已另置时须裁决

- **WHEN** 设计页存在某按钮而实现已把它放到页面其它区域（横幅/折叠面板/独立页）
- **THEN** 先裁决「回填实现」或「删除设计页条目」，再同步两侧，不得两侧长期并存
