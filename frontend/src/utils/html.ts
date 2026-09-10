/**
 * HTML 转义工具 —— 全站单实现（v3 8B-1 收敛）。
 *
 * 此前 utils/ansi.ts 与 utils/tools/diff.ts 各有一份 escapeHtml，
 * 后者漏转单引号（属性上下文注入面）。统一为 5 实体强版本；
 * 两个旧路径保留 re-export，既有调用方零改动。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
