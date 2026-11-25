<template>
  <div class="edge-import">
    <PageHeader title="Edge 数据导入" description="从 Edge 节点批量导入配置数据到本地数据库" />
    <div class="ei-steps">
      <div class="ei-step" :class="{ done: Number(currentStep) > 0, active: Number(currentStep) === 0 }">
        <span class="ei-dot">{{ Number(currentStep) > 0 ? '✓' : '1' }}</span
        ><span class="ei-label">选择节点</span>
      </div>
      <div class="ei-line" :class="{ done: Number(currentStep) > 0 }"></div>
      <div class="ei-step" :class="{ done: Number(currentStep) > 1, active: Number(currentStep) === 1 }">
        <span class="ei-dot">{{ Number(currentStep) > 1 ? '✓' : '2' }}</span
        ><span class="ei-label">选择配置</span>
      </div>
      <div class="ei-line" :class="{ done: Number(currentStep) > 1 }"></div>
      <div class="ei-step" :class="{ active: Number(currentStep) === 2 }">
        <span class="ei-dot">3</span><span class="ei-label">预览导入</span>
      </div>
    </div>

    <!-- Step 0: 选择节点 -->
    <div v-if="(currentStep as number) === 0">
      <div class="l5-card">
        <div class="ei-cardhead"><h3>选择源节点</h3></div>
        <div style="padding: 18px 16px 14px">
          <div class="ei-field">
            <label class="req">所属集群</label>
            <ClusterSelect
              :model-value="selectedClusterId"
              :clusters="clusters"
              placeholder="请选择集群..."
              style="width: 400px"
              @update:model-value="onClusterFieldChange"
              @change="onClusterChange"
            />
          </div>

          <div class="ei-field">
            <label class="req">目标节点</label>
            <select v-model="selectedNodeId" class="ei-input" style="width: 400px" :disabled="!selectedClusterId">
              <option :value="null">请选择节点...</option>
              <option v-for="node in nodes" :key="node.id" :value="node.id">
                {{ node.ip }}:{{ node.management_port }} ({{ node.edge_path }})
              </option>
            </select>
          </div>

          <div class="ei-field">
            <label>节点 Admin Key</label>
            <input
              v-model="adminKey"
              type="password"
              class="ei-input"
              style="width: 300px"
              placeholder="留空则使用节点已配置的 Admin Key"
              autocomplete="new-password"
            />
            <button
              class="btn btn-primary"
              :disabled="testingConnection || !selectedNodeId"
              @click="handleTestConnection"
            >
              {{ testingConnection ? '测试中…' : '测试连接' }}
            </button>
            <div v-if="testingConnection" class="testing-hint">
              正在连接节点并统计配置数据，约需数秒至 1 分钟（视节点网络而定）……
            </div>
          </div>

          <div v-if="connectionTested" class="ei-ok">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12l3 3 5-6" />
            </svg>
            <div>
              <div class="t">连接成功</div>
              <div class="d">
                节点: {{ connectionResult?.node || '-' }}{{ connectionRouteText }} · 版本:
                {{ connectionResult?.version || '-' }} · 响应时间: {{ connectionResult?.response_time_ms || '-' }}ms
              </div>
              <div class="ei-counts">
                <span class="ei-count"
                  >路由 <b>{{ connectionResult?.route_count }}</b></span
                >
                <span class="ei-count"
                  >上游 <b>{{ connectionResult?.upstream_count }}</b></span
                >
                <span class="ei-count"
                  >插件 <b>{{ connectionResult?.plugin_count }}</b></span
                >
                <span class="ei-count"
                  >插件组 <b>{{ connectionResult?.plugin_config_count }}</b></span
                >
                <span class="ei-count"
                  >全局规则 <b>{{ connectionResult?.global_rule_count }}</b></span
                >
                <span class="ei-count"
                  >插件元数据 <b>{{ connectionResult?.plugin_metadata_count }}</b></span
                >
                <span class="ei-count"
                  >四层代理 <b>{{ connectionResult?.stream_proxy_count }}</b></span
                >
                <span class="ei-count"
                  >SSL 证书 <b>{{ connectionResult?.ssl_certificate_count }}</b></span
                >
              </div>
            </div>
          </div>

          <div v-if="connectionError" class="ei-fail">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5h.01" />
            </svg>
            {{ connectionError }}
          </div>
        </div>
      </div>

      <div class="step-actions">
        <span class="tip-host" title="请先完成连接测试">
          <button class="btn btn-primary" :disabled="!connectionTested" @click="goToStep(1)">下一步</button>
        </span>
      </div>
    </div>

    <!-- Step 1: 选择配置 -->
    <div v-if="(currentStep as number) === 1">
      <div class="l5-card">
        <div class="ei-cardhead">
          <h3>选择要导入的配置类型</h3>
          <span class="ei-sub">选择需要从 Edge 节点导入到管理平台的配置类型</span>
        </div>
        <div style="padding: 16px 16px 18px">
          <div class="ei-types">
            <div
              v-for="ct in configTypes"
              :key="ct.key"
              class="ei-ct"
              :class="{ selected: selections[ct.key as keyof typeof selections] }"
              @click="toggleConfigType(ct.key)"
            >
              <span class="ck">✓</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                v-html="EC_TYPE_ICONS[ct.key]"
              />
              <span class="n">{{ ct.label }}</span>
            </div>
          </div>
          <div class="step-actions" style="justify-content: space-between">
            <button class="btn btn-secondary" @click="goToStep(0)">上一步</button>
            <button class="btn btn-primary" :disabled="!hasSelection" @click="goToStep(2)">下一步 — 预览</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: 预览导入 -->
    <div v-if="(currentStep as number) === 2">
      <!-- 获取警告 -->
      <div v-if="previewData?.warnings && previewData.warnings.length > 0" class="ei-warn" style="margin-bottom: 12px">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3L2 20h20L12 3z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
        <div>
          <b>部分数据获取失败</b>
          <div style="margin-top: 2px">
            <div v-for="(w, i) in previewData.warnings" :key="i">{{ w }}</div>
            <div style="margin-top: 4px; font-size: 11px">失败的数据无法导入，其他数据可正常导入。</div>
          </div>
        </div>
      </div>

      <!-- 插件摘要 -->
      <div
        v-if="previewData?.plugin_summary && previewData.plugin_summary.unknown_count > 0"
        class="ei-warn"
        style="margin-bottom: 12px"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M12 11v5" />
        </svg>
        <div>
          <b>插件识别提示</b>
          <div style="margin-top: 2px">
            已识别 {{ previewData.plugin_summary.known_count }} 个已知插件，发现
            {{ previewData.plugin_summary.unknown_count }} 个新插件（
            {{ previewData.plugin_summary.unknown_plugin_names.join('、') }}
            ），新插件将存入数据库，可在 JSON 编辑器中查看修改。
          </div>
        </div>
      </div>

      <!-- 冲突提示 -->
      <div
        v-if="previewData?.conflicts && previewData.conflicts.length > 0"
        class="ei-warn"
        style="margin-bottom: 10px"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3L2 20h20L12 3z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
        <div>
          <b>冲突提示</b>
          <div style="margin-top: 2px">发现 {{ previewData.conflicts.length }} 项冲突</div>
        </div>
      </div>

      <!-- 冲突详情 -->
      <div
        v-if="previewData?.conflicts && previewData.conflicts.length > 0"
        class="l5-card"
        style="margin-bottom: 12px"
      >
        <div class="ei-cardhead">
          <button class="link-btn" @click="showConflicts = !showConflicts">
            {{ showConflicts ? '收起冲突详情' : '展开冲突详情' }}
          </button>
        </div>
        <div v-if="showConflicts">
          <a-table
            :columns="conflictColumns"
            :data-source="previewData.conflicts"
            :pagination="false"
            :rowKey="(r: any) => `${r.type}-${r.resource}`"
            size="small"
            class="grid-table"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'type'">
                {{ record.type }}
              </template>
              <template v-if="column.key === 'resource'">
                {{ record.resource }}
              </template>
              <template v-if="column.key === 'reason'">
                {{ record.reason }}
              </template>
              <template v-if="column.key === 'resolution'">
                {{ record.resolution }}
              </template>
            </template>
          </a-table>
        </div>
      </div>

      <!-- 导入项选择（v-for 统一结构；空数据 section 单行提示——tools-ux 同款降噪） -->
      <div class="ei-toolbar">
        <span>勾选要导入的配置类型：</span>
        <button class="link-btn" @click="setAllSections(true)">全选</button>
        <button class="link-btn" @click="setAllSections(false)">全不选</button>
      </div>
      <div class="section-list">
        <div v-for="sec in sectionDefs" :key="sec.key" class="ei-sec">
          <div class="ei-sec-h">
            <a-checkbox v-model:checked="selections[sec.key]" />
            <span class="ei-sec-t"
              >{{ sec.label }}（{{ (previewData?.[sec.dataKey] || []).length }} {{ sec.unit }}）</span
            >
            <template v-if="(previewData?.[sec.dataKey] || []).length > 0">
              <button class="btn btn-secondary btn-sm" @click="expandedSections[sec.key] = !expandedSections[sec.key]">
                {{ expandedSections[sec.key] ? '收起详情' : '预览详情' }}
              </button>
            </template>
          </div>
          <div v-if="(previewData?.[sec.dataKey] || []).length === 0" class="ei-sec-empty">
            {{ sec.label }}：0 {{ sec.unit }}（节点上无此类配置）
          </div>
          <div v-else-if="expandedSections[sec.key]" class="ei-sec-b">
            <a-table
              :columns="sec.columns"
              :data-source="previewData?.[sec.dataKey] || []"
              :pagination="false"
              :rowKey="sec.rowKey"
              size="small"
              class="grid-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'nodes'">
                  <span v-if="record.nodes"> {{ getNodeCount(record.nodes) }} 个节点 </span>
                  <span v-else>-</span>
                </template>
                <template v-else-if="column.key === 'methods'">
                  <a-tag v-for="m in record.methods || []" :key="m" color="blue">
                    {{ m }}
                  </a-tag>
                  <span v-if="!record.methods || record.methods.length === 0">-</span>
                </template>
                <template v-else-if="column.key === 'plugins'">
                  <a-tag v-if="record.plugins"> {{ Object.keys(record.plugins).length }} 个插件 </a-tag>
                  <span v-else>-</span>
                </template>
                <template v-else-if="column.key === 'targets'">
                  <span v-if="record.targets && record.targets.length">{{ record.targets.length }} 个目标</span>
                  <span v-else>-</span>
                </template>
                <template v-else-if="column.key === 'config_data'">
                  <a-tag v-if="record.config_data && Object.keys(record.config_data).length">
                    {{ Object.keys(record.config_data).length }} 个插件
                  </a-tag>
                  <span v-else>-</span>
                </template>
                <template v-else-if="column.key === 'scheme'">
                  {{ record.scheme || 'tcp' }}
                </template>
                <template v-else-if="column.key === 'desc'">
                  {{ record.desc || record.name || '-' }}
                </template>
                <template v-else-if="column.key === 'name'">
                  {{ record.name || record.id || '-' }}
                </template>
                <template v-else-if="column.key === 'id'">
                  <span style="font-size: 12px">{{ record.id }}</span>
                </template>
                <template v-else>
                  {{ record[column.key] || '-' }}
                </template>
              </template>
            </a-table>
          </div>
        </div>
      </div>

      <!-- Loading overlay for preview -->
      <div v-if="loadingPreview" class="loading-overlay">
        <a-spin tip="正在获取预览数据..." />
      </div>

      <div class="step-actions">
        <button class="btn btn-secondary" @click="goToStep(1)">上一步</button>
        <button class="btn btn-secondary" @click="confirmCancel">取消</button>
        <span style="flex: 1"></span>
        <button class="btn btn-primary" :disabled="importing" @click="confirmImport">
          {{ importing ? '导入中…' : '确认导入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { message } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { testConnection, getPreview, executeImport } from '@/api/edgeImport'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { routeLabel } from '@/composables/useClusterUtils'
import type { TestConnectionResponse, PreviewResponse, ImportResponse } from '@/api/edgeImport'

// ---- State ----

const router = useRouter()
const currentStep = ref(0)
const clusters = ref<any[]>([])
const selectedClusterId = ref<number | null>(null)

/** ClusterSelect emit number|string → 内部 number|null（null=未选） */
function onClusterFieldChange(value: number | string) {
  selectedClusterId.value = value === '' ? null : Number(value)
}
const loadingClusters = ref(false)

const selectedNodeId = ref<number | null>(null)
const nodes = ref<any[]>([])
const loadingNodes = ref(false)
const adminKey = ref('')
const testingConnection = ref(false)
const connectionResult = ref<TestConnectionResponse | null>(null)
const connectionError = ref('')
const connectionTested = ref(false)

/** 与节点同行的路径标注，如「（经中继）」；无 route 字段时为空串（不渲染） */
const connectionRouteText = computed(() => {
  const label = routeLabel(connectionResult.value?.route, connectionResult.value ?? undefined)
  return label ? `（${label}）` : ''
})

const previewData = ref<PreviewResponse | null>(null)
const loadingPreview = ref(false)

const selections = reactive<Record<string, boolean>>({
  upstreams: true,
  routes: true,
  plugin_configs: true,
  global_rules: true,
  plugin_metadata: true,
  stream_proxy: true,
  ssl_certificates: true,
})

const expandedSections = reactive({
  upstreams: false,
  routes: false,
  plugin_configs: false,
  global_rules: false,
  plugin_metadata: false,
  stream_proxy: false,
  ssl_certificates: false,
})

const showConflicts = ref(false)

/** 类型图标 = 内联 svg path（页面内静态常量；StrokeIcon 近义：server/swap/blocks/shieldCheck/braces/columns/lock） */
const EC_TYPE_ICONS: Record<string, string> = {
  upstreams:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  routes: '<path d="M4 7h12M4 12h8M4 17h12M16 12l3-3M19 9v6l3-3-3-3"/>',
  plugin_configs:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  global_rules: '<path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z"/>',
  plugin_metadata: '<path d="M8 4l-5 8 5 8M16 4l5 8-5 8"/>',
  stream_proxy: '<rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="15" width="18" height="6" rx="1"/>',
  ssl_certificates: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8.5 10V7a3.5 3.5 0 017 0v3"/>',
}

const configTypes = [
  { key: 'upstreams', label: '上游服务' },
  { key: 'routes', label: '路由规则' },
  { key: 'plugin_configs', label: '插件组' },
  { key: 'global_rules', label: '全局规则' },
  { key: 'plugin_metadata', label: '插件元数据' },
  { key: 'stream_proxy', label: '四层代理' },
  { key: 'ssl_certificates', label: 'SSL 证书' },
]

function toggleConfigType(key: string) {
  selections[key] = !selections[key]
}

const hasSelection = computed(() => {
  return configTypes.some((ct) => selections[ct.key])
})

const importing = ref(false)

// ---- Columns ----

const conflictColumns = [
  { title: '类型', key: 'type', width: 100 },
  { title: '资源', key: 'resource', width: 160 },
  { title: '原因', key: 'reason' },
  { title: '解决方案', key: 'resolution', width: 160 },
]

const upstreamColumns = [
  { title: '名称', key: 'name' },
  { title: '类型', key: 'type', width: 120 },
  { title: '节点数', key: 'nodes', width: 100 },
]

const routeColumns = [
  { title: '名称', key: 'name' },
  { title: 'URI', key: 'uri' },
  { title: '方法', key: 'methods', width: 180 },
  { title: '上游', key: 'upstream', width: 160 },
]

const pluginConfigColumns = [
  { title: 'ID', key: 'id', width: 100 },
  { title: '描述', key: 'desc' },
  { title: '插件数', key: 'plugins', width: 100 },
]

const globalRuleColumns = [
  { title: 'ID', key: 'id', width: 100 },
  { title: '描述', key: 'desc' },
  { title: '插件数', key: 'plugins', width: 100 },
]

const pluginMetadataColumns = [
  { title: '插件名称', dataIndex: 'plugin_name', key: 'plugin_name' },
  { title: '配置插件数', key: 'config_data' },
]

const streamProxyColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '端口', dataIndex: 'listen_port', key: 'listen_port' },
  { title: '负载均衡', dataIndex: 'load_balance', key: 'load_balance' },
  { title: '协议', dataIndex: 'scheme', key: 'scheme' },
  { title: '上游目标', key: 'targets' },
]

