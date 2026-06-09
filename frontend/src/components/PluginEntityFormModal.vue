<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:800px;">
      <div class="modal-header">
        <h2>{{ editingConfig ? '编辑' + displayName : '添加' + displayName }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'plugins' }" @click="activeTab = 'plugins'">插件配置</button>
      </div>

      <div class="modal-body">
        <div v-show="activeTab === 'basic'">
          <div class="form-group">
            <label class="form-label">名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" :placeholder="'请输入' + displayName + '名称'">
            <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="form.cluster_id" class="form-input" :disabled="!!editingConfig">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
            <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea v-model="form.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
          </div>
        </div>

        <div v-show="activeTab === 'plugins'">
          <PluginSelector v-model="form.selectedPlugins" :plugins="availablePlugins" />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '保存中...' : (editingConfig ? '保存' : '创建') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PluginSelector from '@/components/PluginSelector.vue'

const props = defineProps<{
  visible: boolean
  editingConfig: any | null
  clusters: { id: number; name: string; display_name?: string }[]
  resourceType: 'plugin_config' | 'global_rule'
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const displayName = props.resourceType === 'plugin_config' ? '插件组' : '全局规则'
const apiEndpoint = props.resourceType === 'plugin_config' ? 'plugin_configs' : 'global_rules'

const activeTab = ref('basic')
const submitting = ref(false)
const formErrors = reactive<Record<string, string>>({})
const availablePlugins = ref<any[]>([])

const form = reactive({
  name: '',
  cluster_id: '' as number | string,
  description: '',
  selectedPlugins: [] as any[],
})

watch(() => props.visible, async (v) => {
  if (!v) return
  formErrors.name = ''
  formErrors.cluster_id = ''
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch { availablePlugins.value = [] }
  if (props.editingConfig) {
    const item = props.editingConfig
    form.name = item.name
    form.cluster_id = item.cluster_id
    form.description = item.description || ''
    form.selectedPlugins = Object.entries(item.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
      plugin_name, config: JSON.stringify(config)
    }))
  } else {
    form.name = ''
    form.cluster_id = ''
    form.description = ''
    form.selectedPlugins = []
  }
  activeTab.value = 'basic'
})

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.cluster_id = ''
  if (!form.name.trim()) { formErrors.name = `请输入${displayName}名称`; return false }
  if (!form.cluster_id) { formErrors.cluster_id = '请选择所属集群'; return false }
  return true
}

async function handleSubmit() {
  if (!validateForm()) return
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
      await api.put(`/clusters/${cid}/${apiEndpoint}/${props.editingConfig.id}`, payload)
      message.success(`${displayName}已更新`)
    } else {
      await api.post(`/clusters/${cid}/${apiEndpoint}`, payload)
      message.success(`${displayName}已创建`)
    }
    emit('saved'); emit('close')
  } catch { message.error('保存失败') }
  finally { submitting.value = false }
}
</script>

<style scoped>
.form-group { margin-bottom: 16px; }
.form-label {
  display: block; margin-bottom: 6px; font-size: 13px;
  color: var(--muted); font-weight: 500;
}
.required { color: var(--danger); }
.form-error { font-size: 12px; color: var(--danger); margin-top: 2px; }
</style>
