<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 600px">
      <div class="modal-header">
        <h2>{{ isEdit ? '编辑静态资源' : '添加静态资源' }}</h2>
        <button class="modal-close" @click="requestClose">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">所属集群 <span class="required">*</span></label>
          <ClusterSelect
            v-model="form.cluster_id"
            :clusters="clusters"
            :disabled="isEdit || !!lockCluster"
            @change="onClusterChange"
          />
          <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
        </div>

        <div class="form-group">
          <label class="form-label">
            {{ isEdit ? '关联路由（可换绑）' : '选择路由' }} <span class="required">*</span>
          </label>
          <a-select
            v-model:value="form.route_id"
            class="route-select"
            placeholder="请选择路由"
            show-search
            :loading="routesLoading"
            :filter-option="filterRouteOption"
            :not-found-content="routesLoading ? '加载中...' : '暂无可选路由'"
          >
            <a-select-option
              v-for="r in routes"
              :key="r.id"
              :value="r.id"
              :disabled="!staticResourceRouteEligibility(r).eligible"
            >
              {{ r.name }} ({{ r.uri }}){{ routeEligibilitySuffix(r) }}
            </a-select-option>
          </a-select>
          <div class="route-validation">
            <div class="form-hint">选择路由的要求：</div>
            <div
              v-for="c in routeChecks"
              :key="c.key"
              class="route-validation-item"
              :class="c.ok ? 'valid' : 'invalid'"
              :data-check="c.key"
            >
              {{ c.ok ? '✅' : '❌' }} {{ c.label }}
            </div>
            <div v-if="routeChanged" class="route-validation-item" style="color: #fa8c16" data-check="rebind">
              ⚠ 换绑路由后需重新上传并发布到 Edge 节点
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea v-model="form.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="requestClose">取消</button>
        <button class="btn btn-primary" :disabled="submitting || (!isEdit && !formValid)" @click="handleSubmit">
          {{ submitting ? '提交中...' : isEdit ? '保存' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 静态资源表单（B2a，docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
 *
 * 两入口唯一表单：集群统一管理「静态资源」Tab（单集群 + 禁用）与静态资源页（全量集群可选）。
 * 字段集 = 所属集群 + 路由（含三条资格勾叉 + 换绑警示）+ 描述——`name`/`url_path` 由后端按路由
 * 与 ZIP 上传推导，两入口都不可编辑（页面原 formData 里的这两个字段是从未渲染、从未提交的死字段）。
 * 资格判定单点 = utils/staticResourceRoute（下拉后缀/禁用与三条勾叉同源）。
 */
import { reactive, ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
import { getApiErrorMessage } from '@/utils/error'
import { showDangerConfirm } from '@/composables/useOverlayModal'
import {
  staticResourceRouteChecks,
  staticResourceRouteEligibility,
  routeEligibilitySuffix,
} from '@/utils/staticResourceRoute'
import type { StaticResource } from '@/types'

interface StaticResourceRouteOption {
  id: number
  name: string
  uri?: string | null
  current_version?: number | null
  plugins?: { plugin_name?: string | null }[] | null
}

const props = defineProps<{
  visible: boolean
  /** 编辑源记录；为空 = 新增态 */
  editingResource?: StaticResource | null
  clusters: { id: number; name: string; display_name?: string; group_name?: string }[]
  /** 新增态预选集群（面板场景：当前集群）；不传保持「不预选」行为 */
  defaultClusterId?: number | null
  /** 锁定集群选择（面板场景：集群由上下文决定，不可改；编辑态本来已禁用） */
  lockCluster?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const isEdit = computed(() => props.editingResource != null)
const submitting = ref(false)
const routesLoading = ref(false)
const routes = ref<StaticResourceRouteOption[]>([])
const formErrors = reactive<Record<string, string>>({})

const form = reactive({
  cluster_id: '' as number | string,
  // 路由下拉用 a-select（number 值）；null 触发 antd 占位文案（无原生 select 的 selectedIndex 陷阱）
  route_id: null as number | null,
  description: '',
})

/** 编辑打开时的原路由绑定（换绑检测基准） */
const originalRouteId = ref<number | null>(null)
const routeChanged = computed(() => isEdit.value && form.route_id !== originalRouteId.value)

const selectedRoute = computed(() => routes.value.find((r) => r.id === form.route_id) || null)
/** 三条勾叉（未选路由 → 三叉；判定与下拉 disabled / 后缀同源） */
const routeChecks = computed(() => staticResourceRouteChecks(selectedRoute.value))
const formValid = computed(() => !!form.route_id && routeChecks.value.every((c) => c.ok))

watch(
  () => props.visible,
  (v) => {
    if (v) populateForm()
  },
  { immediate: true },
)

function populateForm(): void {
  const sr = props.editingResource
  formErrors.cluster_id = ''
  form.description = sr?.description || ''
  form.route_id = sr?.route_id ?? null
  originalRouteId.value = sr?.route_id ?? null
  form.cluster_id = sr?.cluster_id ?? props.defaultClusterId ?? ''
  routes.value = []
  if (form.cluster_id) void loadRoutes(form.cluster_id)
}

async function loadRoutes(clusterId: number | string): Promise<void> {
  if (!clusterId) {
    routes.value = []
    return
  }
  routesLoading.value = true
  try {
    const res = await api.get(`/clusters/${clusterId}/routes`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
    routes.value = res.data?.items || []
  } catch {
    routes.value = []
  } finally {
    routesLoading.value = false
  }
}

/** 新增态换集群：清空已选路由并重载该集群路由清单（编辑态集群禁用，不会触发） */
function onClusterChange(clusterId: number | string): void {
  form.route_id = null
  void loadRoutes(clusterId)
}

function filterRouteOption(input: string, option: { value?: number | string } | undefined): boolean {
  const route = routes.value.find((r) => r.id === Number(option?.value))
  if (!route) return false
  const q = input.toLowerCase()
  return [route.name, route.uri].some((s) => (s || '').toLowerCase().includes(q))
}

function requestClose(): void {
  emit('close')
}

async function handleSubmit(): Promise<void> {
  if (submitting.value) return
  if (!form.cluster_id) {
    formErrors.cluster_id = '请选择所属集群'
    message.warning('请选择所属集群')
    return
  }
  formErrors.cluster_id = ''
  if (!form.route_id) {
    // 编辑态原绑定本就为空（历史/异常记录）：允许只改描述；新增态必须选路由
    if (!(isEdit.value && originalRouteId.value === null)) {
      message.warning('请选择路由')
      return
    }
  }
  // 编辑态仅在换绑时校验资格（只改描述不应被现存路由的历史资格拦住）
  if ((!isEdit.value || routeChanged.value) && !formValid.value) {
    message.warning('请选择符合条件（已发布到 Edge 节点且路径以 /* 结尾）的路由')
    return
  }
  if (routeChanged.value) {
    showDangerConfirm('换绑路由', '换绑路由后需重新上传并发布到 Edge 节点。确定换绑？', '确认换绑', async () => {
      await persist(true)
    })
    return
  }
  await persist(false)
}

async function persist(rebind: boolean): Promise<void> {
  submitting.value = true
  try {
    const clusterId = form.cluster_id
    if (isEdit.value) {
      const payload: Record<string, unknown> = { description: form.description }
      if (rebind) payload.route_id = form.route_id
      await api.put(`/clusters/${clusterId}/static-resources/${props.editingResource?.id}`, payload)
      message.success(rebind ? '静态资源已换绑，请重新上传并发布' : '静态资源已更新')
    } else {
      await api.post(`/clusters/${clusterId}/static-resources`, {
        route_id: form.route_id,
        description: form.description || undefined,
      })
      message.success('静态资源已创建')
    }
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

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.form-error {
  font-size: 12px;
  color: var(--danger);
  margin-top: 2px;
}

.route-select {
  width: 100%;
}

.route-validation {
  margin-top: 6px;
  font-size: 12px;
}

.route-validation-item {
  font-size: 11px;
  margin-top: 2px;
}
.route-validation-item.valid {
  color: #52c41a;
}
.route-validation-item.invalid {
  color: #ff4d4f;
}
</style>
