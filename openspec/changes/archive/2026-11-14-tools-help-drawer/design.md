# Design

## Context

工具箱为单页实现（`frontend/src/views/Tools.vue`，路由 `/tools`）：左侧 132px 竖排导航 + 右侧 `tool-panel` 工作区，14 个工具的面板各自为独立 template 块，头部 `tool-header` 已有「标题 + 一行 hint + spacer + 清空」的重复模式。前端无 markdown 渲染依赖；AntDV 4 可用（项目已有 `PluginEditorDrawer.vue` 等抽屉先例）。方案选型经示例页评审（`/tmp/opencode/tools-help-mockup/index.html`）确定方案 A · 抽屉，动机见 proposal.md，行为契约见 specs/tools-help/spec.md。

## Goals / Non-Goals

**Goals:**

- 14 个工具每个都有六段式帮助文档，在工具页内以抽屉查看，不打断操作现场。
- 帮助内容单点定义、可守卫（新增工具漏配文档时测试红）。
- Tools.vue 净增改动最小化（页面已 1400+ 行）。

**Non-Goals:**

- 不做帮助中心页、站内搜索、markdown 渲染管线；不加后端接口与依赖。
- 不改任何工具的功能行为与现有深链（`?tool=<key>`）语义。

## Decisions

**D1 容器 = a-drawer（方案 A）**。备选：帮助中心页（B，离开操作现场、多一个导航形态）、居中弹窗（C，长文档憋屈）——均已在示例页评审中对比并由用户裁决放弃。a-drawer 为 AntDV 既有组件，遮罩/Esc/宽度由组件管理，不自研。

**D2 内容单点 `frontend/src/config/toolHelp.ts`**。`Record<ToolKey, ToolHelpDoc>`，ToolKey 与 `Tools.vue` 的 `tools` 数组 key 一致（lua/url/json/sm4/base64/yaml/diff/timestamp/jwt/convert/textdiff/ipcalc/hash/keepalived）。守卫测试 `toolHelp.source.test.ts` 源码扫描 `Tools.vue` 的 tools 数组，断言每个 key 都有六段非空文档——范式同 `permissionGroups.source.test.ts`（源码红线型守卫）。备选「内容内联在 Tools.vue」被否：页面已过大，且内容与容器生命周期不同（内容更新频繁、容器稳定）。

**D3 结构化字段而非自由 markdown**。`ToolHelpDoc = { what, why, when: string[], how: string[], example: { input, output, note? }, cautions: string[] }`，六段即六个类型化字段，由单一渲染组件输出统一段落骨架。理由：项目无 markdown 依赖（不为此新增）；类型系统天然保证骨架完整（漏字段即类型错误）；渲染样式可控（示例段 mono 块、注意段警告块）。

**D4 Tools.vue 最小侵入接线**。新增独立组件 `components/ToolHelpDrawer.vue`（消费 toolHelp.ts，单一实例挂在 Tools.vue）；`tool-header` 在「清空」左侧加一行「? 帮助」按钮——14 个面板各一行、与既有「清空」按钮的重复模式一致，不抽公共 Header 组件（备选「抽 ToolPanelHeader 子组件」被否：一次性重构 14 个面板头部，回归面大、收益仅为消除与现状并存的重复，违反 #11 的最小原子改动判据）。

**D5 内容由主会话撰写**。14 份六段文案需要平台上下文（naive UTC 存储约定、Edge 通道默认 SM4 密钥、Base64 脚本管道、JWT pwd_ver 吊销、keepalived 五处节点差异、pre_functions 等），上下文在主会话而非实现者；示例值优先取 `dev-tools` spec 既有场景中的真实值（如 `MD5("abc")=90015098…`、URL 编码样例）。文案遵守站内用语红线（如恢复≠导入的撞词教训）。

**D6 验证链（TDD）**：守卫测试先写先红（无 toolHelp.ts）→ 实现 config + 组件 + 14 处入口转绿 → Tools 组件测试扩展（入口存在 / 点击开抽屉 / 内容跟随 activeTool / 关闭还原）→ `npx vue-tsc -b` + 定向 `npx vitest run --maxWorkers=4`（#58）→ **验收落在真实页面**（#51：dev 环境 localhost:12345 工具箱页 Playwright 截图确认抽屉真实渲染与滚动行为，jsdom 断言不能替代）。

## Risks / Trade-offs

- [Tools.vue 与新组件模板层 vue-tsc 盲区（#25：多语句属性内联会被 prettier 重排破坏编译且 -b 不报）] → 事件处理器一律提取为 script 函数，禁止模板内多语句。
- [帮助内容随平台演进陈旧（如默认 SM4 密钥变更）] → toolHelp.ts 每条目注释标注依据出处（约定编号 / spec 场景），修正时单点可达（D2 守卫）。
- [抽屉打开时盖住 480px 工作区，小屏感知明显] → 接受（示例页评审已确认该形态）；后续若要总览入口，可再加导航项（内容已单点，增量成本低）。

## Migration Plan

纯前端增量改动，无数据迁移。回滚 = 还原 `Tools.vue` 的小段 diff + 删除 `toolHelp.ts`、`ToolHelpDrawer.vue` 及测试文件。

## Open Questions

（无阻塞项。14 份文案的具体措辞在实现中产出，验收时在真实页面上直接评审。）
