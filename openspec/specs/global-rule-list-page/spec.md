# global-rule-list-page

## Purpose

全局规则侧边栏主页面（跨集群治理视图）的行为语义：页头生效语义、表单输入约束与提示、搜索/列表健壮性、空态分支与卡片网格自适应。

## Requirements

### Requirement: 全局规则主页面页头语义准确

主页面页头描述 SHALL 准确表达全局规则的生效语义。

#### Scenario: 页头描述
- **WHEN** 用户访问全局规则主页面
- **THEN** 页头描述 SHALL 说明「全局规则对所属集群的全部路由生效，修改后需发布才会在 Edge 节点生效」
- **AND** MUST NOT 使用「可被多个路由引用」等插件组语境描述（全局规则不是被引用，是直接全量生效）

### Requirement: 主页面表单输入约束与提示

#### Scenario: 名称长度约束前置
- **WHEN** 用户在创建/编辑表单输入名称
- **THEN** 输入框 SHALL 限制 `maxlength=100`（对齐后端约束），超长错误 MUST NOT 以后端英文校验信息形式暴露给用户

#### Scenario: 无插件提示
- **WHEN** 全局规则未选择任何插件
- **THEN** 卡片 SHALL 显示「未选择插件」，hover 说明「发布时将下发空插件集」，MUST NOT 显示「无插件」

### Requirement: 主页面空态两分支

#### Scenario: 空态区分与行动引导
- **WHEN** 主页面列表为空
- **THEN** SHALL 区分「暂无全局规则」（含「+ 添加全局规则」行动按钮）与「无匹配结果」（含「清空筛选」按钮）两种情况，MUST NOT 同一文案

### Requirement: 主页面搜索与列表健壮性

#### Scenario: 搜索框可用性
- **WHEN** 主页面渲染搜索框
- **THEN** SHALL 支持一键清空（allow-clear），图标 SHALL 使用与全站一致的图标字体/SVG，MUST NOT 使用 emoji

#### Scenario: 加载失败文案
- **WHEN** 主页面列表加载失败
- **THEN** 错误提示 SHALL 经 `getApiErrorMessage` 透出后端原因（「加载全局规则失败：{原因}」），MUST NOT 只提示「失败」

#### Scenario: 超量截断提示
- **WHEN** 列表数据超过卡片网格单次取数上限（500 条）被截断
- **THEN** 页面 SHALL 显示「仅显示前 500 条，请用筛选缩小范围」提示，MUST NOT 在计数显示真实总数的同时静默截断

### Requirement: 主页面卡片网格自适应

#### Scenario: 网格响应式
- **WHEN** 主页面在中等宽度视口渲染卡片网格
- **THEN** 网格 SHALL 以 `repeat(auto-fill, minmax(340px, 1fr))` 自适应列数，MUST NOT 固定 3 列造成中屏大量空白
