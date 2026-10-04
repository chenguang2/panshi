# Tasks: node-status-unification

> TDD 推进：先写失败测试（RED）验证失败，再最小实现（GREEN）。已完成（commits 0b8eb551 / d4728f9f）。

## 1. 组 1 — 表单控件下拉化 + 后果说明

- [x] 1.1 （TDD）`NodeList.source.test.ts` 断言下拉形态（原生 select、选项含 启用/禁用）与后果说明文案——RED 2/2 成立
- [x] 1.2 勾选框 + 随状态翻转文字替换为原生 select（v-model formData.statusCheck，选项 启用/停用→禁用）；`.form-hint` 附白名单后果说明
- [x] 1.3 守卫 2 + 挂载 17 = 19 绿；脚本层零改动验证

## 2. 组 2 — 措辞统一 + 两页提示一致 + 表格徽章

- [x] 2.1 （TDD）CentralList 源码守卫：节点表单「正常」→「启用」、`extra` 与 NodeList 字面一致——RED 成立
- [x] 2.2 （TDD）表格徽章守卫：「已禁用」徽章与 nginx 运行态并存断言——RED 成立（共 5/5）
- [x] 2.3 CentralList a-select 选项改 启用/禁用 + `a-form-item extra` 挂同句提示；NodeList 表单 停用→禁用
- [x] 2.4 NodeList 表格禁用节点前置「已禁用」红徽章（管理开关维度）
- [x] 2.5 验证：定向守卫 22 绿 + `vue-tsc -b` 干净 + 全量 vitest 1146/1146（首轮 34 红定性为负载假象，复跑全绿）
