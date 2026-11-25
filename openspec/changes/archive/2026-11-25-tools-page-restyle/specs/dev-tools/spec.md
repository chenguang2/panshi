# dev-tools Delta

## MODIFIED Requirements

### Requirement: 工具箱页面布局
<!-- 2026-11-14 tools-arrow-sweep-layout：「YAML 格式化图标导航」场景正文残留「格式化 →」，随箭头语言归一补齐为「格式化 →」（tools-two-way-panels 归档时漏扫本需求块，场景标题保持稳定标识符） -->

<!-- 2026-10-30 tools-ux-review-fixes：原 spec 写「6 个工具」但代码实际 7 个（含 JSON 对比），本条修正漂移并按用户裁决 A（图标+文字）提升辨识度；场景标题保持稳定标识符 -->

<!-- 2026-11-25 tools-page-restyle：工具数随 tools-new-utilities / tools-keepalived-generator 批次增至 14 个，本条修正正文残留的「7 个工具」漂移；布局需求升级为设计语言（proposal-c/tools.html）下的工作台外壳契约 -->

系统 SHALL 使用「工具栏 + 工作区」的工作台布局，二者同属一张卡片：左侧工具栏宽 132px、底色 `--bg` 右侧 1px 描边，展示全部 14 个工具的「图标 + 文字标签」项（Lua 互转、URL、JSON、SM4、Base64、YAML、JSON 对比、时间戳、JWT、互转、文本对比、IP/CIDR、哈希、Keepalived），当前工具项 SHALL 以 accent 实底白字高亮，悬停态为 accent 弱底。点击工具项右侧工作区切换为对应工具。每个工具面板头 SHALL 统一为「标题（15px/600）+ 用途提示灰字 + 右侧『帮助』与『清空』」；「帮助」为 accent 弱底按钮，「清空」悬停转危险色；「当前时间」等中性填充动作 SHALL 使用普通 ghost 按钮，SHALL NOT 复用「清空」的危险色悬停语义。工具的全部输入/输出文本区 SHALL 使用等宽字体（12.5px `--font-mono`）。

#### Scenario: 图标导航切换工具
- **WHEN** 用户在左侧工具栏点击「URL 编解码」项
- **THEN** 右侧工作区切换为 URL 编解码工具，左右双栏展示输入和输出
- **AND** 该工具项显示 accent 实底白字高亮态

#### Scenario: YAML 格式化图标导航
- **WHEN** 用户在左侧工具栏点击「YAML 格式化」项
- **THEN** 右侧工作区切换为 YAML 格式化工具，左右双栏展示输入和输出
- **AND** 左侧为输入文本框，右侧为只读输出文本框
- **AND** 两栏之间显示「格式化 →」按钮

#### Scenario: 左右双栏布局一致性
- **WHEN** 用户切换到任意一个双栏类工具（Lua/URL/JSON/SM4/Base64/YAML/互转）
- **THEN** 工作区始终展示左右双栏，左边为源输入区，右边为目标输出区
- **AND** 双栏文本区均以等宽字体渲染

#### Scenario: 导航项文字标签
- **WHEN** 用户查看左侧工具栏（无需悬停）
- **THEN** 每个工具项 SHALL 同时显示图标与工具名称文字，无需依赖 tooltip 即可辨识工具

#### Scenario: 工具栏视觉解剖
- **WHEN** 用户查看工具箱工作台外壳
- **THEN** 工具栏与工作区同属一张卡片（单层描边），工具栏底色为 `--bg`、右侧 1px 描边
- **AND** 工具项悬停为 accent 弱底、激活为 accent 实底白字，与设计页 `proposal-c/tools.html` 一致

#### Scenario: 面板头按钮语义分离
- **WHEN** 用户查看时间戳转换工具的面板头
- **THEN** 「当前时间」按钮悬停呈现 accent 中性反馈，「清空」按钮悬停呈现危险色反馈，二者视觉语义可区分

#### Scenario: 输入即算结果格形态
- **WHEN** 用户在时间戳/IP·CIDR/哈希任一工具输入合法内容
- **THEN** 识别结果 SHALL 以 1px 描边容器逐行分隔展示
- **AND** 主行（时间戳的「北京时间」/ IP·CIDR 的「IP·前缀」）SHALL 以 accent 弱底与 accent 标签强调

## ADDED Requirements

### Requirement: 工具箱页头

系统 SHALL 为工具箱页面提供页头：标题「工具箱」+ 一行职责描述 + 统计徽标两枚（「14 个工具」首枚 accent +「0 外发请求」）。页头 SHALL NOT 包含页级动作按钮（工具箱为互斥面板工作台，无页面级动作）。徽标数值来源：前者取工具清单长度，后者为「全部工具纯本地转换、零网络请求」的静态事实，均非运行时统计。

#### Scenario: 页头渲染统计徽标

- **WHEN** 用户进入工具箱页面
- **THEN** 页头标题旁 SHALL 渲染「14 个工具」（accent 首枚）与「0 外发请求」两枚徽标，与设计页 `proposal-c/tools.html` 一致
- **AND** 「14」随工具清单长度联动，不硬编码于模板

#### Scenario: 页头无动作按钮

- **WHEN** 用户查看工具箱页头
- **THEN** 页头 SHALL NOT 出现任何动作按钮（设计页 `page-header-actions` 缺省，两侧一致）
