<template>
  <a-modal v-model:open="modalOpen" :title="editingConfig ? '编辑全局规则' : '添加全局规则'" width="800px" :confirm-loading="submitting" @ok="handleSubmit">
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="basic" tab="基础配置">
        <a-form ref="formRef" :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入全局规则名称' }]">
            <a-input v-model:value="form.name" placeholder="请输入全局规则名称" />
          </a-form-item>
          <a-form-item label="所属集群" name="cluster_id" :rules="[{ required: true, message: '请选择所属集群' }]">
            <a-select v-model:value="form.cluster_id" :disabled="!!editingConfig">
              <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="描述" name="description">
            <a-textarea v-model:value="form.description" :rows="2" placeholder="可选描述" />
          </a-form-item>
        </a-form>
      </a-tab-pane>
      <a-tab-pane key="plugins" tab="插件配置">
        <PluginSelector v-model="form.selectedPlugins" :plugins="availablePlugins" />
      </a-tab-pane>
    </a-tabs>
    <template #footer>
      <a-button @click="$emit('close')">取消</a-button>
      <a-button type="primary" :loading="submitting" @click="handleSubmit">{{ editingConfig ? '保存' : '创建' }}</a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PluginSelector from '@/components/PluginSelector.vue'

const props = defineProps<{
  visible: boolean
  editingConfig: any | null
  clusters: { id: number; name: string; display_name?: string }[]
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const modalOpen = computed({ get: () => props.visible, set: (v) => { if (!v) emit('close') } })
const formRef = ref()
const activeTab = ref('basic')
const submitting = ref(false)
const availablePlugins = ref<any[]>([])

const form = reactive({
  name: '',
  cluster_id: null as number | null,
  description: '',
  selectedPlugins: [] as any[],
})

watch(() => props.visible, async (v) => {
  if (!v) return
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch { availablePlugins.value = [] }
  if (props.editingConfig) {
    const gr = props.editingConfig
    form.name = gr.name
    form.cluster_id = gr.cluster_id
    form.description = gr.description || ''
    form.selectedPlugins = Object.entries(gr.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
      plugin_name, config: JSON.stringify(config)
    }))
  } else {
    form.name = ''
    form.cluster_id = null
    form.description = ''
    form.selectedPlugins = []
  }
  activeTab.value = 'basic'
})

async function handleSubmit() {
  try { if ((formRef.value as any)?.validate) await (formRef.value as any).validate() } catch { return }
  submitting.value = true
  try {
    const plugins: Record<string, any> = {}
    for (const sp of form.selectedPlugins) {
      if (sp.config) {
        try { plugins[sp.plugin_name] = JSON.parse(sp.config) } catch { plugins[sp.plugin_name] = sp.config }
      } else {
        plugins[sp.plugin_name] = {}
      }
    }
    const payload: any = { name: form.name, description: form.description, plugins }
    const cid = form.cluster_id
    if (props.editingConfig) {
      await api.put(`/clusters/${cid}/global_rules/${props.editingConfig.id}`, payload)
      message.success('全局规则已更新')
    } else {
      await api.post(`/clusters/${cid}/global_rules`, payload)
      message.success('全局规则已创建')
    }
    emit('saved'); emit('close')
  } catch { message.error('保存失败') }
  finally { submitting.value = false }
}
</script>