const sslCertificateColumns = [
  { title: '名称', key: 'name' },
  { title: 'SNI', key: 'sni' },
  { title: '类型', key: 'cert_type' },
]

// 统一 section 渲染元数据（v-for 重构，消除 7 段手写重复）
const sectionDefs = [
  { key: 'upstreams', label: '上游', unit: '个', dataKey: 'upstreams', columns: upstreamColumns, rowKey: 'id' },
  { key: 'routes', label: '路由', unit: '条', dataKey: 'routes', columns: routeColumns, rowKey: 'id' },
  {
    key: 'plugin_configs',
    label: '插件组',
    unit: '个',
    dataKey: 'plugin_configs',
    columns: pluginConfigColumns,
    rowKey: 'id',
  },
  {
    key: 'global_rules',
    label: '全局规则',
    unit: '个',
    dataKey: 'global_rules',
    columns: globalRuleColumns,
    rowKey: 'id',
  },
  {
    key: 'plugin_metadata',
    label: '插件元数据',
    unit: '个',
    dataKey: 'plugin_metadata',
    columns: pluginMetadataColumns,
    rowKey: 'plugin_name',
  },
  {
    key: 'stream_proxy',
    label: '四层代理',
    unit: '个',
    dataKey: 'stream_proxies',
    columns: streamProxyColumns,
    rowKey: 'edge_uuid',
  },
  {
    key: 'ssl_certificates',
    label: 'SSL 证书',
    unit: '张',
    dataKey: 'ssl_certificates',
    columns: sslCertificateColumns,
    rowKey: 'edge_uuid',
  },
] as const

