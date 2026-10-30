# tasks: database-mgmt-ux-review-fixes

> 待决项默认推荐 A（假按钮移除 / 状态点内存态 / 连接表保持全量）

## 批 1 — 假功能与危险操作

- [x] 1.1 移除弹窗内假「测试连接」按钮与 handleTestDraft；保存 toast 补测试引导（新增场景）
- [x] 1.2 当前行删除禁用 + tooltip「当前连接不可删除，请先切换到其他连接」
- [x] 1.3 postgres 表单补「启用 SSL 连接」开关（编辑回显已有链路）
- [x] 1.4 后端 `_do_test_sync` 失败 detail 中文分类转译（连接拒绝/认证/库不存在/超时/兜底前缀）+ 单测

## 批 2 — 视觉与状态语义

- [x] 2.1 非当前行「设为当前」btn-primary → btn-secondary
- [x] 2.2 地址列 ellipsis + title（max-width 260px）
- [x] 2.3 保存前重名软校验（同 name 且非当前编辑 id → 阻断）
- [x] 2.4 状态点三态（testResults 内存态：绿/红/灰 + tooltip）；名称 placeholder 示例
- [x] 2.5 组件测试扩展：禁用删除/重名/SSL/假按钮移除/状态点三态

## 批 3 — 收口

- [x] 3.1 后端域回归（database 相关 pytest）+ 前端域回归 + vue-tsc 0 错误
- [x] 3.2 全量前端串行回归
- [x] 3.3 真实 UI 验收：当前行禁用态、SSL 开关、状态点、地址省略（截图）
- [x] 3.4 `openspec validate --all` 通过
