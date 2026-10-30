# tools-ux-review-fixes 设计

## 证据清单（真实探测，2026-10-30）

| # | 问题 | 级别 | 证据 |
|---|---|---|---|
| 1 | 复制/粘贴 http 环境全部失效 | P1 | Playwright 实测 `COPY_HTTP_TOAST: ["复制失败","复制失败"]`（`navigator.clipboard` 仅 secure context；Tools.vue:354-379 无 fallback） |
| 2 | YAML 输入框「复制」复制的是输出 | P1 | Tools.vue:176 `copyToClipboard(yamlOutput)` 位于 panel-left 复制行（应 yamlInput） |
| 3 | 左侧纯图标栏辨识差 | P2 | 截图 tools-1-lua.png：56px 纯图标 + tooltip；BlockOutlined(base64)/SnippetsOutlined(yaml) 不直观 |
| 4 | 无工具深链 | P2 | `activeTool` 仅内存 ref（Tools.vue:265），刷新回 lua、无法分享 |
| 5 | SM4 短密钥静默 pad/截断 | P2 | sm4.ts:179-186 `initRoundKeys` pad/truncate + docstring「取前 16 字节」；实测 `short` 密钥加密成功往返一致——但与 Edge 通道（严格 16 字节）行为不一致，密文误用会失败 |
| 6 | Lua 按钮文案歧义 | P2 | 「← 还原函数」实为「从字符串转换」；与「转为字符串」方向语义不对称 |
| 7 | 无清空操作 | P2 | 全页面无清空按钮 |
| 8 | JSON 错误文案英文原文 | P3 | 实测输出 `JSON 解析失败: Expected property name or '}' in JSON at position 1`——有位置信息但无中文修复指引 |
| 9 | SM4「恢复默认」无用途说明 | P3 | 默认密钥 `a16bc20453da220f` 是 Edge 通道默认 SM4 密钥（edge_client.py `_SM4_KEY_DEFAULT` 同值），页面无说明 |
| 10 | diff「格式化 ↘」语义不直白 | P3 | 实为「两栏都格式化（键序归一化）」 |

已正确、不需改的（避免过度设计）：
- 工具函数错误进结果框模式（json/base64/url/yaml/sm4 全部 try/catch 返回中文文案）——首轮误判「静默失败」，实测 JSON 非法输入有反馈 ✓
- diff 空输入禁用、差异统计摘要、键序归一化 ✓
- textareaRows 视口自适应 ✓、工具切换不丢内容（ref 持有）✓
- YAML 注释丢失提示已有 ✓

## spec 漂移修正

- 主 spec「工具箱页面布局」写 **6 个工具**，代码 7 个（JSON 对比缺 spec）→ delta 修正 + ADDED JSON 数据对比 requirement

## 关键设计决策

### D1 剪贴板回退（裁决项 1，推荐 A）

```ts
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) { message.warning('没有可复制的内容'); return false }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); message.success('已复制到剪贴板'); return true } catch { /* fallthrough */ }
  }
  // http 内网回退：隐藏 textarea + execCommand（deprecated 但全浏览器仍支持）
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (ok) { message.success('已复制到剪贴板'); return true }
  message.error('复制失败：浏览器限制剪贴板访问，请手动选中文本复制')
  return false
}

async function pasteFromClipboard(setter: (t: string) => void, focusEl?: HTMLTextAreaElement) {
  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) { message.warning('剪贴板为空'); return }
      setter(text); message.success('已粘贴'); return
    } catch { /* 权限拒绝 fallthrough */ }
  }
  // http 回退：浏览器无粘贴 API，聚焦 + 引导 Ctrl+V（明示动作而非仅报失败）
  focusEl?.focus()
  message.info('浏览器限制剪贴板读取，请点击输入框后按 Ctrl+V 粘贴')
}
```

- 复制回退在 http 下成功率 ~100%（execCommand 全浏览器支持）；HTTPS 下仍走 clipboard API 优先
- 粘贴无回退 API（浏览器安全模型不允许网页主动插入剪贴板内容到任意焦点外位置），明示引导是唯一正确解
- 返回 boolean 供需要联动（清空/交换）的调用方使用

### D2 SM4 短密钥警告（裁决项 2，推荐 A 不阻断）

- 工具函数层不动（往返一致性是自洽的）；警告在**视图层**：`sm4Key` 经 `utf8` 编码字节数 ≠16 时，结果区顶部渲染黄条
- 不阻断的理由：工具自洽（自加密自解密一致），价值在提醒「这个密文拿去 Edge 通道会解不开」——阻断反而妨碍有意测试短 key 的场景
- 黄条文案：`密钥非 16 字节（实际 N 字节），已自动补齐/截断——与 Edge 通道真实加解密行为可能不一致`

### D3 图标栏加文字（裁决项 3，推荐 A）

- sider 56px → 132px；icon-item 纵向排列 icon(18px) + label(12px 文字)；active 态样式沿用现有
- 7 项全量加文字：Lua 互转 / URL 编解码 / JSON 格式化 / SM4 加解密 / Base64 / YAML 格式化 / JSON 对比（短名控制宽度）

### D4 深链（裁决项 4，推荐 A）

- `watch(activeTool)` → `router.replace({ query: { tool: key } })`（replace 不污染历史）
- 进页 `route.query.tool` 在白名单内才采用
- 用 `router.replace` 而非 `history.replaceState`（保持 Vue Router 状态一致）

### D5 清空按钮

- 每个工具面板头部右侧小按钮「清空」——清当前工具的输入+输出（diff 清三态：A/B/结果）
- 不做全局清空（误触风险 > 收益）

## 文案对照表（精确最终文案）

| 位置 | 现文案 | 新文案 |
|---|---|---|
| Lua 按钮 | 转为字符串 → / ← 还原函数 | 转换为字符串 → / → 转换为函数 |
| Lua header | Lua 函数 ↔ 配置字符串 | Lua 函数 ↔ 配置字符串（副行：用于插件 pre_functions 配置与函数体互转） |
| JSON 错误 | JSON 解析失败: <V8 message> | JSON 解析失败: <V8 message>（请检查引号、逗号、括号是否配对） |
| Base64 解码错误 | 解码失败：输入不是有效的 Base64 字符串 | 解码失败：输入不是有效的 Base64 字符串（常见原因：含空格、换行或非 Base64 字符） |
| SM4 警告 | （无） | 密钥非 16 字节（实际 N 字节），已自动补齐/截断——与 Edge 通道真实加解密行为可能不一致 |
| SM4 恢复默认 tooltip | （无） | 恢复为 Edge 通道默认 SM4 密钥（调试平台↔Edge 加密链路用） |
| diff 按钮 | 格式化 ↘ | 两边格式化 |
| 粘贴失败 | 粘贴失败，请手动 Ctrl+V | 浏览器限制剪贴板读取，请点击输入框后按 Ctrl+V 粘贴 |
| 复制失败 | 复制失败 | 复制失败：浏览器限制剪贴板访问，请手动选中文本复制 |

## 测试策略

- 组件测试（新增 `Tools.test.ts`）：mock `navigator.clipboard` undefined → execCommand spy 断言回退复制成功；YAML 复制对象语义；深链 query 读写；SM4 短密钥黄条；清空按钮；Lua 按钮文案
- utils 单测：错误文案断言更新（JSON/Base64 新增指引文字）
- 真实 UI：http 环境（12345 即 http）Playwright 探测复制按钮 → 断言 toast 为「已复制」且剪贴板内容正确（execCommand 路径读不回剪贴板，改为断言 toast + 无「复制失败」）
