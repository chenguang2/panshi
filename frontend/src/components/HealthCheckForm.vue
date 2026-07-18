<template>
  <div class="health-check-form" :class="{ disabled: !enabled }">
    <!-- Mode Selection -->
    <div class="mode-selector">
      <label class="radio-label">
        <input type="radio" value="active" v-model="mode" :disabled="!enabled">
        <span>仅主动检查</span>
      </label>
      <label class="radio-label">
        <input type="radio" value="passive" v-model="mode" :disabled="!enabled">
        <span>仅被动检查</span>
      </label>
      <label class="radio-label">
        <input type="radio" value="both" v-model="mode" :disabled="!enabled">
        <span>主动+被动</span>
      </label>
    </div>

    <div class="action-row">
      <button class="reset-btn" @click="resetToDefault" :disabled="!enabled" type="button">重置为默认</button>
      <button class="json-edit-btn" @click="openJsonEditor" :disabled="!enabled" type="button">编辑原始 JSON</button>
    </div>

    <!-- JSON Editor Modal -->
    <div v-if="jsonModalVisible" class="json-modal-overlay" @click.self="closeJsonEditor">
      <div class="json-modal">
        <div class="json-modal-header">
          <span>健康检查 JSON</span>
          <button class="json-modal-close" @click="closeJsonEditor">&times;</button>
        </div>
        <textarea v-model="jsonEditContent" class="json-textarea" rows="16"></textarea>
        <div class="json-modal-footer">
          <button class="btn btn-secondary" @click="closeJsonEditor">取消</button>
          <button class="btn btn-primary" @click="applyJsonEditor">应用</button>
        </div>
      </div>
    </div>

    <!-- Active Check Section -->
    <div v-if="mode === 'active' || mode === 'both'" class="check-section">
      <div class="section-title">主动检查配置</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="field-label">检查类型</label>
          <select v-model="activeForm.type" class="form-select" :disabled="!enabled">
            <option value="http">http</option>
            <option value="tcp">tcp</option>
          </select>
        </div>
        <div class="form-field" v-if="activeForm.type !== 'tcp'">
          <label class="field-label">检查路径</label>
          <input v-model="activeForm.http_path" type="text" class="form-input" :disabled="!enabled">
        </div>
        <div class="form-field">
          <label class="field-label">超时(秒)</label>
          <input v-model.number="activeForm.timeout" type="number" min="0" class="form-input" :disabled="!enabled">
        </div>
        <div class="form-field">
          <label class="field-label">间隔(秒)</label>
          <input v-model.number="activeForm.healthy.interval" type="number" min="0" class="form-input" :disabled="!enabled">
        </div>
        <div class="form-field">
          <label class="field-label">并发数</label>
          <input v-model.number="activeForm.concurrency" type="number" min="1" class="form-input" :disabled="!enabled">
        </div>
        <div class="form-field" v-if="activeForm.type !== 'tcp'">
          <label class="field-label">
            <input type="checkbox" v-model="activeForm.https_verify_certificate" :disabled="!enabled">
            HTTPS 验证证书
          </label>
        </div>
      </div>

      <details class="collapse-section">
        <summary class="collapse-header">健康判断</summary>
        <div class="collapse-body">
          <div class="form-grid">
            <div class="form-field">
              <label class="field-label">连续成功次数</label>
              <input v-model.number="activeForm.healthy.successes" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field" v-if="activeForm.type !== 'tcp'">
              <label class="field-label">健康 HTTP 状态码</label>
              <div class="tag-input-wrap">
                <input type="text" class="form-input" placeholder="输入状态码后回车" @keydown.enter.prevent="addHealthyStatus($event)" :disabled="!enabled">
                <div class="tag-list">
                  <span v-for="(code, i) in activeForm.healthy.http_statuses" :key="i" class="tag-item">
                    {{ code }}<span class="tag-remove" @click="removeHealthyStatus(i)">&times;</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="collapse-section">
        <summary class="collapse-header">不健康判断</summary>
        <div class="collapse-body">
          <div class="form-grid">
            <div class="form-field">
              <label class="field-label">连续失败次数</label>
              <input v-model.number="activeForm.unhealthy.http_failures" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field">
              <label class="field-label">TCP 失败次数</label>
              <input v-model.number="activeForm.unhealthy.tcp_failures" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field">
              <label class="field-label">超时次数</label>
              <input v-model.number="activeForm.unhealthy.timeouts" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field">
              <label class="field-label">不健康间隔(秒)</label>
              <input v-model.number="activeForm.unhealthy.interval" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field" v-if="activeForm.type !== 'tcp'">
              <label class="field-label">不健康 HTTP 状态码</label>
              <div class="tag-input-wrap">
                <input type="text" class="form-input" placeholder="输入状态码后回车" @keydown.enter.prevent="addUnhealthyStatus($event)" :disabled="!enabled">
                <div class="tag-list">
                  <span v-for="(code, i) in activeForm.unhealthy.http_statuses" :key="i" class="tag-item">
                    {{ code }}<span class="tag-remove" @click="removeUnhealthyStatus(i)">&times;</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>

    <!-- Passive Check Section -->
    <div v-if="mode === 'passive' || mode === 'both'" class="check-section">
      <div class="section-title">被动检查配置</div>
      <div class="form-grid">
        <div class="form-field">
          <label class="field-label">检查类型</label>
          <select v-model="passiveForm.type" class="form-select" :disabled="!enabled">
            <option value="http">http</option>
            <option value="tcp">tcp</option>
          </select>
        </div>
      </div>

      <details class="collapse-section">
        <summary class="collapse-header">被动健康判断</summary>
        <div class="collapse-body">
          <div class="form-grid">
            <div class="form-field">
              <label class="field-label">连续成功次数</label>
              <input v-model.number="passiveForm.healthy.successes" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field" v-if="passiveForm.type !== 'tcp'">
              <label class="field-label">健康 HTTP 状态码</label>
              <div class="tag-input-wrap">
                <input type="text" class="form-input" placeholder="输入状态码后回车" @keydown.enter.prevent="addPassiveHealthyStatus($event)" :disabled="!enabled">
                <div class="tag-list">
                  <span v-for="(code, i) in passiveForm.healthy.http_statuses" :key="i" class="tag-item">
                    {{ code }}<span class="tag-remove" @click="removePassiveHealthyStatus(i)">&times;</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="collapse-section">
        <summary class="collapse-header">被动不健康判断</summary>
        <div class="collapse-body">
          <div class="form-grid">
            <div class="form-field">
              <label class="field-label">连续失败次数</label>
              <input v-model.number="passiveForm.unhealthy.http_failures" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field">
              <label class="field-label">TCP 失败次数</label>
              <input v-model.number="passiveForm.unhealthy.tcp_failures" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field">
              <label class="field-label">超时次数</label>
              <input v-model.number="passiveForm.unhealthy.timeouts" type="number" min="0" class="form-input" :disabled="!enabled">
            </div>
            <div class="form-field" v-if="passiveForm.type !== 'tcp'">
              <label class="field-label">不健康 HTTP 状态码</label>
              <div class="tag-input-wrap">
                <input type="text" class="form-input" placeholder="输入状态码后回车" @keydown.enter.prevent="addPassiveUnhealthyStatus($event)" :disabled="!enabled">
                <div class="tag-list">
                  <span v-for="(code, i) in passiveForm.unhealthy.http_statuses" :key="i" class="tag-item">
                    {{ code }}<span class="tag-remove" @click="removePassiveUnhealthyStatus(i)">&times;</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { HealthCheckConfig, ActiveHealthCheck, PassiveHealthCheck, HealthThreshold, UnhealthyThreshold } from '@/types'

