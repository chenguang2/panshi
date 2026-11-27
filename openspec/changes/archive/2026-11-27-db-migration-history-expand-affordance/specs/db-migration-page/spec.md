# DB Migration 页历史行展开触达 Delta

## ADDED Requirements

### Requirement: 历史行展开触达与失败原因悬停

历史迁移记录表 SHALL 以「整行可点 + chevron 纯指示触发器」承载行展开：点击行任意位置 SHALL 切换该行展开/收起（受控展开键，切换状态由页面自持），行悬停底色即点击反馈；展开触发器 SHALL 为 chevron 图标纯指示形态（muted、行悬停变 accent、展开态旋转 180° 且转 accent），MUST NOT 使用「+/−」加减图标；触发器自身 SHALL NOT 绑定独立点击（避免双重切换）。本表 SHALL NOT 提供行内「详情」直达列（1366 内容宽零余量，裁决记录见设计页对比稿退役说明），详情入口保持在展开区内（`has_detail` 门控，既有契约）。

失败行的状态胶囊 SHALL 以悬停提示（`title`）披露中文转译后的失败原因（与展开区同一转译结果），使最高频排障信息零点击可见；展开区完整内容（失败原因 + 备份路径复制 + 明细入口）不变。

#### Scenario: 整行点击展开与收起

- **WHEN** 用户点击历史记录行任意位置（含 chevron 指示器所在单元格）
- **THEN** 该行 SHALL 切换展开/收起，展开区内容与既有契约一致（失败原因〔失败行〕、备份路径复制、`has_detail` 行的明细入口）
- **AND** chevron 指示器随展开态旋转并转 accent

#### Scenario: chevron 纯指示形态

- **WHEN** 用户查看未展开/已展开行的触发器
- **THEN** 触发器 SHALL 呈 chevron 图标（收起向下、展开旋转 180°），行悬停时转 accent
- **AND** 页面 SHALL NOT 出现「+/−」形态的展开触发器

#### Scenario: 失败原因悬停披露

- **WHEN** 用户悬停失败行的状态胶囊
- **THEN** 悬停提示 SHALL 展示中文转译后的失败原因（与展开区转译结果一致）
- **AND** 成功行状态胶囊 SHALL NOT 出现失败原因提示

#### Scenario: 展开区内交互不触发行切换

- **WHEN** 用户点击展开区内的「复制」「查看迁移详情」按钮
- **THEN** 该行展开态 SHALL 保持不变（展开区点击 MUST NOT 冒泡为行点击切换），按钮自身行为照常
