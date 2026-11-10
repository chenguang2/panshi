# action-menu-explanations Specification

## Purpose
TBD - created by archiving change ux-action-menu-explanations. Update Purpose after archive.

## Requirements

### Requirement: 动作菜单分级解释规则

全站动作菜单（a-dropdown/a-menu）SHALL 按分级规则决定菜单项是否携带常驻解释（`menu-item-stack` 两行式：主文案 + small 说明）：满足「命名不自明 / 后果重且点击前不可见 / 有前置条件或禁用态」任一条的菜单项 SHALL 携带解释，解释 SHALL 写明何时需要、前置条件或后果边界，禁同义反复；高频且语义自明的菜单项（编辑 / 复制 / 详情 / 导出类）SHALL NOT 添加解释。

#### Scenario: 不自明的安装类动作携带解释

- **WHEN** 用户打开节点列表或集群节点页的「安装」菜单（安装 OpenResty / 安装 Edge / 关联新OpenResty / 升级Edge小版本）
- **THEN** 每个安装动作 SHALL 在主文案下方常驻一行解释，说明该动作装什么、装到哪、是否幂等或是否有危险确认

#### Scenario: 后果重的任务动作携带解释

- **WHEN** 用户打开任务菜单（取消 / 重试 / 删除任务）
- **THEN** 取消 SHALL 解释进程链终止与节点状态落点（已开始记「已取消」、未开始记「跳过」）；重试 SHALL 解释只重跑失败节点且上次日志按次数归档保留；删除 SHALL 解释仅删任务记录与留档、不影响节点已执行结果

#### Scenario: 前置条件在菜单项内透明

- **WHEN** 菜单项存在前置条件或禁用态（如网关删除被集群挂接、任务非终态不可重试）
- **THEN** 解释行 SHALL 说明前置条件或禁用原因，用户无需点击即可理解

#### Scenario: 自明项保持原样

- **WHEN** 菜单项为编辑 / 复制 / 详情 / 导出 Excel / 修改密码 / 退出登录等高频自明动作
- **THEN** SHALL NOT 为其添加解释行，菜单保持单行紧凑形态

### Requirement: menu-item-stack 共享实现单点

`menu-item-stack` 两行式菜单项样式 SHALL 全局单点定义（`frontend/src/styles/` 全局层），各页面 SHALL NOT 在页内重复定义该样式；RelayGateways 既有菜单迁移全局样式时 SHALL 保持 DOM 结构与解释文案零变化。

#### Scenario: RelayGateways 迁移共享样式

- **WHEN** 全局样式落地并迁移 RelayGateways 页内 scoped 定义
- **THEN** 中继表格「更多 ▾」与拓扑卡菜单的渲染结果（结构、文案、配色）SHALL 与迁移前一致，其既有测试 SHALL 继续全绿

#### Scenario: 新页面接入共享样式

- **WHEN** 任一页面按分级规则为菜单项添加解释
- **THEN** SHALL 直接使用全局 `menu-item-stack` 类，SHALL NOT 新增页内同名或同义样式定义
