/**
 * JSON 差异对比工具
 *
 * 从 VersionManagementModal.vue 提取，用于工具箱的 JSON 对比功能。
 * computeDiff：递归对比两个 JSON 对象
 * renderDiffTree：渲染差异树为 HTML
 */

export interface DiffResult {
  status: 'same' | 'added' | 'removed' | 'changed'
  valueA?: unknown
  valueB?: unknown
  children?: Record<string, DiffResult>
}

export function sortValue(val: unknown): unknown {
  if (Array.isArray(val)) {
    if (val.length === 0) return val
    if (typeof val[0] === 'object') {
      return val.map(item => sortValue(item)).sort((a, b) => {
        const aKey = Object.keys(a as Record<string, unknown>)[0] || ''
        const bKey = Object.keys(b as Record<string, unknown>)[0] || ''
        return aKey.localeCompare(bKey)
      })
    }
    return [...val].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b
      return String(a).localeCompare(String(b))
    })
  }
  if (typeof val === 'object' && val !== null) {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(val).sort()) {
      sorted[key] = sortValue((val as Record<string, unknown>)[key])
    }
    return sorted
  }
  return val
}

export function computeDiff(objA: unknown, objB: unknown): DiffResult {
  if (objA === objB) {
    return { status: 'same', valueA: objA, valueB: objB }
  }

  if (typeof objA !== 'object' || typeof objB !== 'object' || objA === null || objB === null) {
    return { status: 'changed', valueA: objA, valueB: objB }
  }

  if (Array.isArray(objA) !== Array.isArray(objB)) {
    return { status: 'changed', valueA: objA, valueB: objB }
  }

  const keysA = Object.keys(objA as Record<string, unknown>)
  const keysB = Object.keys(objB as Record<string, unknown>)
  const allKeys = new Set([...keysA, ...keysB])
  const children: Record<string, DiffResult> = {}

  for (const key of allKeys) {
    const hasA = key in (objA as Record<string, unknown>)
    const hasB = key in (objB as Record<string, unknown>)

    if (hasA && !hasB) {
      children[key] = { status: 'removed', valueA: (objA as Record<string, unknown>)[key] }
    } else if (!hasA && hasB) {
      children[key] = { status: 'added', valueB: (objB as Record<string, unknown>)[key] }
    } else {
      children[key] = computeDiff(
        (objA as Record<string, unknown>)[key],
        (objB as Record<string, unknown>)[key],
      )
    }
  }

  const hasChange = Object.values(children).some(c => c.status !== 'same')
  if (hasChange) {
    return { status: 'changed', children }
  }
  return { status: 'same', valueA: objA, valueB: objB }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatValue(val: unknown): string {
  if (val === undefined) return ''
  if (val === null) return 'null'
  if (typeof val === 'object') {
    return JSON.stringify(val)
  }
  return String(val)
}

export function renderDiffTree(diff: DiffResult, indent = 0): string {
  const pad = '  '.repeat(indent)

  if (diff.status === 'same') {
    return pad + '<span class="diff-same">' + escapeHtml(formatValue(diff.valueA)) + '</span>'
  }

  if (diff.status === 'changed' && !diff.children) {
    const valA = diff.valueA === undefined ? '(空)' : diff.valueA
    const valB = diff.valueB === undefined ? '(空)' : diff.valueB
    return pad + '<span class="diff-changed-a">' + escapeHtml(String(valA)) + '</span><br>'
      + pad + '<span class="diff-changed-b">' + escapeHtml(String(valB)) + '</span>'
  }

  if (diff.children) {
    let html = ''
    const keys = Object.keys(diff.children).sort()

    for (const key of keys) {
      const child = diff.children[key]

      if (child.status === 'same') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-same">' + escapeHtml(formatValue(child.valueA)) + '</span><br>'
      } else if (child.status === 'added') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-added">' + escapeHtml(formatValue(child.valueB)) + '</span><br>'
      } else if (child.status === 'removed') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-removed">' + escapeHtml(formatValue(child.valueA)) + '</span><br>'
      } else if (child.children) {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span><br>'
        html += renderDiffTree(child, indent + 1)
      } else {
        const valA = child.valueA === undefined ? '(空)' : child.valueA
        const valB = child.valueB === undefined ? '(空)' : child.valueB
        html += pad + '  <span class="diff-removed">' + escapeHtml(String(valA)) + '</span><br>'
          + pad + '  <span class="diff-added">' + escapeHtml(String(valB)) + '</span><br>'
      }
    }

    return html
  }

  return ''
}
