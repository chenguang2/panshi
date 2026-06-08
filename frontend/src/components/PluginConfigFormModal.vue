<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:800px;">
      <div class="modal-header">
        <h2>{{ editingConfig ? '编辑插件组' : '添加插件组' }}</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基础配置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'plugins' }" @click="activeTab = 'plugins'">插件配置</button>
      </div>

      <div class="modal-body">
        <!-- 基础配置 -->
        <div v-show="activeTab === 'basic'">
          <div class="form-group">
            <label class="form-label">名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" placeholder="请输入插件组名称">
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

        <!-- 插件配置 -->
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
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

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
    const pc = props.editingConfig
    form.name = pc.name
    form.cluster_id = pc.cluster_id
    form.description = pc.description || ''
    form.selectedPlugins = Object.entries(pc.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
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
  if (!form.name.trim()) { formErrors.name = '请输入插件组名称'; return false }
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
      await api.put(`/clusters/${cid}/plugin_configs/${props.editingConfig.id}`, payload)
      message.success('插件组已更新')
    } else {
      await api.post(`/clusters/${cid}/plugin_configs`, payload)
      message.success('插件组已创建')
    }
    emit('saved'); emit('close')
  } catch { message.error('保存失败') }
  finally { submitting.value = false }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 600px; max-height: 85vh;
  display: flex; flex-direction: column;
}
.modal-wide { max-width: 800px; }
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
}
.modal-header h2 { margin: 0; font-size: 16px; font-weight: 600; color: var(--fg); }
.modal-close {
  width: 28px; height: 28px; border: none; background: transparent;
  font-size: 20px; cursor: pointer; color: var(--muted); border-radius: var(--radius-sm);
}
.modal-close:hover { background: var(--bg); color: var(--fg); }

.tab-bar {
  display: flex; gap: 0; border-bottom: 1px solid var(--border);
  padding: 0 20px; background: var(--surface);
}
.tab-btn {
  padding: 10px 20px; border: none; background: transparent;
  font-size: 13px; font-weight: 500; color: var(--muted);
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all 0.15s; font-family: var(--font-body);
}
.tab-btn:hover { color: var(--fg); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }

.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--border);
}

.form-group { margin-bottom: 16px; }
.form-label {
  display: block; margin-bottom: 6px; font-size: 13px;
  color: var(--muted); font-weight: 500;
}
.required { color: var(--danger); }
.form-error { font-size: 12px; color: var(--danger); margin-top: 2px; }
</style>
