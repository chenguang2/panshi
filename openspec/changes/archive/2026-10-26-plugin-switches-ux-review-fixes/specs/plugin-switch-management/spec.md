# plugin-switches-ux-review-fixes 变更规格 — plugin-switch-management 域增量

## ADDED Requirements

### Requirement: 保存意图显式化（sticky 保存条）

插件开关页 SHALL 提供显式的保存模型：存在未保存变更时 SHALL 在视口内持续可见的位置展示保存条（含未保存项数、「放弃更改」与「保存配置」动作）；「放弃更改」SHALL 将全部开关还原为最近一次已保存状态；浏览器刷新/关闭 SHALL 有 beforeunload 级守卫；路由离开守卫 SHALL 提供「保存并离开」选项。

#### Scenario: 未保存状态始终可见
- **GIVEN** 用户拨动任一开关产生未保存变更
- **WHEN** 用户滚动到页面任意位置
- **THEN** 保存条 SHALL 保持可见并显示未保存项数，MUST NOT 仅在页底静态区域提示

#### Scenario: 放弃更改
- **WHEN** 用户点击「放弃更改」
- **THEN** 全部开关 SHALL 还原为最近一次已保存状态，未保存计数归零，MUST NOT 发起任何写请求

#### Scenario: 刷新/关闭守卫
- **WHEN** 存在未保存变更且用户刷新或关闭标签页
- **THEN** 浏览器 SHALL 弹出原生确认（beforeunload），MUST NOT 静默丢失变更

#### Scenario: 保存并离开
- **GIVEN** 存在未保存变更且用户点击侧边栏导航离开
- **WHEN** 离开守卫弹窗出现
- **THEN** SHALL 提供「取消 / 离开（放弃）/ 保存并离开」三个动作，且「保存并离开」SHALL 先完成保存（含引用警告流程）再放行导航

### Requirement: 引用影响前移可见

系统 SHALL 在用户切换开关**之前**暴露引用影响：`GET /plugin-switches` 响应 SHALL 为每个插件附带引用计数（`refs: {routes, plugin_configs, global_rules}`，复用既有引用扫描实现）；被引用的插件卡片 SHALL 展示引用徽标；禁用被引用插件时 SHALL 在卡片内即时展示后果说明（从可选清单移除、既有配置不受影响）。

#### Scenario: 卡片引用徽标
- **GIVEN** 某插件存在引用（如路由 2 处）
- **WHEN** 管理页渲染该插件卡片
- **THEN** 卡片 SHALL 显示「被引用 路由 2」徽标；无引用的插件 SHALL NOT 显示徽标

#### Scenario: 禁用被引用插件的即时警示
- **WHEN** 用户禁用一个 refs 非空的插件（未保存）
- **THEN** 卡片内 SHALL 即时展示行内警示（被引用 N 处；禁用后新配置不可选、既有配置继续生效），MUST NOT 等到保存后才首次告知

#### Scenario: GET 计数与 PUT 警告同源
- **WHEN** 实现引用计数
- **THEN** GET 计数与 PUT 保存后警告 SHALL 基于同一扫描实现，MUST NOT 出现两套口径

### Requirement: 批量操作闸门

「全部禁用」SHALL 经确认弹窗（列明影响与「需保存生效」语义）后执行；「全部启用」SHALL 经轻量确认；两者均只改变本地待保存状态并在文案中声明「需保存生效」。

#### Scenario: 全部禁用确认
- **WHEN** 用户点击「全部禁用」
- **THEN** SHALL 弹出确认（说明将标记全部插件禁用、保存后新配置将无可选插件），确认后才改变本地状态

#### Scenario: 批量操作不静默生效
- **WHEN** 用户完成任一批量操作
- **THEN** 页面 SHALL 处于未保存状态（保存条可见），MUST NOT 直接发起写请求

### Requirement: 保存结果反馈分层

保存成功且无引用警告时 SHALL 仅使用轻量 toast 反馈，MUST NOT 弹出强模态；存在引用警告时 SHALL 弹出说明性弹窗：文案 SHALL 解释后果（已从可选清单移除、既有引用继续生效）、按插件列出引用计数、并提供「查看引用」与「还原被引用插件」动作。

#### Scenario: 无警告保存
- **WHEN** 保存成功且无引用警告
- **THEN** SHALL 显示 toast 成功提示，MUST NOT 弹出需要点击关闭的模态

#### Scenario: 警告弹窗带后果与动作
- **WHEN** 保存产生引用警告
- **THEN** 弹窗 SHALL 说明「已从可选清单移除；既有配置中的引用将继续生效」，逐插件列出引用计数，并提供至少「查看引用」跳转与「还原被引用插件」快捷动作

### Requirement: 术语与状态可读

管理页 SHALL 使用运维用户可理解的中文文案：header 说明 SHALL 表达「控制新配置可选性、不影响既有配置」；schema 入口 SHALL 中文化（配置结构）；卡片 SHALL 以「技术名」标签呈现 plugin_name，MUST NOT 标注为版本；禁用卡片 SHALL 保持文字可读并区分「已保存禁用」与「未保存禁用」；面包屑 SHALL 与侧边栏分组一致（核心功能 / 插件开关）。

#### Scenario: 技术名不冒充版本
- **WHEN** 卡片渲染
- **THEN** plugin_name SHALL 以「技术名」语义呈现，MUST NOT 使用版本（version）类标签

#### Scenario: 禁用态可读且区分未保存
- **WHEN** 卡片处于禁用状态
- **THEN** 名称与描述 SHALL 保持可读（不做整卡深度淡出）；未保存的禁用 SHALL 有可见的待保存标识，与已保存禁用可区分

#### Scenario: 面包屑一致
- **WHEN** 用户访问插件开关页
- **THEN** 面包屑 SHALL 显示「核心功能 / 插件开关」，与侧边栏菜单分组一致
