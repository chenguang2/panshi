// 节点表单状态控件守卫：下拉框 + 后果说明
// 背景（2026-10-04 用户反馈）：原「启用/停用」勾选框有歧义且不明显——勾选态与文案的关系不清，
// 且停用的后果（不进中继网关流量白名单）不可见，areatest 空 map 事件即此盲区所致。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
}

describe('节点表单状态控件', () => {
  it('状态为下拉框（启用/禁用），不再是勾选框', () => {
    const s = src()
    expect(s).toMatch(/<select class="form-input" v-model="formData\.statusCheck">/)
    expect(s).toContain(':value="true">启用<')
    expect(s).toContain(':value="false">禁用<')
    expect(s).not.toMatch(/type="checkbox" v-model="formData\.statusCheck"/)
  })
  it('状态控件附带后果说明（禁用不入网关流量白名单）', () => {
    expect(src()).toContain('禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询')
  })
  it('表格状态列可见节点禁用态（已禁用徽章，与 nginx 运行态并存）', () => {
    const s = src()
    const block = s.match(/column\.key === 'status'[\s\S]{0,600}?<\/template>/)
    expect(block, '需存在 status 列模板').toBeTruthy()
    expect(block![0]).toMatch(/record\.status === 0[\s\S]{0,200}已禁用/)
  })
})