function setAllSections(v: boolean): void {
  for (const sec of sectionDefs) selections[sec.key] = v
}

// ---- Data Loading ----

const loadClusters = async () => {
  loadingClusters.value = true
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch (error: any) {
    message.error('加载集群列表失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    loadingClusters.value = false
  }
}

const loadNodes = async (clusterId: number) => {
  loadingNodes.value = true
  selectedNodeId.value = null
  nodes.value = []
  connectionResult.value = null
  connectionError.value = ''
  connectionTested.value = false
  try {
    const res = await api.get('/clusters/' + clusterId + '/nodes')
    nodes.value = res.data?.items || res.data || []
  } catch (error: any) {
    message.error('获取节点列表失败，请刷新重试（' + (error.response?.data?.detail || error.message) + '）')
  } finally {
    loadingNodes.value = false
  }
}

const onClusterChange = () => {
  connectionResult.value = null
  connectionError.value = ''
  connectionTested.value = false
  adminKey.value = ''
  if (selectedClusterId.value) {
    loadNodes(selectedClusterId.value)
  }
}

// ---- Connection Test ----

const handleTestConnection = async () => {
  if (!selectedClusterId.value || !selectedNodeId.value) {
    message.warning('请选择集群和节点')
    return
  }

  testingConnection.value = true
  connectionResult.value = null
  connectionError.value = ''

  try {
    const res = await testConnection(selectedClusterId.value!, selectedNodeId.value!, adminKey.value)
    connectionResult.value = res.data
    connectionTested.value = true
  } catch (error: any) {
    connectionTested.value = false
    connectionError.value = error.response?.data?.detail || error.message || '连接失败，请检查配置后重试'
  } finally {
    testingConnection.value = false
  }
}

// ---- Navigation ----

const goToStep = async (step: number) => {
  // 回到 step 0（edge-import-ux-review-fixes 2.5）：保留已选集群与节点列表——换节点重测不必重选集群；
  // 仅重置节点选择、连接态与预览
  if (step === 0 && currentStep.value > 0) {
    selectedNodeId.value = null
    connectionResult.value = null
    connectionError.value = ''
    connectionTested.value = false
    adminKey.value = ''
    previewData.value = null
  }

  // Entering step 2 (preview): fetch preview
  if (step === 2) {
    if (!selectedClusterId.value || !selectedNodeId.value) {
      message.warning('请先选择集群和节点')
      return
    }
    loadingPreview.value = true
    try {
      const res = await getPreview(selectedClusterId.value, selectedNodeId.value, adminKey.value)
      previewData.value = res.data
      // 默认展开有数据的 section；0 项收起（edge-import-ux-review-fixes 3.1）
      for (const sec of sectionDefs) {
        expandedSections[sec.key] = (res.data[sec.dataKey] || []).length > 0
      }
      // Auto-expand conflict section if conflicts exist
      if (res.data.conflicts && res.data.conflicts.length > 0) {
        showConflicts.value = true
      }
    } catch (error: any) {
      message.error(
        '获取预览数据失败：该节点的部分配置无法读取（' +
          (error.response?.data?.detail || error.message) +
          '），可返回上一步重试',
      )
      // Stay on step 2 if preview fetch fails
      return
    } finally {
      loadingPreview.value = false
    }
  }

  currentStep.value = step
}

// 取消确认（edge-import-ux-review-fixes 2.6）
const confirmCancel = (): void => {
  showOverlayModal({
    title: '取消导入',
    content: '取消将丢弃已选配置与预览数据，确定取消？',
    showCancel: true,
    okText: '确定取消',
    onOk: () => handleCancel(),
  })
}

const handleCancel = () => {
  currentStep.value = 0
  selectedClusterId.value = null
  selectedNodeId.value = null
  nodes.value = []
  connectionResult.value = null
  connectionError.value = ''
  connectionTested.value = false
  previewData.value = null
  adminKey.value = ''
  selections.upstreams = true
  selections.routes = true
  selections.plugin_configs = true
  selections.global_rules = true
  selections.plugin_metadata = true
  selections.stream_proxy = true
  selections.ssl_certificates = true
}

// ---- Import ----

function showImportResult(result: ImportResponse | null, error: string) {
  const children: any[] = []

  if (result) {
    if (result.success) {
      const counts = result.imported_counts
      const lines: string[] = [
        `上游：${counts.upstreams} 个`,
        `路由：${counts.routes} 条`,
        `插件组：${counts.plugin_configs} 个`,
        `全局规则：${counts.global_rules} 个`,
        `插件元数据：${counts.plugin_metadata || 0} 个`,
        `四层代理：${counts.stream_proxies || 0} 个`,
        `SSL 证书：${counts.ssl_certificates || 0} 个`,
      ]
      if (counts.skipped > 0) {
        lines.push(`跳过：${counts.skipped} 项（冲突）`)
        // 分类明细（edge-import-ux-review-fixes 2.3：后端 skipped_counts 一直有，前端未消费）
        const sc = result.skipped_counts
        if (sc) {
          const detail: string[] = []
          if (sc.upstreams) detail.push(`上游跳过 ${sc.upstreams} 个`)
          if (sc.routes) detail.push(`路由跳过 ${sc.routes} 条`)
          if (sc.plugin_configs) detail.push(`插件组跳过 ${sc.plugin_configs} 个`)
          if (sc.global_rules) detail.push(`全局规则跳过 ${sc.global_rules} 个`)
          if ((sc as any).stream_proxies) detail.push(`四层代理跳过 ${(sc as any).stream_proxies} 个`)
          if ((sc as any).ssl_certificates) detail.push(`SSL 证书跳过 ${(sc as any).ssl_certificates} 张`)
          lines.push(...detail)
        }
      }
      children.push(
        h(
          'div',
          {
            style:
              'background: oklch(55% 0.15 145 / 8%);border:1px solid oklch(55% 0.15 145 / 30%);border-radius:8px;padding:12px 16px;margin-bottom:12px;',
          },
          [
            h('div', { style: 'font-weight:600;margin-bottom:8px;color: var(--success);' }, '✅ 导入完成'),
            ...lines.map((l) => h('div', { style: 'font-size:12.5px;line-height:1.8;' }, l)),
          ],
        ),
        h('div', { style: 'margin-top:8px;' }, [
          h(
            'a',
            {
              style: 'color:var(--accent);cursor:pointer;text-decoration:underline;margin-right:16px;',
              onClick: () => {
                handleCancel()
              },
            },
            '继续导入 →',
          ),
          h(
            'a',
            {
              style: 'color:var(--accent);cursor:pointer;text-decoration:underline;',
              onClick: () => router.push('/clusters'),
            },
            '查看集群详情 →',
          ),
        ]),
      )
    } else {
      children.push(
        h(
          'div',
          {
            style:
              'background: oklch(55% 0.18 28 / 8%);border:1px solid oklch(55% 0.18 28 / 30%);border-radius:8px;padding:12px 16px;margin-bottom:12px;',
          },
          [
            h('div', { style: 'font-weight:600;color: var(--danger);margin-bottom:4px;' }, '❌ 导入失败'),
            h('div', { style: 'font-size:12.5px;' }, result.message || '导入过程中出现错误，请重试。'),
          ],
        ),
      )
    }

    if (result.plugin_summary && result.plugin_summary.unknown_count > 0) {
      children.push(
        h(
          'div',
          {
            style:
              'background: oklch(56% 0.16 210 / 8%);border:1px solid oklch(56% 0.16 210 / 30%);border-radius:8px;padding:12px 16px;margin-bottom:12px;',
          },
          [
            h('div', { style: 'font-weight:600;color: var(--accent);margin-bottom:4px;' }, 'ℹ️ 插件信息'),
            h(
              'div',
              { style: 'font-size:12.5px;' },
              `新发现 ${result.plugin_summary.unknown_count} 个插件（${result.plugin_summary.unknown_plugin_names.join('、')}），已存入数据库。`,
            ),
          ],
        ),
      )
    }
  }

  if (error) {
    children.push(
      h(
        'div',
        {
          style:
            'background: oklch(55% 0.18 28 / 8%);border:1px solid oklch(55% 0.18 28 / 30%);border-radius:8px;padding:12px 16px;margin-bottom:12px;',
        },
        [
          h('div', { style: 'font-weight:600;color: var(--danger);margin-bottom:4px;' }, '❌ 导入失败'),
          h('div', { style: 'font-size:12.5px;' }, error),
        ],
      ),
    )
  }

  showOverlayModal({
    title: '导入结果',
    content: h('div', {}, children),
    width: 500,
    showCancel: false,
    okText: '关闭',
  })
}

const handleImport = async () => {
  if (!selectedClusterId.value || !selectedNodeId.value) {
    message.warning('集群或节点信息缺失，请重新选择')
    return
  }

  importing.value = true

  try {
    const res = await executeImport(
      selectedClusterId.value,
      selectedNodeId.value,
      {
        upstreams: selections.upstreams,
        routes: selections.routes,
        plugin_configs: selections.plugin_configs,
        global_rules: selections.global_rules,
        plugin_metadata: selections.plugin_metadata,
        stream_proxy: selections.stream_proxy,
        ssl_certificates: selections.ssl_certificates,
      },
      adminKey.value,
    )
    showImportResult(res.data, '')
  } catch (error: any) {
    showImportResult(null, error.response?.data?.detail || error.message || '导入失败，请重试')
  } finally {
    importing.value = false
  }
}

// 导入前摘要确认（edge-import-ux-review-fixes 2.2）：写库操作应有摩擦；确认后方执行
const confirmImport = (): void => {
  if (!previewData.value) {
    message.warning('预览数据缺失，请重新进入预览')
    return
  }
  const selected = sectionDefs
    .filter((s) => selections[s.key])
    .map((s) => `${s.label} ${(previewData.value?.[s.dataKey] || []).length} ${s.unit}`)
    .join('、')
  showOverlayModal({
    title: '确认导入',
    content: `将导入以下配置到本地数据库：${selected}。冲突项将自动跳过，不影响其余数据。`,
    showCancel: true,
    okText: '确认导入',
    onOk: () => handleImport(),
  })
}

const getNodeCount = (nodes: any) => {
  if (Array.isArray(nodes)) return nodes.length
  if (typeof nodes === 'object' && nodes !== null) return Object.keys(nodes).length
  return 0
}

// ---- Lifecycle ----

onMounted(() => {
  loadClusters()
})
</script>

<style scoped>
.edge-import {
  position: relative;
  min-height: calc(100vh - 56px - 40px);
  margin: -20px -24px;
  padding: 20px 24px;
  background: var(--bg);
}

.edge-import h2 {
  margin-bottom: 24px;
  font-size: 20px;
  font-weight: 600;
  color: var(--fg);
}

.section-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 1px solid var(--border);
}

