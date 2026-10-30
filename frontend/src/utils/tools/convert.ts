/**
 * YAML ↔ JSON 互转（tools-new-utilities）——复用 yaml 库，错误沿用既有中文文案模式。
 */
import { parse, stringify } from 'yaml'

export interface ConvertResult {
  error?: string
  text?: string
}

export function yamlToJson(input: string): ConvertResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { error: '请输入 YAML 内容' }
  }
  try {
    const doc = parse(input)
    return { text: JSON.stringify(doc, null, 2) }
  } catch (e: unknown) {
    const msg = (e as { message?: string }).message || String(e)
    return { error: `YAML 解析失败: ${msg}` }
  }
}

export function jsonToYaml(input: string): ConvertResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { error: '请输入 JSON 内容' }
  }
  try {
    const doc = JSON.parse(input)
    return { text: stringify(doc, { indent: 2 }) }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { error: `JSON 解析失败: ${msg}` }
  }
}