const props = defineProps<{
  checks: HealthCheckConfig | null
  enabled: boolean
  modelMode?: 'active' | 'passive' | 'both'
}>()

const emit = defineEmits<{
  'update:checks': [value: HealthCheckConfig | null]
  'update:enabled': [value: boolean]
  'update:modelMode': [value: 'active' | 'passive' | 'both']
}>()

const mode = computed({
  get: () => props.modelMode || 'active',
  set: (val: 'active' | 'passive' | 'both') => emit('update:modelMode', val),
})

function createDefaultActive(): ActiveHealthCheck {
  return {
    type: 'http',
    concurrency: 10,
    http_path: '/',
    https_verify_certificate: true,
    timeout: 1,
    healthy: {
      interval: 5,
      successes: 2,
      http_statuses: [200, 302, 403, 404],
    },
    unhealthy: {
      interval: 3,
      http_failures: 5,
      http_statuses: [429, 500, 501, 502, 503, 504, 505],
      tcp_failures: 2,
      timeouts: 3,
    },
  }
}

const activeForm = reactive<ActiveHealthCheck>(createDefaultActive())

function createDefaultPassive(): PassiveHealthCheck {
  return {
    type: 'http',
    healthy: {
      successes: 5,
      http_statuses: [200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 306, 307, 308],
    },
    unhealthy: {
      http_failures: 5,
      http_statuses: [429, 500, 503],
      tcp_failures: 2,
      timeouts: 7,
    },
  }
}

