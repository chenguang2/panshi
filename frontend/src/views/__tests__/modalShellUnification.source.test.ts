/**
 * 弹窗壳统一守卫（2026-11-24 用户裁决「都统一」）。
 *
 * 平台唯一合法的弹窗解剖 = `.modal-overlay > .modal > (.modal-header + .modal-body + .modal-footer)`
 * （标杆：`NodeFormModal.vue`「添加节点」——品牌淡蓝头部、右上 ×、14px 标题、页脚取消/主操作）。
 * antd `a-modal` 自带白底头部与 16px 标题，与平台壳不同，已全站清零，禁止回流。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '../..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...walk(full))
    } else if (name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

const VUE_FILES = walk(SRC)

describe('弹窗壳统一（.modal-overlay，禁用 a-modal）', () => {
  it('全站 .vue 不再使用 antd a-modal', () => {
    const hits = VUE_FILES.filter((f) => /<a-modal[\s>]/.test(readFileSync(f, 'utf8')))
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })

  it('主机清单批量导入弹窗使用平台统一壳（头部标题 / 页脚按钮 / 原生 textarea）', () => {
    const src = readFileSync(resolve(SRC, 'views/AnsibleInventory.vue'), 'utf8')
    expect(src).toContain('class="modal-overlay"')
    expect(src).toMatch(/<div class="modal-header">[\s\S]{0,200}?批量导入主机/)
    expect(src).toMatch(/<div class="modal-footer">[\s\S]{0,300}?确认导入/)
    expect(src).toContain('modal-close')
    expect(src).not.toContain('<a-textarea')
  })

  it('禁用规则可解释：不再有「保留 a-modal」的陈旧注释', () => {
    for (const f of VUE_FILES) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/保留\s*a-modal|→\s*<a-modal>/)
    }
  })
})
