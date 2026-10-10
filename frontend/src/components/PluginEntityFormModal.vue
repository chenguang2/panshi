<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width: 800px">
      <div class="modal-header">
        <h2>{{ editingConfig ? '编辑' + displayName : '添加' + displayName }}</h2>
        <button class="modal-close" @click="requestClose">&times;</button>
      </div>

      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">
          基础配置
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'plugins' }" @click="activeTab = 'plugins'">
          插件配置
        </button>
      </div>

      <div class="modal-body">
        <div v-show="activeTab === 'basic'">
          <div class="form-group">
            <label class="form-label">名称 <span class="required">*</span></label>
            <!-- 7.4：maxlength=100 对齐后端约束，超长错误不以后端英文校验信息暴露 -->
            <input
              v-model="form.name"
              type="text"
              class="form-input"
              maxlength="100"
              :placeholder="'请输入' + displayName + '名称'"
            />
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
          <PluginSelector v-model="form.selectedPlugins" :plugins="catalogPlugins" />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="requestClose">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '保存中...' : editingConfig ? '保存' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, computed } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PluginSelector from '@/components/PluginSelector.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { getApiErrorMessage } from '@/utils/error'
import { useFeaturesStore } from '@/stores/features'

const props = defineProps<{
  visible: boolean
  editingConfig: any | null
  clusters: { id: number; name: string; display_name?: string }[]
  resourceType: 'plugin_config' | 'global_rule'
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const displayName = props.resourceType === 'plugin_config' ? '插件组' : '全局规则'
const apiEndpoint = props.resourceType === 'plugin_config' ? 'plugin_configs' : 'global_rules'

const featuresStore = useFeaturesStore()

const activeTab = ref('basic')
const submitting = ref(false)
const formErrors = reactive<Record<string, string>>({})
const availablePlugins = ref<any[]>([])

/**
 * H2（A1 二次修订，8.3 两入口单点）：global_rule 资源按 features.yaml 专用清单
 * global_rule_plugins 过滤插件目录——清单空/未配置 = 不限制（目录全量），
 * enabled_plugins 已在 /plugins/builtin 目录层作为平台硬上限并行生效，
 * 最终可见集 = 目录 ∩ 清单。plugin_config 资源不受清单约束。
 */
const catalogPlugins = computed(() => {
  if (props.resourceType !== 'global_rule') return availablePlugins.value
  const allowed = featuresStore.globalRulePlugins
  if (!allowed || allowed.length === 0) return availablePlugins.value
  return availablePlugins.value.filter((p) => allowed.includes(p.name))
})

const form = reactive({
  name: '',
  cluster_id: '' as number | string,
  description: '',
  selectedPlugins: [] as { plugin_name: string; config: string }[],
})

// ── 误关保护（对齐 UpstreamFormModal 先例）：字段变更置 dirty；回填/保存成功清除 ──
const isDirty = ref(false)
/** populateForm 批量回填期间挂起 dirty 监听，避免打开即误判为已修改 */
let suppressDirtyWatch = false

watch(
  form,
  () => {
    if (!suppressDirtyWatch) isDirty.value = true
  },
  { deep: true },
)

// 注意：初始化回填放 watch 回调（不追踪），严禁改用 watchEffect 读取表单字段（AGENTS #55 会把一次性
// 回填变成响应式重触发，表单打不上字）
watch(
  () => props.visible,
  (v) => {
    if (!v) return
    void populateForm()
  },
)

async function populateForm() {
  suppressDirtyWatch = true
  formErrors.name = ''
  formErrors.cluster_id = ''
  // features 清单兜底加载（main.ts 启动时已预载；此处仅覆盖未加载的边角，失败静默 = 不限制）
  featuresStore.load().catch(() => {})
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch {
    availablePlugins.value = []
  }
  if (props.editingConfig) {
    const item = props.editingConfig
    form.name = item.name
    form.cluster_id = item.cluster_id
    form.description = item.description || ''
    form.selectedPlugins = Object.entries(item.plugins || {}).map(([plugin_name, config]: [string, any]) => ({
      plugin_name,
      config: JSON.stringify(config),
    }))
  } else {
    form.name = ''
    form.cluster_id = ''
    form.description = ''
    form.selectedPlugins = []
  }
  activeTab.value = 'basic'
  // 监听 flush 发生在 nextTick 前，故在 nextTick 里解除并清脏
  nextTick(() => {
    suppressDirtyWatch = false
    isDirty.value = false
  })
}

/** 4.1 跨 Tab 校验失败：切回「基础配置」Tab 并给出可见警告（不静默失败） */
function failAtBasic(): false {
  activeTab.value = 'basic'
  message.warning('请完善「基础配置」：名称与所属集群为必填')
  return false
}

function validateForm(): boolean {
  formErrors.name = ''
  formErrors.cluster_id = ''
  if (!form.name.trim()) {
    formErrors.name = `请输入${displayName}名称`
    return failAtBasic()
  }
  if (!form.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    return failAtBasic()
  }
  return true
}

// ── 误关保护：× / 取消经 dirty 确认；无修改直接关闭 ──
function requestClose() {
  if (!isDirty.value) {
    emit('close')
    return
  }
  showOverlayModal({
    title: '未保存的更改',
    content: '更改尚未保存，确定放弃？',
    okText: '放弃更改',
    cancelText: '继续编辑',
    okDanger: true,
    onOk: () => {
      isDirty.value = false
      emit('close')
    },
  })
}

async function handleSubmit() {
  if (!validateForm()) return
  submitting.value = true
  try {
    const plugins: Record<string, any> = {}
    for (const sp of form.selectedPlugins) {
      if (sp.config) {
        try {
          plugins[sp.plugin_name] = JSON.parse(sp.config)
        } catch {
          plugins[sp.plugin_name] = sp.config
        }
      } else {
        plugins[sp.plugin_name] = {}
      }
    }
    const payload: any = { name: form.name, description: form.description, plugins }
    const cid = form.cluster_id
    // 保存 ≠ 生效：两分支统一文案（对齐上游先例）；emit saved 后父页面刷新列表使「待发布」立即可见
    if (props.editingConfig) {
      await api.put(`/clusters/${cid}/${apiEndpoint}/${props.editingConfig.id}`, payload)
    } else {
      await api.post(`/clusters/${cid}/${apiEndpoint}`, payload)
    }
    message.success(`${displayName}已保存。配置尚未发布，需发布后才会在 Edge 节点生效`)
    // 先清 dirty 再关窗：避免误弹「放弃更改」确认
    isDirty.value = false
    emit('saved')
    emit('close')
  } catch (error: unknown) {
    message.error(getApiErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* Tab Bar */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 20px;
  background: var(--surface);
}
.tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  font-family: var(--font-body);
}
.tab-btn:hover {
  color: var(--fg);
}
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.form-group {
  margin-bottom: 16px;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}
.required {
  color: var(--danger);
}
.form-error {
  font-size: 12px;
  color: var(--danger);
  margin-top: 2px;
}
</style>
