/**
 * YAML 格式化
 *
 * 使用 yaml 库（v2.9.0，Eemeli Aro）进行解析和重新序列化。
 * 注意：格式化会丢弃 YAML 注释（round-trip 固有限制）。
 */

import { parse, stringify } from 'yaml'

export function format(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return '请输入 YAML 内容'
  }

  try {
    const doc = parse(input)
    return stringify(doc, { indent: 2 })
  } catch (e: any) {
    const msg = e.message || String(e)
    return `YAML 解析失败: ${msg}`
  }
}
