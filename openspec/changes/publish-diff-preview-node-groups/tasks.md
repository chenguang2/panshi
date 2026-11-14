# Tasks

## 1. 分组聚合纯函数与呈现（TDD）

- [x] 1.1 RED：PublishPreviewModal 组件测试新增——8 节点 mock（5 一致 + 2 同指纹落后 + 1 旁路）断言分组呈现（组数/组头/IP chips/组内差异表/缺失与不可达组仅列 IP）；5 节点 mock 断言仍为矩阵（回归）；「显示一致字段」开关在差异组内追加一致行；验证失败
- [x] 1.2 GREEN：分组聚合纯函数（节点指纹分组：差异指纹相同归组、missing/unreachable/一致各归其组、组按节点数降序）+ 组件呈现分支（≤5 矩阵 / >5 分组，阈值常量 5）；「显示一致字段」开关分组语义（差异组内追加一致行）
- [x] 1.3 聚合纯函数单测：指纹边界（全同/全异/混合/缺失/不可达/单节点）
- [x] 1.4 前端验证：npx vue-tsc -b 0 error；PublishPreviewModal 既有用例全绿（≤5 路径回归）+ 新用例全绿；全量 vitest run --maxWorkers=4 收口

## 2. 真实环境回归与收口

- [x] 2.1 真实环境（≤3 节点集群）回归：预览弹窗呈现与交互不变（矩阵路径），截图核对
- [x] 2.2 AGENTS.md #77 补一行（呈现自适应阈值与分组语义）；openspec validate --all 0 error；tasks 打勾；git commit
