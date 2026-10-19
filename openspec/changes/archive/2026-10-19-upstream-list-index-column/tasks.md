# Tasks: upstream-list-index-column

## 1. 上游独立页序号列（TDD）

- [x] 1.1 RED：UpstreamList.test.ts 新增**行级渲染断言**——mock ≥25 条上游，第 1 页首行序号文本「1」；经桩 `$emit('change', { current: 2, pageSize: 20 })` 翻页后首行「21」（跨页连续计数；共享 aTableStub 原生转发 bodyCell+index，行级断言即传递钉住列定义）
- [x] 1.2 GREEN：UpstreamList.vue columns 数组首列加 `{ title: '#', key: 'index', width: 45 }`；bodyCell 槽解构补 `index`（:44 现为 `{ column, record }`）并加 `<template v-if="column.key === 'index'"><span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span></template>`（照抄 RouteList.vue:86-88 同款；`.text-muted` 类 UpstreamList.vue:408 已有，零样式改动）
- [x] 1.3 回归收口：`npx vitest run src/views/__tests__/UpstreamList.test.ts --no-file-parallelism` 全绿；`npx vue-tsc -b` 0 错误

## 2. 实页验收（规则 #51：落在用户实际操作的页面）

- [x] 2.1 Playwright 直连 12345 实例上游管理页：首列序号展示；**实页无 21 条数据，跨页计数用 sizeChanger 切 pageSize=10 后翻第 2 页验证首行 = 11**（若总数 ≤10，则第 1 页序号 1..N 目检、跨页计数语义由 1.1 单测钉住）；筛选下拉切换后序号从 1 起重排；与路由管理页并排目检解剖一致（列宽/灰度样式同款）；验收后清理测试状态
