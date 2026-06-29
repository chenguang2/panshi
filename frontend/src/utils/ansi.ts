/**
 * ANSI 颜色代码 → HTML 样式转换
 *
 * 将 Ansible 输出中的 ANSI SGR 转义序列转换为彩色 HTML <span> 标签。
 * 先 HTML 转义文本防止 XSS，再将 ANSI 码替换为 <span style="color:...">。
 *
 * 支持的 ANSI 颜色映射（Solarized 配色，适配深色背景 #1e1e1e）：
 *   [1;34m → blue       PLAY 头部
 *   [0;36m → cyan       TASK 标题
 *   [0;32m → green      ok / changed
 *   [0;33m → yellow     [WARNING]
 *   [0;31m → red        fatal / FAILED!
 *   [0;35m → magenta    skipped / unreachable
 *   [0m    → (reset)    恢复默认色 #d4d4d4
 */

// ANSI 颜色码 → CSS 颜色映射
const ANSI_COLORS: Record<string, string> = {
  '0;32': '#859900',  // green - ok/changed
  '0;31': '#dc322f',  // red - fatal/FAILED
  '1;34': '#268bd2',  // blue - PLAY header
  '0;36': '#2aa198',  // cyan - TASK header
  '0;33': '#b58900',  // yellow - WARNING
  '0;35': '#d33682',  // magenta - skipped
  '1;35': '#d33682',  // bright magenta - warnings
  '0':    '#d4d4d4',  // reset → default log-box foreground
}

// 默认前景色（与 log-box 的 color: #d4d4d4 一致）
const DEFAULT_FG = '#d4d4d4'

// 匹配完整 ANSI 转义序列: ESC[<参数>m
// 在 JSON 传输中 ESC (0x1B) 编码为 \u001b，在 JS 字符串中即 \x1b
const FULL_ANSI_RE = /\x1b\[([\d;]*)m/g

// 兜底匹配：如果浏览器渲染时 ESC 字符丢失，仅匹配可见的 [<参数>m
// 使用负向后顾避免匹配到普通方括号内容（如 [192.168.100.42]）
const VISIBLE_ANSI_RE = /(?:^|(?<=\s))\[(\d+(?:;\d+)*)m/g

/**
 * HTML 转义特殊字符，防止 XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 将包含 ANSI 转义序列的文本转换为彩色 HTML。
 *
 * 处理流程：
 * 1. HTML 转义（防 XSS）
 * 2. 匹配完整的 ANSI 序列（含 ESC 字符）
 * 3. 如果上面没匹配到，尝试匹配可见的 [<参数>m 序列
 * 4. 替换为 <span style="color:...">...</span>
 *
 * @param text  可能包含 ANSI 转义序列的原始文本
 * @returns     HTML 片段（安全，可直接用于 v-html）
 */
export function ansiToHtml(text: string): string {
  // Step 1: HTML 转义
  let html = escapeHtml(text)

  // Step 2: 匹配完整 ANSI 序列
  let hasMatch = false
  html = html.replace(FULL_ANSI_RE, (_, params: string) => {
    hasMatch = true
    const color = ANSI_COLORS[params]
    if (params === '') {
      // [0m 或 [m → 重置
      return `<span style="color:${DEFAULT_FG}">`
    }
    if (color) {
      return `<span style="color:${color}">`
    }
    // 不能识别的序列，过滤掉（不输出 span）
    return ''
  })

  // Step 3: 如果没有完整序列匹配，尝试可见序列
  if (!hasMatch) {
    html = html.replace(VISIBLE_ANSI_RE, (_, params: string) => {
      const color = ANSI_COLORS[params]
      if (params === '') {
        return `<span style="color:${DEFAULT_FG}">`
      }
      if (color) {
        return `<span style="color:${color}">`
      }
      return ''
    })
  }

  // Step 4: 在最后一个 </span> 后补齐关闭标签，确保 HTML 结构完整
  // 每个 spspan 的开始都需要一个对应的 </span> 闭合
  const openCount = (html.match(/<span /g) || []).length
  const closeCount = (html.match(/<\/span>/g) || []).length
  if (openCount > closeCount) {
    html += '</span>'.repeat(openCount - closeCount)
  }

  return html
}

/**
 * 移除 ANSI 转义序列，返回纯文本。
 * 用于复制日志等不需要颜色格式的场景。
 */
export function stripAnsi(text: string): string {
  return text
    .replace(FULL_ANSI_RE, '')
    .replace(VISIBLE_ANSI_RE, '')
}