.section-title {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
  color: var(--fg);
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  justify-content: flex-end;
}

/* 测试连接过程提示（edge-import-ux-review-fixes 1.4） */
.testing-hint {
  margin-top: 8px;
  padding: 8px 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 6px;
  color: #096dd9;
  font-size: 13px;
}

/* 禁用按钮 tooltip 载体（disabled 元素不冒鼠标事件，需宿主承载） */
.tip-host {
  display: inline-block;
  cursor: not-allowed;
}

/* 预览 section 工具条与空态（edge-import-ux-review-fixes 3.2/3.3） */
.section-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.btn-link {
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.btn-link:hover {
  text-decoration: underline;
}

.section-empty {
  padding: 12px 16px;
  color: var(--muted);
  font-size: 13px;
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.section-title {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
}

.section-body {
  padding: 12px;
}

:deep(.ant-table) {
  background: transparent !important;
}
/* 表头：保留品牌色底 + 主色下框（页面标识），其余机械属性对齐列表页契约（style.css） */
:deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%) !important;
  border-bottom: 2px solid var(--accent) !important;
  color: var(--fg) !important;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 8px;
  white-space: nowrap;
}
:deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
:deep(.ant-table-tbody > tr > td) {
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--fg);
  font-size: 13px;
  padding: 12px 8px;
  white-space: nowrap;
}
:deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
:deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg) !important;
}

