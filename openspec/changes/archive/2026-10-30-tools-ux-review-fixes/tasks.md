# tasks: tools-ux-review-fixes

> 全部为前端改动；TDD 先红后绿；真实 UI 验收在 12345（http 环境，恰好是问题现场）

## 批 1 — 功能缺陷（P1）

- [x] 1.1 剪贴板回退（design D1）：`copyToClipboard` 返回 boolean，clipboard API → execCommand 回退链；`pasteFromClipboard` 增 focusEl 参数与引导文案；先写 Tools.test.ts 失败用例（mock clipboard undefined + execCommand spy）
- [x] 1.2 YAML 复制对象修复（Tools.vue:176 yamlOutput→yamlInput）+「面板复制按钮语义」用例（输入旁复制输入、输出旁复制输出）
- [x] 1.3 错误文案补因：复制失败/粘贴失败新文案（design 文案表）

## 批 2 — 可用性（P2）

- [x] 2.1 图标栏加文字标签（sider 56→132px，icon+短名纵向排列；断言导航项含文字）
- [x] 2.2 工具深链 `?tool=`：watch + router.replace；进页读 query 白名单校验；断言切换更新/刷新保持/非法回退
- [x] 2.3 SM4 短密钥黄条（字节数 ≠16 警告，不阻断；断言警告文案含实际字节数）
- [x] 2.4 清空按钮（每工具面板头部，diff 清 A/B/结果三态；断言点击后输入输出为空）
- [x] 2.5 Lua 按钮文案「转换为字符串 →」/「→ 转换为函数」+ 副行用途说明（同步 spec 场景已改）

## 批 3 — 文案与观感（P3）

- [x] 3.1 JSON/Base64 错误文案补中文指引（utils 单测断言更新）
- [x] 3.2 SM4「恢复默认」tooltip
- [x] 3.3 diff「格式化 ↘」→「两边格式化」
- [x] 3.4 各工具头部用途说明补齐（URL/JSON/SM4/Base64/Base64/diff）

## 收口

- [x] 4.1 域内回归：Tools.test.ts + utils/tools 全部单测绿；`vue-tsc -b` 0 错误
- [ ] 4.2 全量前端串行回归（`npx vitest run --no-file-parallelism`）
- [x] 4.3 真实 UI 验收（12345 http 环境即问题现场）：复制按钮 →「已复制」toast 且无「复制失败」；YAML 输入复制正确；深链刷新保持；SM4 短密钥黄条；截图对照
- [x] 4.4 `openspec validate --all` 通过
