import { ref, watch } from 'vue'

/**
 * PluginEditorDrawer 的 JSON 配置同步逻辑。
 *
 * jsonEditorValue  ↔  jsonConfig（json-editor-vue 的 v-model 值与内部文本的双向同步）
 *
 * 注意：json-editor-vue text 模式下 v-model 发出的是【原始文本字符串】，
 * 因此 jsonEditorValue 既可能是字符串（text 模式）也可能是对象（tree 模式）。
 */
export function usePluginConfigSync() {
  const jsonConfig = ref('')
  const jsonError = ref('')
  const jsonEditorValue = ref<unknown>({})

  // 同步 jsonEditorValue → jsonConfig
  // text 模式下 v-model 发出原始字符串 → 原样保留（单层 JSON）；对象/数组才 stringify
  watch(
    jsonEditorValue,
    (newVal) => {
      try {
        jsonConfig.value = typeof newVal === 'string' ? newVal : JSON.stringify(newVal)
        jsonError.value = ''
      } catch {
        // keep old value
      }
    },
    { deep: true },
  )

  // 同步 jsonConfig → jsonEditorValue
  // 仅当 jsonEditorValue 不是字符串（非 text 模式输入中）才回写对象，阻断字符串→对象反馈环
  watch(jsonConfig, (newVal) => {
    try {
      const parsed = JSON.parse(newVal || '{}')
      if (
        typeof jsonEditorValue.value !== 'string' &&
        JSON.stringify(parsed) !== JSON.stringify(jsonEditorValue.value)
      ) {
        jsonEditorValue.value = parsed
      }
      jsonError.value = ''
    } catch {
      // invalid JSON, don't sync back
    }
  })

  return { jsonConfig, jsonError, jsonEditorValue }
}
