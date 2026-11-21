<template>
  <div class="modal-overlay plugin-metadata-create" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 600px">
      <div class="modal-header">
        <h2>添加插件元数据</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">所属集群 <span class="required">*</span></label>
          <ClusterSelect
            v-model="form.cluster_id"
            class="create-cluster-select"
            :clusters="clusters"
            :disabled="clusterLocked"
          />
        </div>
        <div class="form-group">
          <label class="form-label">插件名称 <span class="required">*</span></label>
          <!-- 可搜索：按展示文案（中文名 + 插件名）过滤，与筛选下拉同口径 -->
          <a-select
            v-model:value="form.plugin_name"
            class="plugin-name-select"
            :options="pluginOptions"
            :disabled="!form.cluster_id"
            :loading="loadingPlugins"
            option-filter-prop="label"
            show-search
            placeholder="请选择插件"
          />
        </div>
        <div class="create-info-box">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            style="width: 14px; height: 14px; flex-shrink: 0"
          >
            <path d="M8 4v4M8 12h0" />
            <circle cx="8" cy="8" r="7" />
          </svg>
          <span>创建后可在列表页编辑配置</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary plugin-metadata-create-submit" :disabled="!canSubmit" @click="handleSubmit">
          {{ submitting ? '添加中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 插件元数据创建共享弹窗（B2c）。
 *
 * 两个添加入口（统一管理面板的插件元数据 Tab、独立页 PluginMetadataList）共用本组件，
 * 字段集 = 所属集群 + 插件名称，提交调 `@/api/pluginMetadata` 的既有函数（端点与两处原实现一致）。
 * 面板场景传 `defaultClusterId` + `lockCluster`（集群由 Tab 上下文决定）；独立页全量集群可改。
 *
 * 插件下拉选项 = 与面板/页面同一份过滤规则（`utils/pluginMetadataCatalog`）：目录
 * （/plugins/builtin）∩ features.yaml 的 plugin_metadata_plugins，再排除该集群已配置插件。
 *
 * 成功后只 emit `saved`（携带集群与插件名），发布引导（「立即发布/稍后」）由调用方
 * 用既有发布链路承接，避免弹窗耦合发布流程。
 */
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { addClusterPluginMetadata, listBuiltinPlugins, listClusterPluginMetadata } from '@/api/pluginMetadata'
import {
  filterMetadataPlugins,
  metadataPluginLabel,
  toMetadataPlugins,
  type MetadataPluginLike,
} from '@/utils/pluginMetadataCatalog'
import { getApiErrorMessage } from '@/utils/error'
import { useFeaturesStore } from '@/stores/features'

const props = withDefaults(
  defineProps<{
    visible: boolean
    clusters: { id: number; name: string; display_name?: string }[]
    /** 新增态预选集群（面板场景：当前集群） */
    defaultClusterId?: number | null
    /** 锁定集群选择（面板场景：集群由上下文决定） */
    lockCluster?: boolean
  }>(),
  {
    defaultClusterId: null,
    lockCluster: false,
  },
)

const emit = defineEmits<{
  close: []
  saved: [payload: { clusterId: number; pluginName: string }]
}>()

const featuresStore = useFeaturesStore()

const submitting = ref(false)
const loadingPlugins = ref(false)
const catalog = ref<MetadataPluginLike[]>([])
const configuredNames = ref<Set<string>>(new Set())

const form = reactive({
  cluster_id: '' as number | string,
  // null 而非 ''：antd Select 把空串当作「已选项」渲染成空白，只有 null/undefined 才显示 placeholder
  plugin_name: null as string | null,
})

/** 面板形态锁定；仅有一个集群时也无可选项，同样禁用 */
const clusterLocked = computed(() => props.lockCluster || props.clusters.length <= 1)

const availablePlugins = computed(() =>
  filterMetadataPlugins(catalog.value, featuresStore.metadataPlugins, configuredNames.value),
)

/** 下拉选项：中文名优先 + 插件名（搜索命中两者） */
const pluginOptions = computed(() =>
  availablePlugins.value.map((p) => ({
    value: p.name,
    label: metadataPluginLabel(p) === p.name ? p.name : `${metadataPluginLabel(p)}（${p.name}）`,
  })),
)

const canSubmit = computed(() => !!form.cluster_id && !!form.plugin_name && !submitting.value)

/** 已为哪个集群载入过「已配置集合」——用于吞掉「打开即预选集群」时 form.cluster_id watcher 的重复请求 */
const loadedClusterId = ref<number | string>('')

async function loadConfiguredNames(clusterId: number | string): Promise<void> {
  loadedClusterId.value = clusterId
  if (!clusterId) {
    configuredNames.value = new Set()
    return
  }
  try {
    const res = await listClusterPluginMetadata(Number(clusterId))
    configuredNames.value = new Set((res.data.items || []).map((i) => String(i.plugin_name)))
  } catch {
    configuredNames.value = new Set()
  }
}

async function loadCatalog(): Promise<void> {
  loadingPlugins.value = true
  try {
    const res = await listBuiltinPlugins()
    catalog.value = toMetadataPlugins(res.data.plugins)
  } catch {
    catalog.value = []
  } finally {
    loadingPlugins.value = false
  }
}

// 初始化回填放 watch 回调（不追踪表单字段）——AGENTS #55：watchEffect 内读取表单字段会
// 把一次性初始化变成响应式重触发，用户每敲一次就被重置。
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.cluster_id = props.defaultClusterId ?? (props.clusters.length === 1 ? props.clusters[0].id : '')
    form.plugin_name = null
    configuredNames.value = new Set()
    // features 清单兜底加载（main.ts 启动已预载；失败静默 = 不限制）
    featuresStore.load().catch(() => {})
    void loadCatalog()
    void loadConfiguredNames(form.cluster_id)
  },
  { immediate: true },
)

// 切集群：插件名清空 + 该集群已配置集合重载（选项随之刷新）。打开弹窗时预选的集群
// 已由上面的 visible watcher 载入，这里跳过以免重复请求。
watch(
  () => form.cluster_id,
  (cid) => {
    if (cid === loadedClusterId.value) return
    form.plugin_name = null
    void loadConfiguredNames(cid)
  },
)

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  const clusterId = Number(form.cluster_id)
  // canSubmit 已保证非空（null 表示未选），此处收窄供 API 与事件使用
  const pluginName = form.plugin_name ?? ''
  try {
    await addClusterPluginMetadata(clusterId, pluginName)
    emit('saved', { clusterId, pluginName })
    emit('close')
  } catch (error: unknown) {
    message.error(getApiErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* antd 的 .ant-select 是 inline-block + width:auto（宽度跟随已选文本）——插件下拉必须显式填满
   表单列，否则空值时塌成几十像素的窄框、弹出层同宽不可读（AGENTS #75） */
.plugin-name-select {
  width: 100%;
}

.create-info-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: oklch(56% 0.16 210 / 8%);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
}
</style>