const passiveForm = reactive<PassiveHealthCheck>(createDefaultPassive())

function normalizeStatusCode(val: string): number | null {
  const num = parseInt(val, 10)
  if (isNaN(num) || num < 100 || num > 599) return null
  return num
}

function addStatusToList(list: number[], input: HTMLInputElement) {
  const val = input.value.trim()
  if (!val) return
  const code = normalizeStatusCode(val)
  if (code === null) return
  if (!list.includes(code)) {
    list.push(code)
    list.sort((a, b) => a - b)
  }
  input.value = ''
}

function addHealthyStatus(e: KeyboardEvent) {
  addStatusToList(activeForm.healthy.http_statuses!, e.target as HTMLInputElement)
}

function removeHealthyStatus(index: number) {
  activeForm.healthy.http_statuses!.splice(index, 1)
}

function addUnhealthyStatus(e: KeyboardEvent) {
  addStatusToList(activeForm.unhealthy.http_statuses!, e.target as HTMLInputElement)
}

function removeUnhealthyStatus(index: number) {
  activeForm.unhealthy.http_statuses!.splice(index, 1)
}

function resetToDefault() {
  const currentMode = mode.value
  if (currentMode === 'active' || currentMode === 'both') {
    Object.assign(activeForm, createDefaultActive())
  }
  if (currentMode === 'passive' || currentMode === 'both') {
    Object.assign(passiveForm, createDefaultPassive())
  }
}

// ── JSON Editor ──
const jsonModalVisible = ref(false)
const jsonEditContent = ref('')

function buildChecksJson(): string {
  return JSON.stringify(buildChecksFromForms(), null, 2)
}

function serializeFormObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue
    if (typeof val === 'object' && !Array.isArray(val) && val !== null) {
      const nested = serializeFormObject(val as Record<string, unknown>)
      if (Object.keys(nested).length > 0) out[key] = nested
    } else {
      out[key] = val
    }
  }
  return out
}

function openJsonEditor() {
  jsonEditContent.value = buildChecksJson()
  jsonModalVisible.value = true
}

function closeJsonEditor() {
  jsonModalVisible.value = false
}

