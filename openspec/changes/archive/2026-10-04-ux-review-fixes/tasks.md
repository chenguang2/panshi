# Tasks: ux-review-fixes

> 三批 TDD（RED→GREEN）+ 登录补修，已完成（commits e129aa9f / 25e026e3 / e9ec8d51 / a7ebe5cd）。

## 1. H 批次（e129aa9f）

- [x] 1.1 （TDD）H1 统计条换行（clusterStats.source.test.ts）+ H4 节点图例
- [x] 1.2 （TDD）H2 SSL 到期预警：后端 schemas 到期字段（test_ssl_expiry.py 5 例）+ SslList 到期徽章三态
- [x] 1.3 （TDD）H3 DNS 标题对齐（dnsPageTitles.source.test.ts：UDP/HTTP 两页）

## 2. M 批次（25e026e3）

- [x] 2.1 M1 四层代理权重全角括号与上游统一
- [x] 2.2 M2-M9：空态 CTA / edge.env 引导 / 表单状态 / SSL 分行 / 版本空值 / 术语统一 / 动词统一 / 方法徽章收敛

## 3. L 批次（e9ec8d51）

- [x] 3.1 L1 登录标点聚焦 + L 批次排版/主次打磨（7 项）
- [x] 3.2 L4/L9/L12 勘误核实（代码推翻 OCR）入档报告

## 4. 登录忘记密码（a7ebe5cd）

- [x] 4.1 （TDD）死锚点 → showOverlayModal 信息弹窗（管理员重置引导）+ `@click.prevent`；Login + uxReviewL.source 14/14 绿

## 5. 验证

- [x] 5.1 前端 vitest 1141/1141（后经节点/卡片批次增至 1146）；`vue-tsc -b` 干净
- [x] 5.2 后端 SSL 域 121 passed
