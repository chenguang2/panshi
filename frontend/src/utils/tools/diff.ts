/**
 * JSON 差异对比工具
 *
 * 树对比模式：基于 diff 树递归渲染完整 JSON。
 * 数组项按 id/key 字段配对，而非数组索引。
 */

export interface DiffResult {
  status: 'same' | 'added' | 'removed' | 'changed'
  valueA?: unknown
  valueB?: unknown
  children?: Record<string, DiffResult>
  isArray?: boolean
}

// ── 排序 ───────────────────────────────────────────

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

// ── 差异计算 ───────────────────────────────────────

/** 检测数组项中可用作唯一标识的字段名 */
function detectArrayKey(arrA: unknown[], arrB: unknown[]): string | null {
  for (const key of ['id', 'key', 'name', 'uuid']) {
    const allA = arrA.every(item => item && typeof item === 'object' && key in item)
    const allB = arrB.every(item => item && typeof item === 'object' && key in item)
    if (allA && allB) return key
  }
  return null
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

  // ── 数组对比 ──
  if (Array.isArray(objA)) {
    const arrA = objA as unknown[]
    const arrB = objB as unknown[]
    const arrKey = detectArrayKey(arrA, arrB)

    if (arrKey) {
      return computeArrayDiffByKey(arrA, arrB, arrKey)
    }
    // 无 key 时按索引对比
    return computeArrayDiffByIndex(arrA, arrB)
  }

  // ── 对象对比 ──
  const objARec = objA as Record<string, unknown>
  const objBRec = objB as Record<string, unknown>
  const keysA = Object.keys(objARec)
  const keysB = Object.keys(objBRec)
  const allKeys = new Set([...keysA, ...keysB])
  const children: Record<string, DiffResult> = {}

  for (const key of allKeys) {
    const hasA = key in objARec
    const hasB = key in objBRec

    if (hasA && !hasB) {
      children[key] = { status: 'removed', valueA: objARec[key] }
    } else if (!hasA && hasB) {
      children[key] = { status: 'added', valueB: objBRec[key] }
    } else {
      children[key] = computeDiff(objARec[key], objBRec[key])
    }
  }

  const hasChange = Object.values(children).some(c => c.status !== 'same')
  if (hasChange) {
    return { status: 'changed', children }
  }
  return { status: 'same', valueA: objA, valueB: objB }
}

function computeArrayDiffByIndex(arrA: unknown[], arrB: unknown[]): DiffResult {
  const maxLen = Math.max(arrA.length, arrB.length)
  const children: Record<string, DiffResult> = {}
  for (let i = 0; i < maxLen; i++) {
    const key = String(i)
    if (i >= arrA.length) {
      children[key] = { status: 'added', valueB: arrB[i] }
    } else if (i >= arrB.length) {
      children[key] = { status: 'removed', valueA: arrA[i] }
    } else {
      children[key] = computeDiff(arrA[i], arrB[i])
    }
  }
  return { status: 'changed', children, isArray: true }
}

function computeArrayDiffByKey(arrA: unknown[], arrB: unknown[], keyField: string): DiffResult {
  const mapA = new Map<string, unknown>()
  for (const item of arrA) {
    const rec = item as Record<string, unknown>
    mapA.set(String(rec[keyField]), item)
  }
  const mapB = new Map<string, unknown>()
  for (const item of arrB) {
    const rec = item as Record<string, unknown>
    mapB.set(String(rec[keyField]), item)
  }

  const allKeys = new Set([...mapA.keys(), ...mapB.keys()])
  // 保持 A 的原始顺序
  const orderedKeys: string[] = []
  const seen = new Set<string>()
  for (const item of arrA) {
    const k = String((item as Record<string, unknown>)[keyField])
    if (!seen.has(k)) { orderedKeys.push(k); seen.add(k) }
  }
  for (const item of arrB) {
    const k = String((item as Record<string, unknown>)[keyField])
    if (!seen.has(k)) { orderedKeys.push(k); seen.add(k) }
  }

  const children: Record<string, DiffResult> = {}
  for (const k of orderedKeys) {
    if (mapA.has(k) && !mapB.has(k)) {
      children[k] = { status: 'removed', valueA: mapA.get(k) }
    } else if (!mapA.has(k) && mapB.has(k)) {
      children[k] = { status: 'added', valueB: mapB.get(k) }
    } else {
      children[k] = computeDiff(mapA.get(k), mapB.get(k))
    }
  }

  return { status: 'changed', children, isArray: true }
}

// ── HTML 工具 ──────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── 渲染输出 ───────────────────────────────────────

export interface LineDiffResult {
  html: string
  added: number
  removed: number
  changed: number
  totalA: number
  totalB: number
}

