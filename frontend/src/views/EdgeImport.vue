<template>
  <div class="edge-import">
    <PageHeader title="Edge 数据导入" description="从 Edge 节点批量导入配置数据到本地数据库" />
    <a-steps :current="currentStep" style="margin-bottom: 24px;">
      <a-step title="选择节点" />
      <a-step title="选择配置" />
      <a-step title="预览导入" />
    </a-steps>

    <!-- Step 0: 选择节点 -->
    <div v-if="currentStep === 0">
      <a-card title="选择源节点">
        <a-form layout="vertical">
          <a-form-item label="所属集群" required>
            <a-select
              v-model:value="selectedClusterId"
              placeholder="请选择集群..."
              style="width: 400px;"
              @change="onClusterChange"
            >
              <a-select-option
                v-for="cluster in clusters"
                :key="cluster.id"
                :value="cluster.id"
              >
                {{ cluster.display_name || cluster.name }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item label="目标节点" required>
            <a-select
              v-model:value="selectedNodeId"
              placeholder="请选择节点..."
              style="width: 400px;"
              :loading="loadingNodes"
              :disabled="!selectedClusterId"
            >
              <a-select-option
                v-for="node in nodes"
                :key="node.id"
                :value="node.id"
              >
                {{ node.ip }}:{{ node.management_port }} ({{ node.edge_path }})
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item label="节点 Admin Key">
            <div style="display:flex;gap:8px;">
              <a-input-password v-model:value="adminKey" placeholder="输入节点 Admin Key..." style="max-width:300px;" />
              <a-button
                type="primary"
                :loading="testingConnection"
                :disabled="!selectedNodeId"
                @click="handleTestConnection"
              >
                测试连接
              </a-button>
            </div>
          </a-form-item>
        </a-form>

        <a-alert
          v-if="connectionTested"
          type="success"
          show-icon
          closable
          style="margin-top: 8px;"
        >
          <template #message>
            <strong>连接成功</strong>
          </template>
          <template #description>
            <div>节点: {{ connectionResult?.node || '-' }} · 版本: {{ connectionResult?.version || '-' }} · 响应时间: {{ connectionResult?.response_time_ms || '-' }}ms</div>
            <div style="margin-top:4px;">
              路由: {{ connectionResult?.route_count }} 条 ·
              上游: {{ connectionResult?.upstream_count }} 个 ·
              插件: {{ connectionResult?.plugin_count }} 个 ·
              插件组: {{ connectionResult?.plugin_config_count }} 个 ·
              全局规则: {{ connectionResult?.global_rule_count }} 个 ·
              插件元数据: {{ connectionResult?.plugin_metadata_count }} 个 ·
              四层代理: {{ connectionResult?.stream_proxy_count }} 个
            </div>
          </template>
        </a-alert>

        <a-alert
          v-if="connectionError"
          type="error"
          show-icon
          closable
          style="margin-top: 8px;"
        >
          <template #message>
            <strong>连接失败</strong>
          </template>
          <template #description>
            {{ connectionError }}
          </template>
        </a-alert>
      </a-card>

      <div class="step-actions">
        <a-button type="primary" :disabled="!connectionTested" @click="goToStep(1)">
          下一步
        </a-button>
      </div>
    </div>

    <!-- Step 1: 选择配置 -->
    <div v-if="currentStep === 1">
      <a-card title="选择要导入的配置类型">
        <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">选择需要从 Edge 节点导入到管理平台的配置类型</p>
        <div class="config-types">
          <div
            v-for="ct in configTypes"
            :key="ct.key"
            class="config-type-card"
            :class="{ selected: selections[ct.key as keyof typeof selections] }"
            @click="toggleConfigType(ct.key)"
          >
            <span class="ct-check">✓</span>
            <component :is="ct.icon" class="ct-icon" />
            <div class="ct-name">{{ ct.label }}</div>
          </div>
        </div>
      </a-card>
      <div class="step-actions" style="justify-content:space-between;">
        <a-button @click="goToStep(0)">上一步</a-button>
        <a-button type="primary" :disabled="!hasSelection" @click="goToStep(2)">
          下一步 — 预览
        </a-button>
      </div>
    </div>

    <!-- Step 2: 预览导入 -->
    <div v-if="currentStep === 2">
      <!-- 获取警告 -->
      <a-alert
        v-if="previewData?.warnings && previewData.warnings.length > 0"
        type="warning"
        show-icon
        closable
        style="margin-bottom: 16px;"
      >
        <template #message>
          <strong>部分数据获取失败</strong>
        </template>
        <template #description>
          <div v-for="(w, i) in previewData.warnings" :key="i">{{ w }}</div>
          <div style="margin-top:4px;font-size:12px;">失败的数据无法导入，其他数据可正常导入。</div>
        </template>
      </a-alert>

      <!-- 插件摘要 -->
      <a-alert
        v-if="previewData?.plugin_summary && previewData.plugin_summary.unknown_count > 0"
        type="warning"
        show-icon
        style="margin-bottom: 16px;"
      >
        <template #message>
          <strong>插件识别提示</strong>
        </template>
        <template #description>
          已识别 {{ previewData.plugin_summary.known_count }} 个已知插件，发现
          {{ previewData.plugin_summary.unknown_count }} 个新插件（
          {{ previewData.plugin_summary.unknown_plugin_names.join('、') }}
          ），新插件将存入数据库，可在 JSON 编辑器中查看修改。
        </template>
      </a-alert>

      <!-- 冲突提示 -->
      <a-alert
        v-if="previewData?.conflicts && previewData.conflicts.length > 0"
        type="warning"
        show-icon
        style="margin-bottom: 16px;"
      >
        <template #message>
          <strong>冲突提示</strong>
        </template>
        <template #description>
          发现 {{ previewData.conflicts.length }} 项冲突
        </template>
      </a-alert>

      <!-- 冲突详情 -->
      <a-card
        v-if="previewData?.conflicts && previewData.conflicts.length > 0"
        size="small"
        style="margin-bottom: 16px;"
      >
        <template #title>
          <a @click="showConflicts = !showConflicts">
            {{ showConflicts ? '收起冲突详情' : '展开冲突详情' }}
          </a>
        </template>
        <div v-if="showConflicts">
          <a-table
            :columns="conflictColumns"
            :data-source="previewData.conflicts"
            :pagination="false"
            rowKey="resource"
            size="small"
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
      </a-card>

      <!-- 导入项选择 -->
      <div class="section-list">
        <!-- 上游 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.upstreams" />
            <span class="section-title">上游（{{ previewData?.upstreams?.length || 0 }} 个）</span>
            <a-button size="small" @click="expandedSections.upstreams = !expandedSections.upstreams">
              {{ expandedSections.upstreams ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.upstreams" class="section-body">
            <a-table
              :columns="upstreamColumns"
              :data-source="previewData?.upstreams || []"
              :pagination="false"
              rowKey="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  {{ record.name || record.id || '-' }}
                </template>
                <template v-if="column.key === 'type'">
                  {{ record.type || '-' }}
                </template>
                <template v-if="column.key === 'nodes'">
                  <span v-if="record.nodes">
                    {{ getNodeCount(record.nodes) }} 个节点
                  </span>
                  <span v-else>-</span>
                </template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- 路由 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.routes" />
            <span class="section-title">路由（{{ previewData?.routes?.length || 0 }} 条）</span>
            <a-button size="small" @click="expandedSections.routes = !expandedSections.routes">
              {{ expandedSections.routes ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.routes" class="section-body">
            <a-table
              :columns="routeColumns"
              :data-source="previewData?.routes || []"
              :pagination="false"
              rowKey="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  {{ record.name || record.id || '-' }}
                </template>
                <template v-if="column.key === 'uri'">
                  {{ record.uri || record.uris?.[0] || '-' }}
                </template>
                <template v-if="column.key === 'methods'">
                  <a-tag
                    v-for="m in (record.methods || [])"
                    :key="m"
                    color="blue"
                  >
                    {{ m }}
                  </a-tag>
                  <span v-if="!record.methods || record.methods.length === 0">-</span>
                </template>
                <template v-if="column.key === 'upstream'">
                  {{ record.upstream_id || '-' }}
                </template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- 插件组 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.plugin_configs" />
            <span class="section-title">插件组（{{ previewData?.plugin_configs?.length || 0 }} 个）</span>
            <a-button size="small" @click="expandedSections.plugin_configs = !expandedSections.plugin_configs">
              {{ expandedSections.plugin_configs ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.plugin_configs" class="section-body">
            <a-table
              :columns="pluginConfigColumns"
              :data-source="previewData?.plugin_configs || []"
              :pagination="false"
              rowKey="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'id'">
                  <span style="font-size: 12px;">{{ record.id }}</span>
                </template>
                <template v-if="column.key === 'desc'">
                  {{ record.desc || record.name || '-' }}
                </template>
                <template v-if="column.key === 'plugins'">
                  <a-tag v-if="record.plugins">
                    {{ Object.keys(record.plugins).length }} 个插件
                  </a-tag>
                  <span v-else>-</span>
                </template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- 全局规则 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.global_rules" />
            <span class="section-title">全局规则（{{ previewData?.global_rules?.length || 0 }} 个）</span>
            <a-button size="small" @click="expandedSections.global_rules = !expandedSections.global_rules">
              {{ expandedSections.global_rules ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.global_rules" class="section-body">
            <a-table
              :columns="globalRuleColumns"
              :data-source="previewData?.global_rules || []"
              :pagination="false"
              rowKey="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'id'">
                  <span style="font-size: 12px;">{{ record.id }}</span>
                </template>
                <template v-if="column.key === 'desc'">
                  {{ record.desc || record.name || '-' }}
                </template>
                <template v-if="column.key === 'plugins'">
                  <a-tag v-if="record.plugins">
                    {{ Object.keys(record.plugins).length }} 个插件
                  </a-tag>
                  <span v-else>-</span>
                </template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- 插件元数据 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.plugin_metadata" />
            <span class="section-title">插件元数据（{{ previewData?.plugin_metadata?.length || 0 }} 个）</span>
            <a-button size="small" @click="expandedSections.plugin_metadata = !expandedSections.plugin_metadata">
              {{ expandedSections.plugin_metadata ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.plugin_metadata" class="section-body">
            <a-table
              :columns="pluginMetadataColumns"
              :data-source="previewData?.plugin_metadata || []"
              :pagination="false"
              rowKey="plugin_name"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'plugin_name'">
                  {{ record.plugin_name || '-' }}
                </template>
                <template v-if="column.key === 'config_data'">
                  <a-tag v-if="record.config_data && Object.keys(record.config_data).length">
                    {{ Object.keys(record.config_data).length }} 个插件
                  </a-tag>
                  <span v-else>-</span>
                </template>
              </template>
            </a-table>
          </div>
        </div>
        <!-- 四层代理 -->
        <div class="section-card">
          <div class="section-header">
            <a-checkbox v-model:checked="selections.stream_proxy" />
            <span class="section-title">四层代理（{{ previewData?.stream_proxies?.length || 0 }} 个）</span>
            <a-button size="small" @click="expandedSections.stream_proxy = !expandedSections.stream_proxy">
              {{ expandedSections.stream_proxy ? '收起详情' : '预览详情' }}
            </a-button>
          </div>
          <div v-if="expandedSections.stream_proxy" class="section-body">
            <a-table
              :columns="streamProxyColumns"
              :data-source="previewData?.stream_proxies || []"
              :pagination="false"
              rowKey="edge_uuid"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  {{ record.name || '-' }}
                </template>
                <template v-if="column.key === 'listen_port'">
                  <span class="text-mono">{{ record.listen_port }}</span>
                </template>
                <template v-if="column.key === 'load_balance'">
                  {{ record.load_balance || '-' }}
                </template>
                <template v-if="column.key === 'scheme'">
                  {{ record.scheme || 'tcp' }}
                </template>
                <template v-if="column.key === 'targets'">
                  <span v-if="record.targets && record.targets.length">{{ record.targets.length }} 个目标</span>
                  <span v-else>-</span>
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
        <a-button @click="goToStep(1)">上一步</a-button>
        <a-button @click="handleCancel">取消</a-button>
        <a-button type="primary" :loading="importing" @click="handleImport">
          确认导入
        </a-button>
      </div>
    </div>

    <!-- 导入结果弹窗 -->
    <a-modal
      v-model:open="resultModalVisible"
      title="导入结果"
      :footer="null"
      width="560px"
    >
      <div v-if="importResult">
        <a-alert
          v-if="importResult.success"
          type="success"
          show-icon
          style="margin-bottom: 16px;"
        >
          <template #message>
            <strong>导入完成</strong>
          </template>
          <template #description>
            <div>上游：{{ importResult.imported_counts.upstreams }} 个</div>
            <div>路由：{{ importResult.imported_counts.routes }} 条</div>
            <div>插件组：{{ importResult.imported_counts.plugin_configs }} 个</div>
            <div>全局规则：{{ importResult.imported_counts.global_rules }} 个</div>
            <div>插件元数据：{{ importResult.imported_counts.plugin_metadata || 0 }} 个</div>
            <div>四层代理：{{ importResult.imported_counts.stream_proxies || 0 }} 个</div>
            <div v-if="importResult.imported_counts.skipped > 0">
              跳过：{{ importResult.imported_counts.skipped }} 项
            </div>
            <div style="margin-top: 8px;">
              <router-link :to="'/clusters'">
                查看集群详情
              </router-link>
            </div>
          </template>
        </a-alert>

        <a-alert
          v-else
          type="error"
          show-icon
          style="margin-bottom: 16px;"
        >
          <template #message>
            <strong>导入失败</strong>
          </template>
          <template #description>
            {{ importResult.message || '导入过程中出现错误，请重试。' }}
          </template>
        </a-alert>

        <!-- 导入后的插件摘要 -->
        <a-alert
          v-if="importResult.plugin_summary && importResult.plugin_summary.unknown_count > 0"
          type="info"
          show-icon
          style="margin-bottom: 16px;"
        >
          <template #message>
            <strong>插件信息</strong>
          </template>
          <template #description>
            新发现 {{ importResult.plugin_summary.unknown_count }} 个插件（
            {{ importResult.plugin_summary.unknown_plugin_names.join('、') }}
          ），已存入数据库。
        </template>
        </a-alert>
      </div>

      <div v-if="importError" style="margin-bottom: 16px;">
        <a-alert type="error" show-icon :message="importError" />
      </div>

      <div style="text-align: right; margin-top: 16px;">
        <a-button type="primary" @click="resultModalVisible = false">
          关闭
        </a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { CloudUploadOutlined, BranchesOutlined, PropertySafetyOutlined, BlockOutlined, AppstoreOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import { testConnection, getPreview, executeImport } from '@/api/edgeImport'
import PageHeader from '@/components/PageHeader.vue'
import type {
  TestConnectionResponse,
  PreviewResponse,
  ImportResponse
} from '@/api/edgeImport'

// ---- State ----

const currentStep = ref(0)
const clusters = ref<any[]>([])
const selectedClusterId = ref<number | null>(null)
const loadingClusters = ref(false)

const selectedNodeId = ref<number | null>(null)
const nodes = ref<any[]>([])
const loadingNodes = ref(false)
const adminKey = ref('')
const testingConnection = ref(false)
const connectionResult = ref<TestConnectionResponse | null>(null)
const connectionError = ref('')
const connectionTested = ref(false)

const previewData = ref<PreviewResponse | null>(null)
const loadingPreview = ref(false)

const selections = reactive({
  upstreams: true,
  routes: true,
  plugin_configs: true,
  global_rules: true,
  plugin_metadata: true,
  stream_proxy: true,
})

const expandedSections = reactive({
  upstreams: false,
  routes: false,
  plugin_configs: false,
  global_rules: false,
  plugin_metadata: false,
  stream_proxy: false,
})

const showConflicts = ref(false)

const configTypes = [
  { key: 'upstreams', label: '上游服务', icon: CloudUploadOutlined },
  { key: 'routes', label: '路由规则', icon: BranchesOutlined },
  { key: 'plugin_configs', label: '插件组', icon: BlockOutlined },
  { key: 'global_rules', label: '全局规则', icon: PropertySafetyOutlined },
  { key: 'plugin_metadata', label: '插件元数据', icon: AppstoreOutlined },
  { key: 'stream_proxy', label: '四层代理', icon: CloudUploadOutlined },
]

function toggleConfigType(key: string) {
  (selections as any)[key] = !(selections as any)[key]
}

const hasSelection = computed(() => {
  return configTypes.some(ct => (selections as any)[ct.key])
})

const importing = ref(false)
const resultModalVisible = ref(false)
const importResult = ref<ImportResponse | null>(null)
const importError = ref('')

// ---- Columns ----

const conflictColumns = [
  { title: '类型', key: 'type', width: 100 },
  { title: '资源', key: 'resource', width: 160 },
  { title: '原因', key: 'reason' },
  { title: '解决方案', key: 'resolution', width: 160 }
]

const upstreamColumns = [
  { title: '名称', key: 'name' },
  { title: '类型', key: 'type', width: 120 },
  { title: '节点数', key: 'nodes', width: 100 }
]

const routeColumns = [
  { title: '名称', key: 'name' },
  { title: 'URI', key: 'uri' },
  { title: '方法', key: 'methods', width: 180 },
  { title: '上游', key: 'upstream', width: 160 }
]

const pluginConfigColumns = [
  { title: 'ID', key: 'id', width: 100 },
  { title: '描述', key: 'desc' },
  { title: '插件数', key: 'plugins', width: 100 }
]

const globalRuleColumns = [
  { title: 'ID', key: 'id', width: 100 },
  { title: '描述', key: 'desc' },
  { title: '插件数', key: 'plugins', width: 100 }
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
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
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
  // Going back to step 0: clear node selection and connection test
  if (step === 0 && currentStep.value > 0) {
    selectedNodeId.value = null
    nodes.value = []
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
      // Auto-expand conflict section if conflicts exist
      if (res.data.conflicts && res.data.conflicts.length > 0) {
        showConflicts.value = true
      }
    } catch (error: any) {
      message.error('获取预览数据失败: ' + (error.response?.data?.detail || error.message))
      // Stay on step 2 if preview fetch fails
      return
    } finally {
      loadingPreview.value = false
    }
  }

  currentStep.value = step
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
}

// ---- Import ----

const handleImport = async () => {
  if (!selectedClusterId.value || !selectedNodeId.value) {
    message.warning('集群或节点信息缺失，请重新选择')
    return
  }

  importing.value = true
  importResult.value = null
  importError.value = ''

  try {
    const res = await executeImport(selectedClusterId.value, selectedNodeId.value, {
      upstreams: selections.upstreams,
      routes: selections.routes,
      plugin_configs: selections.plugin_configs,
      global_rules: selections.global_rules,
      plugin_metadata: selections.plugin_metadata,
      stream_proxy: selections.stream_proxy,
    }, adminKey.value)
    importResult.value = res.data
    resultModalVisible.value = true
  } catch (error: any) {
    importError.value = error.response?.data?.detail || error.message || '导入失败，请重试'
    resultModalVisible.value = true
  } finally {
    importing.value = false
  }
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
:deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%) !important;
  border-bottom: 2px solid var(--accent) !important;
  color: var(--fg) !important;
  font-weight: 600;
}
:deep(.ant-table-tbody > tr > td) {
  background: transparent !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--fg);
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

.config-types {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.config-type-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  position: relative;
}
.config-type-card:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
.config-type-card.selected { border-color: var(--accent); background: oklch(56% 0.16 210 / 6%); }
.config-type-card .ct-check {
  display: none;
  float: right;
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
}
.config-type-card.selected .ct-check { display: inline; }
.config-type-card .ct-icon { font-size: 24px; margin-bottom: 8px; display: block; }
.config-type-card .ct-name { font-size: 14px; font-weight: 600; }

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
</style>
