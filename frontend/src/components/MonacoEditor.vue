<template>
  <div ref="container" class="monaco-container" :style="{ height, width }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  language?: string
  height?: string
  width?: string
  readonly?: boolean
}>(), {
  language: 'yaml',
  height: '500px',
  width: '100%',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLDivElement>()
const editor = shallowRef<any>(null)

onMounted(async () => {
  const monaco = await import('monaco-editor')
  if (!container.value) return
  editor.value = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readonly,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    tabSize: 2,
    automaticLayout: true,
    wordWrap: 'on',
  })
  editor.value.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.value!.getValue())
  })
})

watch(() => props.modelValue, (val) => {
  if (editor.value && val !== editor.value.getValue()) {
    editor.value.setValue(val)
  }
})

watch(() => props.readonly, (val) => {
  editor.value?.updateOptions({ readOnly: val })
})

onBeforeUnmount(() => {
  editor.value?.dispose()
})
</script>

<style scoped>
.monaco-container {
  border: 1px solid var(--border, #d9d9d9);
  border-radius: 4px;
  overflow: hidden;
}
</style>