:deep(.ant-card) {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
:deep(.ant-card .ant-card-head) {
  border-bottom: 1px solid var(--border) !important;
  color: var(--fg) !important;
}
:deep(.ant-card .ant-card-body) {
  color: var(--muted) !important;
}
:deep(.ant-select-selector) {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}
:deep(.ant-select-selection-item) {
  color: var(--fg) !important;
}

.config-type-card .ct-check {
  display: none;
  float: right;
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
}
.config-type-card.selected .ct-check {
  display: inline;
}
.config-type-card .ct-icon {
  font-size: 24px;
  margin-bottom: 8px;
  display: block;
}
.config-type-card .ct-name {
  font-size: 14px;
  font-weight: 600;
}

.loading-overlay {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 0;
}

/* Wizard steps card style */
:deep(.ant-steps .ant-steps-item) {
  flex: 1;
}
:deep(.ant-steps .ant-steps-item-container) {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  transition: all 0.2s;
}
:deep(.ant-steps .ant-steps-item-process .ant-steps-item-container) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}
:deep(.ant-steps .ant-steps-item-finish .ant-steps-item-container) {
  border-color: var(--success);
  background: color-mix(in srgb, var(--success) 6%, transparent);
}
:deep(.ant-steps .ant-steps-item-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  margin-right: 8px;
}
:deep(.ant-steps .ant-steps-item-process .ant-steps-item-icon) {
  background: var(--accent);
  border-color: var(--accent);
}
:deep(.ant-steps .ant-steps-item-finish .ant-steps-item-icon) {
  background: var(--success);
  border-color: var(--success);
}
:deep(.ant-steps .ant-steps-item-content .ant-steps-item-title) {
  font-size: 13px;
  font-weight: 500;
}
:deep(.ant-steps .ant-steps-item-tail) {
  display: none;
}

