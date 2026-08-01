import { describe, it, expect, type Ref } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePluginConfigSync } from '@/composables/usePluginConfigSync'

type SyncState = ReturnType<typeof usePluginConfigSync>

function mountSync(): SyncState {
  let sync: SyncState
  const Host = defineComponent({
    setup() {
      sync = usePluginConfigSync()
      return { ...sync }
    },
    template: '<div />',
  })
  mount(Host)
  return sync!
}

describe('usePluginConfigSync', () => {
  it('keeps jsonConfig single-encoded when editor emits a string (text mode)', async () => {
    const { jsonConfig, jsonEditorValue } = mountSync()
    const raw = '{"headers":{"Host":"example.com"}}'
    jsonEditorValue.value = raw // json-editor-vue text mode emits raw string
    await nextTick()
    // 不得二次编码：jsonConfig 就是编辑器原文（单层 JSON）
    expect(jsonConfig.value).toBe(raw)
    // 一次 JSON.parse 必须得到对象
    expect(JSON.parse(jsonConfig.value)).toEqual({ headers: { Host: 'example.com' } })
  })

  it('serializes object values to single-encoded JSON string', async () => {
    const { jsonConfig, jsonEditorValue } = mountSync()
    jsonEditorValue.value = { headers: { Host: 'example.com' } }
    await nextTick()
    expect(JSON.parse(jsonConfig.value)).toEqual({ headers: { Host: 'example.com' } })
    expect(typeof jsonConfig.value).toBe('string')
  })

  it('does not write back object to jsonEditorValue when it is a string (feedback loop converges)', async () => {
    const { jsonConfig, jsonEditorValue } = mountSync()
    const raw = '{"headers":{"Host":"example.com"}}'
    jsonEditorValue.value = raw
    await nextTick()
    // watch2 不得把字符串回写为对象
    expect(typeof jsonEditorValue.value).toBe('string')
    expect(jsonEditorValue.value).toBe(raw)

    // jsonConfig 再变更也不回写字符串
    jsonConfig.value = '{"other":"value"}'
    await nextTick()
    expect(typeof jsonEditorValue.value).toBe('string')
    expect(jsonEditorValue.value).toBe(raw)
  })

  it('keeps jsonError clear on valid input', async () => {
    const { jsonError, jsonEditorValue } = mountSync()
    jsonEditorValue.value = '{"a":1}'
    await nextTick()
    expect(jsonError.value).toBe('')
  })
})
