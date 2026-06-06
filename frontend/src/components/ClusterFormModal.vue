<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal">
      <div class="modal-header">
        <h2>{{ editingCluster ? '编辑集群' : '添加集群' }}</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
      </div>
      <div class="modal-body">
        <a-form ref="formRef" :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="名称" name="name" :validate-status="nameError ? 'error' : ''" :help="nameError || '小写字母、数字、中划线组成，中划线不能在首尾'">
            <a-input v-model:value="form.name" :disabled="!!editingCluster" @blur="validateName" />
          </a-form-item>
          <a-form-item label="显示名称" name="display_name" :rules="[{ required: true, message: '请输入显示名称' }]">
            <a-input v-model:value="form.display_name" />
          </a-form-item>
          <a-form-item label="分组" name="group_name">
            <a-select v-model:value="form.group_name">
              <template #dropdownRender="{ menuNode }">
                <div>
                <component :is="menuNode" />
                <div style="padding: 2px 8px 8px; display: flex; gap: 4px;">
                    <a-input v-model:value="newGroupName" placeholder="新建分组名称" size="small" @pressEnter="addNewGroup" />
                    <a-button size="small" type="primary" @click="addNewGroup">添加</a-button>
                  </div>
                </div>
              </template>
              <a-select-option value="">未分类</a-select-option>
              <a-select-option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="描述" name="description">
            <a-textarea v-model:value="form.description" :rows="3" />
          </a-form-item>
          <a-form-item label="Admin Key" name="admin_key">
            <a-input-password v-model:value="form.admin_key" placeholder="Edge 节点 Admin API 密钥" />
          </a-form-item>
          <a-form-item label="状态" name="status">
            <a-select v-model:value="form.status">
              <a-select-option value="1">正常</a-select-option>
              <a-select-option value="0">禁用</a-select-option>
            </a-select>
          </a-form-item>
        </a-form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '保存中...' : (editingCluster ? '保存' : '创建') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster } from '@/types'

const props = defineProps<{
  visible: boolean
  editingCluster: Cluster | null
  groupOptions: string[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const formRef = ref()
const submitting = ref(false)
const nameError = ref('')
const newGroupName = ref('')
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const form = reactive({
  name: '',
  display_name: '',
  group_name: '',
  description: '',
  status: '1' as string | number,
  admin_key: '',
})

watch(() => props.visible, (v) => {
  if (!v) return
  if (props.editingCluster) {
    form.name = props.editingCluster.name
    form.display_name = props.editingCluster.display_name || ''
    form.group_name = props.editingCluster.group_name || ''
    form.description = props.editingCluster.description || ''
    form.status = String(props.editingCluster.status)
    form.admin_key = (props.editingCluster as any).admin_key || ''
  } else {
    form.name = ''
    form.display_name = ''
    form.group_name = ''
    form.description = ''
    form.status = '1'
    form.admin_key = ''
  }
  nameError.value = ''
})

function onNameInput() {
  validateName()
}

function validateName(): boolean {
  if (!form.name) {
    nameError.value = '请输入集群名称'
    return false
  }
  if (!NAME_PATTERN.test(form.name)) {
    nameError.value = '集群名称只能包含小写字母、数字和中划线，中划线不能在首尾'
    return false
  }
  nameError.value = ''
  return true
}

function addNewGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  form.group_name = name
  newGroupName.value = ''
}

function handleCancel() {
  emit('close')
}

async function handleSubmit() {
  if (!validateName()) return
  try { if (formRef.value) await formRef.value.validate() } catch { return }
  submitting.value = true
  try {
    const data = {
      name: form.name,
      display_name: form.display_name,
      description: form.description,
      group_name: form.group_name || '',
      status: form.status === '1' ? 1 : 0,
      admin_key: form.admin_key || undefined,
    }
    if (props.editingCluster) {
      await api.put(`/clusters/${props.editingCluster.id}`, data)
      message.success('集群已更新')
    } else {
      await api.post('/clusters', data)
      message.success('集群已创建')
    }
    emit('saved')
    emit('close')
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  } finally { submitting.value = false }
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
  width: 100%; max-width: 600px; max-height: 80vh;
  display: flex; flex-direction: column;
}
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
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--border);
}
/* White input style matching NodeList */
:deep(.ant-input) { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: var(--radius-md) !important; }
:deep(.ant-input:hover) { border-color: var(--accent) !important; }
:deep(.ant-input:focus) { border-color: var(--accent) !important; box-shadow: 0 0 0 3px oklch(56% 0.16 210 / 12%) !important; }
:deep(.ant-input-affix-wrapper) { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: var(--radius-md) !important; padding: 0 11px !important; }
:deep(.ant-input-affix-wrapper .ant-input) { background: transparent !important; border: none !important; box-shadow: none !important; }
:deep(.ant-input-affix-wrapper:hover) { border-color: var(--accent) !important; }
:deep(.ant-input-affix-wrapper:focus-within) { border-color: var(--accent) !important; box-shadow: 0 0 0 3px oklch(56% 0.16 210 / 12%) !important; }
:deep(.ant-select-selector) { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: var(--radius-md) !important; }
:deep(.ant-select:hover .ant-select-selector) { border-color: var(--accent) !important; }
:deep(.ant-select-focused .ant-select-selector) { border-color: var(--accent) !important; box-shadow: 0 0 0 3px oklch(56% 0.16 210 / 12%) !important; }
:deep(textarea.ant-input) { resize: vertical; min-height: 60px; }
:deep(.ant-select-dropdown) { padding: 0; }
:deep(.ant-select-item) { min-height: 30px; }
</style>