/* ── edge-import-page-restyle：向导步条 / 连接反馈横幅 / 配置类型可选卡 / section 卡 ── */
.ei-steps {
  display: flex;
  align-items: center;
  padding: 4px 0 20px;
}
.ei-step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ei-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  border: 1.5px solid oklch(50% 0.018 240 / 30%);
  color: var(--muted);
  background: var(--surface);
}
.ei-step.done .ei-dot {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.ei-step.active .ei-dot {
  border-color: var(--accent);
  color: var(--accent);
}
.ei-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}
.ei-step.done .ei-label,
.ei-step.active .ei-label {
  color: var(--fg);
  font-weight: 600;
}
.ei-step.active .ei-label {
  color: var(--accent);
}
.ei-line {
  flex: 1;
  height: 1.5px;
  background: oklch(50% 0.018 240 / 18%);
  margin: 0 12px;
  min-width: 60px;
}
.ei-line.done {
  background: var(--accent);
  opacity: 0.55;
}
.ei-cardhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.ei-cardhead h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.ei-cardhead .ei-sub {
  font-size: 11.5px;
  color: var(--muted);
}
.ei-field {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.ei-field > label {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  width: 110px;
  text-align: right;
  flex-shrink: 0;
}
.ei-field > label.req::before {
  content: '*';
  color: var(--danger);
  margin-right: 4px;
}
.ei-input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 12.5px;
  color: var(--fg);
  outline: none;
}
.ei-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}
.ei-input::placeholder {
  color: oklch(50% 0.018 240 / 45%);
}
.ei-ok {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 4px;
  padding: 12px 14px;
  background: oklch(55% 0.15 145 / 8%);
  border: 1px solid oklch(55% 0.15 145 / 30%);
  border-radius: var(--radius-lg);
}
.ei-ok svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--success);
}
.ei-ok .t {
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
}
.ei-ok .d {
  font-size: 12.5px;
  color: var(--fg);
  margin-top: 2px;
}
.ei-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ei-count {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 9px;
  border-radius: 999px;
  background: oklch(50% 0.018 240 / 6%);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}
