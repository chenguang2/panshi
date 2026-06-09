<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal">
      <div class="modal-header">
        <h2>{{ editingCluster ? '编辑集群' : '添加集群' }}</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">名称 <span class="required">*</span></label>
          <input type="text" class="form-input" :class="{ 'has-error': formErrors.name }" v-model="form.name" :disabled="!!editingCluster" @blur="validateName" />
          <span class="form-error" v-if="formErrors.name">{{ formErrors.name }}</span>
          <span class="form-hint" v-else>小写字母、数字、中划线组成，中划线不能在首尾</span>
        </div>
        <div class="form-group">
          <label class="form-label">显示名称 <span class="required">*</span></label>
          <input type="text" class="form-input" :class="{ 'has-error': formErrors.display_name }" v-model="form.display_name" />
          <span class="form-error" v-if="formErrors.display_name">{{ formErrors.display_name }}</span>
        </div>
        <div class="form-group">
          <label class="form-label">分组</label>
          <select class="form-input" v-model="form.group_name" @change="onGroupChange">
            <option value="">未分类</option>
            <option v-for="g in allGroupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__new__">新建分组...</option>
          </select>
          <div v-if="showNewGroupInput" class="inline-group" style="display: flex; gap: 4px; margin-top: 6px;">
            <input type="text" class="form-input" v-model="newGroupName" placeholder="新建分组名称" @keyup.enter="addNewGroup" style="flex: 1;" />
            <button class="btn btn-sm btn-primary" @click="addNewGroup">添加</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-input" v-model="form.description" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Admin Key</label>
          <input type="password" class="form-input" v-model="form.admin_key" placeholder="Edge 节点 Admin API 密钥" />
        </div>
        <div class="form-group">
          <label class="form-label">状态</label>
          <select class="form-input" v-model="form.status">
            <option value="1">正常</option>
            <option value="0">禁用</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '保存中...' : (editingCluster ? '保存' : '创建') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
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

const submitting = ref(false)
const showNewGroupInput = ref(false)
const newGroupName = ref('')
/** Holds a newly created group name that isn't in groupOptions yet */
const pendingGroupName = ref('')
/** Combined options: prop groupOptions + any newly created group */
const allGroupOptions = computed(() => {
  const base = [...props.groupOptions]
  // Remove empty string (represented by dedicated "未分类" option)
  const filtered = base.filter(g => g !== '')
  if (pendingGroupName.value && !filtered.includes(pendingGroupName.value)) {
    filtered.push(pendingGroupName.value)
  }
  return filtered
})
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const form = reactive({
  name: '',
  display_name: '',
  group_name: '',
  description: '',
  status: '1' as string | number,
  admin_key: '',
})

const formErrors = reactive({
  name: '',
  display_name: '',
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
  formErrors.name = ''
  formErrors.display_name = ''
  showNewGroupInput.value = false
  pendingGroupName.value = ''
})

function onGroupChange() {
  if (form.group_name === '__new__') {
    showNewGroupInput.value = true
    newGroupName.value = ''
    pendingGroupName.value = ''
  } else {
    showNewGroupInput.value = false
    pendingGroupName.value = ''
  }
}

function addNewGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  pendingGroupName.value = name
  form.group_name = name  // now safe: allGroupOptions includes this value
  newGroupName.value = ''
  showNewGroupInput.value = false
}

function validateName(): boolean {
  if (!form.name) {
    formErrors.name = '请输入集群名称'
    return false
  }
  if (!NAME_PATTERN.test(form.name)) {
    formErrors.name = '集群名称只能包含小写字母、数字和中划线，中划线不能在首尾'
    return false
  }
  formErrors.name = ''
  return true
}

function handleCancel() {
  emit('close')
}

async function handleSubmit() {
  if (!validateName()) return
  if (!form.display_name) {
    formErrors.display_name = '请输入显示名称'
    return
  }
  submitting.value = true
  try {
    const data = {
      name: form.name,
      display_name: form.display_name,
      description: form.description,
      group_name: form.group_name === '__new__' ? '' : form.group_name || '',
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
.form-group { margin-bottom: 16px; }
.form-label {
  display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500;
  color: var(--fg);
}
.form-input {
  width: 100%; padding: 6px 12px; font-size: 14px; color: var(--fg);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); outline: none; box-sizing: border-box;
}
.form-input:hover { border-color: var(--accent); }
.form-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px oklch(56% 0.16 210 / 12%); }
.form-input.has-error { border-color: #ff4d4f; }
.form-input.has-error:focus { box-shadow: 0 0 0 3px oklch(56% 0.28 27 / 12%); }
textarea.form-input { resize: vertical; min-height: 60px; }
.form-error { display: block; margin-top: 2px; font-size: 12px; color: #ff4d4f; }
.form-hint { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); }
select.form-input { cursor: pointer; }
</style>
