# Proposal

## Why

工具箱现有 14 个工具，每个工具只有头部一行灰字 hint，覆盖「是什么」；「什么时候用 / 前因后果 / 示例 / 坑」在站内站外都不存在（用户手册第 24 章仅一张一行用途表）。其中约一半工具与平台强绑定（Lua 互转↔插件预处理函数、SM4↔Edge 通道加密、时间戳↔naive UTC 存储约定、JWT↔登录 token 排查、Keepalived↔VRRP 部署、Base64↔脚本管道、IPv4/CIDR↔白名单录入），新接手的运维无法判断**什么时候该用哪个工具**，也容易踩已知坑（如时间串差 8 小时、YAML 丢注释、JWT 不验签）。

方案已经过示例页评审（`/tmp/opencode/tools-help-mockup/index.html`，三方案对比），用户选定 **方案 A · 抽屉**：不离开操作现场、边看边操作。

## What Changes

- 工具箱每个工具头部新增「帮助」入口（QuestionCircle 图标 + 文字），点击右侧滑出 480px 抽屉展示该工具的完整帮助文档，关闭即回到操作现场。
- 帮助文档统一六段骨架：① 这是什么 → ② 为什么需要它（前因后果）→ ③ 什么时候用 → ④ 怎么用 → ⑤ 示例（输入 → 输出）→ ⑥ 注意/坑。
- 帮助内容**单点定义**于 `frontend/src/config/toolHelp.ts`（按 tool key 索引），14 个工具全部覆盖，文档跟随当前工具切换。
- 抽屉内长内容可滚动（Keepalived 文档最长）；深链 `?tool=<key>` 行为不变。

不做（Non-goals）：帮助中心页 / 站内搜索 / markdown 渲染管线 / 后端接口；工具功能本身零改动。

## Capabilities

### New Capabilities

- `tools-help`: 工具箱每个工具的帮助文档系统——每工具六段式帮助内容、头部帮助入口、抽屉容器行为、内容单点与全覆盖守卫。

### Modified Capabilities

（无——`dev-tools` 既有需求不发生变化；工具头部新增帮助入口由 `tools-help` 的需求承载。）

## Impact

- 前端（纯前端，零后端）：`frontend/src/views/Tools.vue`（头部加帮助入口 + 抽屉）、新增 `frontend/src/config/toolHelp.ts`（内容单点）、可能新增一个轻量帮助抽屉组件。
- 测试：新增内容完整性守卫测试（每个工具 key 必有六段文档，源码扫描模式，同 `permissionGroups.source.test.ts` 范式）+ Tools 组件测试扩展（入口存在、点击开抽屉、内容跟随工具）。
- 依赖：无新增依赖（a-drawer 为 AntDV 4 既有组件）。
- 文档：用户手册第 24 章可在实现后补一段「帮助抽屉」说明（次要）。
