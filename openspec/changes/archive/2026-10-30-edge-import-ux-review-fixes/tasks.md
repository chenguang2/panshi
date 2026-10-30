# tasks: edge-import-ux-review-fixes

> 待决项：1 并行化 / 2 预览同并行 / 3 导入确认——默认按推荐 A 落（用户批后执行）

## 批 1 — 连接测试提速与反馈

- [x] 1.1 后端 `test_connection` 并行化：9 路取数 ThreadPoolExecutor 并行，每路独立 probe() 保持单类失败不阻塞；既有语义（成功/失败结构、route_info 合并）不变
- [x] 1.2 后端 `fetch_edge_data` 同款并行（待决 2A：preview/execute 取数同提速）
- [x] 1.3 后端测试：mock client 断言并行结果一致 + 单路异常兜底（`test_edge_import_service` 域回归）
- [x] 1.4 前端过程反馈：loading 期间表单下方 info 提示（design D2 文案）；组件测试断言可见
- [x] 1.5 adminKey placeholder「留空则使用节点已配置的 Admin Key」

## 批 2 — 向导交互修复

- [x] 2.1 「下一步」disabled tooltip「请先完成连接测试」（span 包裹承载 tooltip）
- [x] 2.2 导入二次确认弹窗（overlay modal，selections 摘要 + 冲突跳过说明；确认后执行）
- [x] 2.3 跳过明细：结果弹窗消费 skipped_counts 分类明细行
- [x] 2.4 错误文案补因（节点加载/预览失败，design 文案表）
- [x] 2.5 「上一步」回 step0 保留集群与节点列表（仅清节点选择/连接态/adminKey/preview）
- [x] 2.6 取消确认弹窗

## 批 3 — 预览与收尾

- [x] 3.1 预览默认展开有数据 section（数据就绪后批量设置 expandedSections）
- [x] 3.2 全选/全不选快捷项
- [x] 3.3 0 项 section 单行提示（不渲染空表格）
- [x] 3.4 成功弹窗「继续导入」（回 step0 保留集群）+「查看集群详情」双动作；冲突表 rowKey 复合化
- [x] 3.5 组件测试 `EdgeImport.test.ts`（确认弹窗/明细/tooltip/全选/折叠/取消确认/状态保持）

## 收口

- [x] 4.1 后端域回归（edge_import 相关 pytest）+ 前端域回归 + vue-tsc 0 错误
- [x] 4.2 全量前端串行回归
- [x] 4.3 真实 UI 验收（test 集群 14 节点）：连接耗时（预期 <10s）、过程提示可见、确认弹窗、跳过明细、截图
- [x] 4.4 `openspec validate --all` 通过