/** 渲染一个普通值（非 diff 节点），含 key 前缀 */
function renderOneVal(val: unknown, cls: string, lines: string[], indent: string, comma: string): void {
  if (val === null) {
    lines.push(`<div class="dl-line ${cls}">${indent}null${comma}</div>`)
  } else if (typeof val === 'boolean' || typeof val === 'number') {
    lines.push(`<div class="dl-line ${cls}">${indent}${escapeHtml(String(val))}${comma}</div>`)
  } else if (typeof val === 'string') {
    lines.push(`<div class="dl-line ${cls}">${indent}${escapeHtml(JSON.stringify(val))}${comma}</div>`)
  } else if (Array.isArray(val)) {
    if (val.length === 0) {
      lines.push(`<div class="dl-line ${cls}">${indent}[]${comma}</div>`)
    } else {
      lines.push(`<div class="dl-line ${cls}">${indent}[</div>`)
      for (let i = 0; i < val.length; i++) {
        renderOneVal(val[i], cls, lines, indent + '  ', i < val.length - 1 ? ',' : '')
      }
      lines.push(`<div class="dl-line ${cls}">${indent}]${comma}</div>`)
    }
  } else if (typeof val === 'object') {
    const keys = Object.keys(val as Record<string, unknown>)
    if (keys.length === 0) {
      lines.push(`<div class="dl-line ${cls}">${indent}{}${comma}</div>`)
    } else {
      lines.push(`<div class="dl-line ${cls}">${indent}{</div>`)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const child = (val as Record<string, unknown>)[k]
        const c = i < keys.length - 1 ? ',' : ''
        if (child !== null && typeof child === 'object') {
          lines.push(`<div class="dl-line ${cls}">${indent}  "${escapeHtml(k)}":</div>`)
          renderOneVal(child, cls, lines, indent + '    ', c)
        } else {
          renderOneVal(child, cls, lines, `${indent}  "${escapeHtml(k)}": `, c)
        }
      }
      lines.push(`<div class="dl-line ${cls}">${indent}}${comma}</div>`)
    }
  }
}

/** 基于 diff 节点递归渲染格式化 JSON */
function renderDiffNode(diff: DiffResult, lines: string[], indent: string, comma: string): void {
  if (diff.status === 'same') {
    renderOneVal(diff.valueA, 'dl-same', lines, indent, comma)
    return
  }
  if (diff.status === 'removed') {
    renderOneVal(diff.valueA, 'dl-removed', lines, indent, comma)
    return
  }
  if (diff.status === 'added') {
    renderOneVal(diff.valueB, 'dl-added', lines, indent, comma)
    return
  }

  if (diff.children) {
    const keys = Object.keys(diff.children).sort()
    const brace = diff.isArray ? ['[', ']'] : ['{', '}']

    if (keys.length === 0) {
      lines.push(`<div class="dl-line dl-same">${indent}${brace[0]}${brace[1]}${comma}</div>`)
      return
    }
    lines.push(`<div class="dl-line dl-same">${indent}${brace[0]}</div>`)

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const child = diff.children[k]
      const c = i < keys.length - 1 ? ',' : ''

      if (diff.isArray) {
        // 数组项：不显示 key，直接渲染值
        if (child.status === 'same') {
          renderOneVal(child.valueA, 'dl-same', lines, indent + '  ', c)
        } else if (child.status === 'added') {
          renderOneVal(child.valueB, 'dl-added', lines, indent + '  ', c)
        } else if (child.status === 'removed') {
          renderOneVal(child.valueA, 'dl-removed', lines, indent + '  ', c)
        } else if (child.children) {
          renderDiffNode(child, lines, indent + '  ', c)
        } else {
          renderOneVal(child.valueA, 'dl-removed', lines, indent + '  ', '')
          renderOneVal(child.valueB, 'dl-added', lines, indent + '  ', c)
        }
      } else {
        // 对象字段
        const isLeaf = !child.children && (child.status === 'same' || child.status === 'added' || child.status === 'removed' || child.status === 'changed')

        if (isLeaf) {
          if (child.status === 'same') {
            renderOneVal(child.valueA, 'dl-same', lines, `${indent}  "${escapeHtml(k)}": `, c)
          } else if (child.status === 'added') {
            renderOneVal(child.valueB, 'dl-added', lines, `${indent}  "${escapeHtml(k)}": `, c)
          } else if (child.status === 'removed') {
            renderOneVal(child.valueA, 'dl-removed', lines, `${indent}  "${escapeHtml(k)}": `, c)
          } else {
            renderOneVal(child.valueA, 'dl-removed', lines, `${indent}  "${escapeHtml(k)}": `, '')
            renderOneVal(child.valueB, 'dl-added', lines, `${indent}  "${escapeHtml(k)}": `, c)
          }
        } else {
          if (child.status === 'same' || child.status === 'removed' || child.status === 'added') {
            const cls = child.status === 'same' ? 'dl-same' : child.status === 'removed' ? 'dl-removed' : 'dl-added'
            const val = child.status === 'added' ? child.valueB : child.valueA
            lines.push(`<div class="dl-line ${cls}">${indent}  "${escapeHtml(k)}":</div>`)
            renderOneVal(val, cls, lines, indent + '    ', c)
          } else {
            lines.push(`<div class="dl-line dl-same">${indent}  "${escapeHtml(k)}":</div>`)
            renderDiffNode(child, lines, indent + '    ', c)
          }
        }
      }
    }

    lines.push(`<div class="dl-line dl-same">${indent}${brace[1]}${comma}</div>`)
    return
  }

  renderOneVal(diff.valueA, 'dl-removed', lines, indent, '')
  renderOneVal(diff.valueB, 'dl-added', lines, indent, comma)
}

export function renderLineDiff(jsonA: string, jsonB: string): LineDiffResult {
  const objA = sortValue(JSON.parse(jsonA))
  const objB = sortValue(JSON.parse(jsonB))
  const diff = computeDiff(objA, objB)

  const lines: string[] = []
  let added = 0, removed = 0, changed = 0

  function countStats(d: DiffResult): void {
    if (d.status === 'added') added++
    else if (d.status === 'removed') removed++
    else if (d.status === 'changed' && !d.children) changed++
    if (d.children) {
      for (const key of Object.keys(d.children)) countStats(d.children[key])
    }
  }
  countStats(diff)

  renderDiffNode(diff, lines, '', '')
  return {
    html: lines.join('\n'),
    added, removed, changed,
    totalA: JSON.stringify(objA, null, 2).split('\n').length,
    totalB: JSON.stringify(objB, null, 2).split('\n').length,
  }
}
