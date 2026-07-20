<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h2>创建 CA 根证书</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">所属集群 <span class="required">*</span></label>
          <a-select v-model:value="form.cluster_id" style="width:100%;" :disabled="creating" placeholder="请选择集群">
            <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
          </a-select>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" placeholder="例如：生产环境 CA" :disabled="creating">
          </div>
          <div class="form-group">
            <label class="form-label">通用名称 CN</label>
            <input v-model="form.common_name" type="text" class="form-input" placeholder="默认取证书名称" :disabled="creating">
            <div class="form-hint">可选，默认使用证书名称</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">有效期</label>
          <input v-model.number="form.validity_days" type="number" class="form-input" min="1" max="36500" :disabled="creating">
          <div class="form-hint">天，默认 3650（10 年）</div>
        </div>

        <div v-if="errorMsg" class="form-error" style="margin-top:12px;">{{ errorMsg }}</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="creating">取消</button>
        <button class="btn btn-primary" @click="handleCreate" :disabled="creating || !form.cluster_id || !form.name.trim()">
          {{ creating ? '创建中...' : '创建 CA' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'

const props = defineProps<{
  visible: boolean
  clusters: any[]
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const form = reactive({
  cluster_id: null as number | null,
  name: '',
  common_name: '',
  validity_days: 3650,
})

const creating = ref(false)
const errorMsg = ref('')

async function handleCreate() {
  if (!form.cluster_id || !form.name.trim()) return
  creating.value = true
  errorMsg.value = ''

  try {
    const { default: api } = await import('@/api')
    await api.post(`/clusters/${form.cluster_id}/ssl/ca`, {
      name: form.name.trim(),
      common_name: form.common_name.trim() || undefined,
      validity_days: form.validity_days,
    })
    message.success('CA 根证书创建成功')
    emit('success')
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '创建失败'
    errorMsg.value = typeof detail === 'string' ? detail : '创建失败'
  } finally {
    creating.value = false
  }
}

function handleClose() {
  if (creating.value) return
  emit('close')
}

watch(() => props.visible, (v) => {
  if (v) {
    form.cluster_id = null
    form.name = ''
    form.common_name = ''
    form.validity_days = 3650
    errorMsg.value = ''
  }
})
</script>