.ei-count b {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--fg);
}
.ei-fail {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  padding: 11px 14px;
  background: oklch(55% 0.18 28 / 8%);
  border: 1px solid oklch(55% 0.18 28 / 30%);
  border-radius: var(--radius-lg);
  font-size: 12.5px;
  color: var(--danger);
}
.ei-types {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 10px;
}
.ei-ct {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.12s;
}
.ei-ct:hover {
  border-color: var(--accent);
}
.ei-ct svg {
  width: 22px;
  height: 22px;
  color: var(--muted);
}
.ei-ct .n {
  font-size: 12.5px;
  color: var(--fg);
}
.ei-ct .ck {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: none;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
}
.ei-ct.selected {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.ei-ct.selected svg {
  color: var(--accent);
}
.ei-ct.selected .ck {
  display: flex;
}
.ei-warn {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  background: oklch(85% 0.12 85 / 25%);
  border: 1px solid oklch(70% 0.14 80 / 50%);
  border-radius: var(--radius-lg);
}
.ei-warn svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: oklch(50% 0.12 70);
}
.ei-warn b {
  font-size: 13px;
  color: oklch(45% 0.11 70);
}
.ei-warn span,
.ei-warn div {
  font-size: 12px;
  color: oklch(45% 0.09 70);
}
.ei-sec {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
}
.ei-sec-h {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}
.ei-sec-t {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.ei-sec-h .btn {
  margin-left: auto;
}
.ei-sec-empty {
  padding: 0 14px 10px 34px;
  font-size: 12px;
  color: var(--muted);
}
.ei-sec-b {
  border-top: 1px solid var(--border);
}
.ei-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12.5px;
  color: var(--muted);
}
</style>
