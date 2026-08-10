## 1. 复制逻辑（TDD）

- [x] 1.1 测试：`allUpstreamActionButtons` 含 `{ key: 'copy', title: '复制' }`；`defaultActions` 含 `copy`
- [x] 1.2 测试：`copyUpstreamByRecord` 设 `copyingUpstream=true`、`editingUpstream=null`、`name=复制_源名`、打开弹窗
- [x] 1.3 测试：`copyUpstreamByRecord` 填充 load_balance/description/targets（深拷贝新 key）
- [x] 1.4 测试：`copyUpstreamByRecord` 填充高级配置（checks/timeout/keepalive_pool/retries/retry_timeout/pass_host/scheme）+ toggle 状态
- [x] 1.5 实现：`copyingUpstream` 标志 + `copyUpstreamByRecord`；提取公共 `fillUpstreamForm` 供编辑/复制复用

## 2. 操作入口与状态复位（TDD）

- [x] 2.1 测试：`handleUpstreamAction` 的 `case 'copy'` 调用 `copyUpstreamByRecord`
- [x] 2.2 测试：`showAddUpstreamModal` 与 `editUpstreamByRecord` 均复位 `copyingUpstream=false`
- [x] 2.3 实现：`allUpstreamActionButtons` 加 copy、`defaultActions` 加 copy、`handleUpstreamAction` 加 case、两入口复位；行操作渲染确认

## 3. 表单标题（TDD）

- [x] 3.1 测试：`ClusterUpstreams` 表单标题在 copyingUpstream 时显示「复制上游」
- [x] 3.2 实现：标题三态（复制/编辑/添加）

## 3a. 全局上游管理页复制（UpstreamList + UpstreamFormModal，评审确认 TDD）

- [x] 3a.1 测试：`UpstreamFormModal` 在 `copyingUpstream` prop 时标题显示「复制上游」
- [x] 3a.2 测试：`populateForm` 在 copyingUpstream 时填充源配置且 `name=复制_源名`
- [x] 3a.3 测试：提交在 copyingUpstream 时走 POST 新建（非 PUT）
- [x] 3a.4 测试：`UpstreamList.handleAction('copy')` 设 editingUpstream + copying=true + 打开弹窗
- [x] 3a.5 实现：UpstreamFormModal 加 copyingUpstream prop（填充/提交/标题）；UpstreamList 加 copy 菜单项 + case

## 4. 回归验证

- [x] 4.1 `useClusterUpstreams.test.ts` 全绿（含复制测试）
- [x] 4.2 vue-tsc + build 通过
- [x] 4.3 手动链路：复制上游 → 表单填充 → 保存 → 新建成功且原上游不变；复制后点「添加上游」标题正确复位
- [x] 4.4 手动链路：全局上游管理页（UpstreamList）复制功能同样可用
