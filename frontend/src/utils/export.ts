/**
 * 通用导出工具（audit-log-ui spec：≤5000 行前端直出 CSV）。
 */

export function exportToCsv(rows: Record<string, unknown>[], filename: string, headers?: string[]): void {
  if (!rows.length) return
  const cols = headers || Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))]
  // BOM：保证 Excel 打开中文不乱码
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