function applyJsonEditor() {
  try {
    const parsed = JSON.parse(jsonEditContent.value)
    // Determine mode from parsed JSON
    const hasActive = 'active' in parsed && parsed.active !== undefined
    const hasPassive = 'passive' in parsed && parsed.passive !== undefined
    if (hasActive && hasPassive) emit('update:modelMode', 'both')
    else if (hasActive) emit('update:modelMode', 'active')
    else if (hasPassive) emit('update:modelMode', 'passive')
    // Backfill active section
    if (hasActive && parsed.active) {
      Object.assign(activeForm, mergeDeep(createDefaultActive(), parsed.active as Record<string, unknown>))
    }
    // Backfill passive section
    if (hasPassive && parsed.passive) {
      Object.assign(passiveForm, mergeDeep(createDefaultPassive(), parsed.passive as Record<string, unknown>))
    }
    jsonModalVisible.value = false
  } catch {
    // JSON parse error - allow user to fix
  }
}

function mergeDeep(defaults: object, override: Record<string, unknown>): object {
  const result = { ...defaults } as Record<string, unknown>
  for (const [key, val] of Object.entries(override)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val) && key in result && typeof result[key] === 'object') {
      result[key] = mergeDeep(result[key] as object, val as Record<string, unknown>)
    } else if (val !== undefined) {
      result[key] = val
    }
  }
  return result
}

// Extra fields storage (fields in JSON not in form)
const extraFields = ref<Record<string, unknown>>({})

function addPassiveHealthyStatus(e: KeyboardEvent) {
  addStatusToList(passiveForm.healthy.http_statuses!, e.target as HTMLInputElement)
}
function removePassiveHealthyStatus(index: number) {
  passiveForm.healthy.http_statuses!.splice(index, 1)
}
function addPassiveUnhealthyStatus(e: KeyboardEvent) {
  addStatusToList(passiveForm.unhealthy.http_statuses!, e.target as HTMLInputElement)
}
function removePassiveUnhealthyStatus(index: number) {
  passiveForm.unhealthy.http_statuses!.splice(index, 1)
}

// Watch form changes and emit updated checks
watch([activeForm, passiveForm, mode], () => {
  emit('update:checks', buildChecksFromForms())
}, { deep: true })

function buildChecksFromForms(): HealthCheckConfig {
  const result: HealthCheckConfig = {}
  const modeVal = mode.value
  const hasActive = modeVal === 'active' || modeVal === 'both'
  const hasPassive = modeVal === 'passive' || modeVal === 'both'
  if (hasActive) result.active = { ...activeForm }
  if (hasPassive) result.passive = { ...passiveForm }
  return result
}

watch(() => props.enabled, (val) => {
  if (!val) {
    emit('update:checks', null)
  }
})
</script>

<style scoped>
.health-check-form.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.mode-selector {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.radio-label input[type="radio"] {
  accent-color: var(--accent);
}
.check-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 12px;
}
.section-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
}
.form-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.form-field {
  flex: 0 0 calc(33.33% - 10px);
  min-width: 140px;
}
.field-label {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}
.form-input {
  width: 100%;
  height: 30px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--fg);
  box-sizing: border-box;
}
.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.form-select {
  width: 100%;
  height: 30px;
  padding: 0 6px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--fg);
  box-sizing: border-box;
}
.form-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.action-row button {
  padding: 3px 10px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  color: var(--muted);
}
.action-row button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.action-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.json-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.json-modal {
  background: var(--bg);
  border-radius: var(--radius-md);
  width: 600px;
  max-width: 90vw;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}
.json-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 10px;
  font-size: 14px;
}
.json-modal-close {
  border: none;
  background: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--muted);
}
.json-textarea {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  resize: vertical;
  background: var(--surface);
  color: var(--fg);
  box-sizing: border-box;
}
.json-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}
.btn {
  padding: 6px 16px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid var(--border);
}
.btn-secondary {
  background: var(--surface);
  color: var(--fg);
}
.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.collapse-section {
  margin-top: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}
.collapse-header {
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: var(--muted);
  user-select: none;
}
.collapse-body {
  padding-top: 8px;
}
.tag-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  font-size: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
}
.tag-remove {
  cursor: pointer;
  color: var(--muted);
  font-weight: bold;
}
.tag-remove:hover {
  color: var(--danger);
}
</style>
