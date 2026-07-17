<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:680px;">
      <div class="modal-header">
        <h2>生成国密证书</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <!-- 生成方式 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">生成方式</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" v-model="form.mode" value="local" :disabled="generating" />
                本地生成
              </label>
              <label class="radio-label">
                <input type="radio" v-model="form.mode" value="remote" :disabled="generating" />
                远程生成
              </label>
            </div>
          </div>
        </div>

        <!-- 集群 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="form.cluster_id" class="form-input" :class="{ 'has-error': errors.cluster_id }" :disabled="generating" @change="onClusterChange">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
            <div v-if="errors.cluster_id" class="form-error">{{ errors.cluster_id }}</div>
          </div>

          <!-- 远程时显示节点 -->
          <div v-if="form.mode === 'remote'" class="form-group">
            <label class="form-label">执行节点 <span class="required">*</span></label>
            <select v-model="form.node_id" class="form-input" :class="{ 'has-error': errors.node_id }" :disabled="generating || nodesLoading">
              <option value="">请选择节点</option>
              <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.ip }}:{{ n.management_port || '22' }}</option>
            </select>
            <div v-if="errors.node_id" class="form-error">{{ errors.node_id }}</div>
            <div v-if="!form.cluster_id && form.mode === 'remote'" class="form-hint">请先选择集群</div>
          </div>
        </div>

        <!-- 证书参数 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" :class="{ 'has-error': errors.name }" placeholder="输入证书名称" :disabled="generating">
            <div v-if="errors.name" class="form-error">{{ errors.name }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">通用名称 CN <span class="required">*</span></label>
            <input v-model="form.common_name" type="text" class="form-input" :class="{ 'has-error': errors.common_name }" placeholder="example.com" :disabled="generating">
            <div v-if="errors.common_name" class="form-error">{{ errors.common_name }}</div>
          </div>
        </div>

        <!-- 域名 SAN -->
        <div class="form-group">
          <label class="form-label">域名 SAN</label>
          <div class="tag-input" @click="dnsInputRef?.focus()">
            <span v-for="(tag, i) in dnsTags" :key="i" class="tag-item">
              <span class="tag-text">{{ tag }}</span>
              <span class="tag-remove" @click.stop="removeDnsTag(i)">&times;</span>
            </span>
            <input ref="dnsInputRef" v-model="dnsInput" type="text" class="tag-input-field" placeholder="输入域名后按 Enter" :disabled="generating" @keydown.enter.prevent="addDnsTag" @keydown.="addDnsTagOnComma">
          </div>
        </div>

        <!-- IP SAN -->
        <div class="form-group">
          <label class="form-label">IP SAN</label>
          <div class="tag-input" @click="ipInputRef?.focus()">
            <span v-for="(tag, i) in ipTags" :key="i" class="tag-item">
              <span class="tag-text">{{ tag }}</span>
              <span class="tag-remove" @click.stop="removeIpTag(i)">&times;</span>
            </span>
            <input ref="ipInputRef" v-model="ipInput" type="text" class="tag-input-field" placeholder="输入 IP 后按 Enter" :disabled="generating" @keydown.enter.prevent="addIpTag" @keydown.="addIpTagOnComma">
          </div>
        </div>

        <!-- 其他参数 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">有效期</label>
            <input v-model.number="form.validity_days" type="number" class="form-input" min="1" max="36500" :disabled="generating">
            <div class="form-hint">天，默认 365</div>
          </div>
          <div class="form-group">
            <label class="form-label">证书类型</label>
            <a-select v-model:value="form.cert_type" style="width:100%;" :disabled="generating">
              <a-select-option value="server">
                <div style="font-weight:600;font-size:13px;">server（服务端）</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">接收浏览器访问</div>
              </a-select-option>
              <a-select-option value="client">
                <div style="font-weight:600;font-size:13px;">client（客户端）</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">用于网关之间的认证</div>
              </a-select-option>
            </a-select>
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.dual_cert" :disabled="generating" />
            同时生成加密证书和签名证书（双证书模式）
          </label>
        </div>

        <!-- 进度提示 -->
        <div v-if="generating" class="progress-section">
          <div class="progress-step" v-for="(step, i) in steps" :key="i" :class="{ active: step.active, done: step.done, error: step.error }">
            <span class="step-icon">{{ step.done ? '✓' : step.error ? '✗' : step.active ? '○' : '○' }}</span>
            <span class="step-text">{{ step.label }}</span>
          </div>
        </div>

        <!-- 错误信息 -->
        <div v-if="errorMsg" class="form-error" style="margin-top:12px;">{{ errorMsg }}</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="generating">取消</button>
        <button class="btn btn-primary" @click="handleGenerate" :disabled="generating || !canGenerate">
          {{ generating ? '生成中...' : '生成并保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { generateSslCertificate } from '@/api/ssl'
import { getClusterNodes } from '@/api/nodes'

const props = defineProps<{
  visible: boolean
  clusters: any[]
}>()

const emit = defineEmits<{
  close: []
  success: [cert: any]
}>()

const dnsInputRef = ref<HTMLInputElement | null>(null)
const ipInputRef = ref<HTMLInputElement | null>(null)

const form = reactive({
  mode: 'local' as 'local' | 'remote',
  cluster_id: '',
  node_id: '' as number | '',
  name: '',
  common_name: '',
  validity_days: 365,
  cert_type: 'server',
  dual_cert: true,
})

const dnsInput = ref('')
const ipInput = ref('')
const dnsTags = ref<string[]>([])
const ipTags = ref<string[]>([])
const nodes = ref<any[]>([])
const nodesLoading = ref(false)
const generating = ref(false)
const errorMsg = ref('')
const steps = ref([
  { label: '检测环境', active: false, done: false, error: false },
  { label: '生成密钥对', active: false, done: false, error: false },
  { label: '生成 CSR', active: false, done: false, error: false },
  { label: '签发证书', active: false, done: false, error: false },
  { label: '保存记录', active: false, done: false, error: false },
])

const errors = reactive({
  cluster_id: '',
  node_id: '',
  name: '',
  common_name: '',
})

const canGenerate = computed(() => {
  return form.name.trim() && form.common_name.trim() && form.cluster_id &&
    (form.mode === 'local' || (form.mode === 'remote' && form.node_id !== ''))
})

function validate(): boolean {
  errors.cluster_id = ''
  errors.node_id = ''
  errors.name = ''
  errors.common_name = ''
  let valid = true
  if (!form.cluster_id) { errors.cluster_id = '请选择集群'; valid = false }
  if (!form.name.trim()) { errors.name = '请输入证书名称'; valid = false }
  if (!form.common_name.trim()) { errors.common_name = '请输入通用名称'; valid = false }
  if (form.mode === 'remote' && form.node_id === '') { errors.node_id = '请选择执行节点'; valid = false }
  return valid
}

function resetSteps() {
  steps.value = steps.value.map(s => ({ ...s, active: false, done: false, error: false }))
}

function setStepActive(index: number) {
  steps.value[index].active = true
  steps.value[index].done = false
  steps.value[index].error = false
}

function setStepDone(index: number) {
  steps.value[index].active = false
  steps.value[index].done = true
}

function setStepError(index: number) {
  steps.value[index].active = false
  steps.value[index].error = true
}

async function onClusterChange() {
  form.node_id = ''
  nodes.value = []
  if (!form.cluster_id || form.mode !== 'remote') return
  await loadNodes()
}

async function loadNodes() {
  if (!form.cluster_id) return
  nodesLoading.value = true
  try {
    const res = await getClusterNodes(Number(form.cluster_id))
    nodes.value = res.data?.items || []
    // 自动选中第一个节点
    if (nodes.value.length > 0 && !form.node_id) {
      form.node_id = nodes.value[0].id
    }
  } catch {
    nodes.value = []
  } finally {
    nodesLoading.value = false
  }
}

async function handleGenerate() {
  if (!validate()) return
  generating.value = true
  errorMsg.value = ''
  resetSteps()

  try {
    setStepActive(0)
    await new Promise(r => setTimeout(r, 300)) // simulate check
    setStepDone(0)

    setStepActive(1)
    await new Promise(r => setTimeout(r, 200))
    setStepDone(1)

    setStepActive(2)
    await new Promise(r => setTimeout(r, 200))
    setStepDone(2)

    setStepActive(3)
    await new Promise(r => setTimeout(r, 200))
    setStepDone(3)

    setStepActive(4)
    const result = await generateSslCertificate(Number(form.cluster_id), {
      name: form.name.trim(),
      common_name: form.common_name.trim(),
      dns_sans: dnsTags.value.length > 0 ? dnsTags.value : undefined,
      ip_sans: ipTags.value.length > 0 ? ipTags.value : undefined,
      validity_days: form.validity_days,
      dual_cert: form.dual_cert,
      cert_type: form.cert_type,
      mode: form.mode,
      node_id: form.mode === 'remote' ? (form.node_id || null) : null,
    })
    setStepDone(4)

    const certData = result?.data || result
    emit('success', certData)
    handleClose()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '生成失败'
    errorMsg.value = typeof detail === 'string' ? detail : '生成失败'
    // Mark the active step as failed
    const activeIdx = steps.value.findIndex(s => s.active)
    if (activeIdx >= 0) setStepError(activeIdx)
  } finally {
    generating.value = false
  }
}

function handleClose() {
  if (generating.value) return
  emit('close')
}

function addDnsTag() {
  const v = dnsInput.value.trim()
  if (v && !dnsTags.value.includes(v)) dnsTags.value.push(v)
  dnsInput.value = ''
}

function addIpTag() {
  const v = ipInput.value.trim()
  if (v && !ipTags.value.includes(v)) ipTags.value.push(v)
  ipInput.value = ''
}

function addDnsTagOnComma(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addDnsTag() }
}
function addIpTagOnComma(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addIpTag() }
}

function removeDnsTag(i: number) { dnsTags.value.splice(i, 1) }
function removeIpTag(i: number) { ipTags.value.splice(i, 1) }

// Reset form when opened
watch(() => props.visible, (v) => {
  if (v) {
    form.mode = 'local'
    form.cluster_id = ''
    form.node_id = ''
    form.name = ''
    form.common_name = ''
    form.validity_days = 365
    form.cert_type = 'server'
    form.dual_cert = true
    dnsTags.value = []
    ipTags.value = []
    nodes.value = []
    errorMsg.value = ''
    resetSteps()
  }
})
</script>

<style scoped>
.radio-group { display: flex; gap: 20px; padding: 8px 0; }
.radio-label { cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.radio-label input { margin: 0; }
.checkbox-label { cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.checkbox-label input { margin: 0; }
.tag-input { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius); min-height: 36px; cursor: text; background: var(--surface); }
.tag-input:focus-within { border-color: var(--primary); }
.tag-item { display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 12px; }
.tag-text { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-remove { cursor: pointer; font-size: 14px; line-height: 1; color: var(--muted); margin-left: 2px; }
.tag-remove:hover { color: var(--danger); }
.tag-input-field { border: none; outline: none; flex: 1; min-width: 120px; font-size: 13px; background: transparent; padding: 2px 0; }
.form-hint { font-size: 11px; color: var(--muted); margin-top: 2px; }
.progress-section { margin-top: 16px; padding: 12px; background: var(--bg); border-radius: var(--radius); }
.progress-step { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--muted); }
.progress-step.active { color: var(--primary); }
.progress-step.done { color: var(--success); }
.progress-step.error { color: var(--danger); }
.step-icon { width: 18px; text-align: center; font-weight: bold; }
</style>
