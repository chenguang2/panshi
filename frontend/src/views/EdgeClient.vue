<template>
  <div class="edge-client">
    <a-alert
      message="调试模式"
      description="此处操作绕过正常同步流程，直接修改边缘节点数据"
      type="warning"
      show-icon
      closable
      style="margin-bottom: 16px;"
    />

    <a-card>
      <div class="node-selector">
        <a-radio-group v-model:value="inputMode" style="margin-right: 16px;">
          <a-radio value="cluster">按集群选择</a-radio>
          <a-radio value="manual">手动输入</a-radio>
        </a-radio-group>

        <template v-if="inputMode === 'cluster'">
          <a-select
            v-model:value="selectedClusterId"
            placeholder="选择集群"
            style="width: 200px;"
            @change="onClusterChange"
          >
            <a-select-option v-for="cluster in clusters" :key="cluster.id" :value="cluster.id">
              {{ cluster.display_name || cluster.name }}
            </a-select-option>
          </a-select>
          <a-select
            v-model:value="selectedNode"
            placeholder="选择边缘节点"
            style="width: 250px; margin-left: 8px;"
            :disabled="!selectedClusterId"
            @change="onNodeChange"
          >
            <a-select-option v-for="node in clusterNodes" :key="node.ip + ':' + node.management_port" :value="node.ip + ':' + node.management_port">
              {{ node.ip }}:{{ node.management_port }}
            </a-select-option>
          </a-select>
        </template>

        <template v-else>
          <a-input
            v-model:value="manualNode"
            placeholder="192.168.100.235:11999"
            style="width: 250px;"
            @blur="onManualInput"
          />
        </template>

        <a-button type="primary" @click="startQuery" :loading="loading" style="margin-left: 8px;">
          <SearchOutlined /> 查询
        </a-button>
        <a-button @click="cancelQuery" :disabled="!loading" style="margin-left: 4px;">
          <CloseCircleOutlined /> 取消查询
        </a-button>
      </div>

      <a-tabs v-model:activeKey="activeTab" style="margin-top: 16px;">
        <a-tab-pane key="upstreams" tab="上游">
          <div class="table-toolbar">
            <a-button type="primary" @click="showUpstreamModal('create')">
              <PlusOutlined /> 添加上游
            </a-button>
            <a-input-search v-model:value="upstreamSearch" placeholder="搜索上游..." style="width: 240px;" allow-clear />
          </div>
          <a-table
            :columns="upstreamColumns"
            :data-source="upstreamSearch ? upstreams.filter(u => (u.value?.name || '').includes(upstreamSearch) || (u.value?.id || '').includes(upstreamSearch)) : upstreams"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'name'">
                {{ record.value?.name || '-' }}
              </template>
              <template v-if="column.key === 'type'">
                {{ record.value?.type || '-' }}
              </template>
              <template v-if="column.key === 'nodes'">
                <span v-if="record.value?.nodes">
                  {{ getNodeCount(record.value.nodes) }} 个节点
                </span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <a-space>
                  <a-button size="small" @click="showUpstreamJson(record)">JSON</a-button>
                  <a-button size="small" @click="showUpstreamModal('edit', record)">编辑</a-button>
                  <a-button size="small" danger @click="deleteUpstream(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="routes" tab="路由">
          <div class="table-toolbar">
            <a-button type="primary" @click="showRouteModal('create')">
              <PlusOutlined /> 添加路由
            </a-button>
            <a-input-search v-model:value="routeSearch" placeholder="搜索路由..." style="width: 240px;" allow-clear />
          </div>
          <a-table
            :columns="routeColumns"
            :data-source="routeSearch ? routes.filter(r => (r.value?.name || '').includes(routeSearch) || (r.value?.uri || '').includes(routeSearch)) : routes"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'name'">
                {{ record.value?.name || '-' }}
              </template>
              <template v-if="column.key === 'uri'">
                {{ record.value?.uri || record.value?.uris?.[0] || '-' }}
              </template>
              <template v-if="column.key === 'methods'">
                <a-tag v-for="m in (record.value?.methods || [])" :key="m" color="blue">{{ m }}</a-tag>
              </template>
              <template v-if="column.key === 'upstream'">
                {{ record.value?.upstream_id || '-' }}
              </template>
              <template v-if="column.key === 'actions'">
                <a-space>
                  <a-button size="small" @click="showRouteJson(record)">JSON</a-button>
                  <a-button size="small" @click="showRouteModal('edit', record)">编辑</a-button>
                  <a-button size="small" danger @click="deleteRoute(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="globalRules" tab="全局规则">
          <div class="table-toolbar">
            <a-button type="primary" @click="showGlobalRuleModal('create')">
              <PlusOutlined /> 添加规则
            </a-button>
            <a-input-search v-model:value="globalRuleSearch" placeholder="搜索规则..." style="width: 240px;" allow-clear />
          </div>
          <a-table
            :columns="globalRuleColumns"
            :data-source="globalRuleSearch ? globalRules.filter(r => (r.value?.desc || '').includes(globalRuleSearch) || (r.value?.id || '').includes(globalRuleSearch)) : globalRules"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'desc'">
                {{ record.value?.desc || '-' }}
              </template>
              <template v-if="column.key === 'plugins'">
                <a-tag v-if="record.value?.plugins">{{ Object.keys(record.value.plugins).length }} 个插件</a-tag>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <a-space>
                  <a-button size="small" @click="showGlobalRuleJson(record)">JSON</a-button>
                  <a-button size="small" @click="showGlobalRuleModal('edit', record)">编辑</a-button>
                  <a-button size="small" danger @click="deleteGlobalRule(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="pluginConfigs" tab="插件组">
          <div class="table-toolbar">
            <a-button type="primary" @click="showPluginConfigModal('create')">
              <PlusOutlined /> 添加插件组
            </a-button>
            <a-input-search v-model:value="pluginConfigSearch" placeholder="搜索插件组..." style="width: 240px;" allow-clear />
          </div>
          <a-table
            :columns="pluginConfigColumns"
            :data-source="pluginConfigSearch ? pluginConfigs.filter(p => (p.value?.desc || '').includes(pluginConfigSearch) || (p.value?.id || '').includes(pluginConfigSearch)) : pluginConfigs"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'id'">
                <span style="font-size: 12px;">{{ record.value?.id }}</span>
              </template>
              <template v-if="column.key === 'desc'">
                {{ record.value?.desc || '-' }}
              </template>
              <template v-if="column.key === 'plugins'">
                <a-tag v-if="record.value?.plugins">{{ Object.keys(record.value.plugins).length }} 个插件</a-tag>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'labels'">
                <span v-if="record.value?.labels">{{ Object.keys(record.value.labels).length }}</span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'hosts'">
                <span v-if="record.value?.hosts">{{ record.value.hosts.length }}</span>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'actions'">
                <a-space>
                  <a-button size="small" @click="showPluginConfigJson(record)">JSON</a-button>
                  <a-button size="small" @click="showPluginConfigModal('edit', record)">编辑</a-button>
                  <a-button size="small" danger @click="deletePluginConfig(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="pluginMetadata" tab="插件元数据">
          <div class="table-toolbar">
            <a-button type="primary" @click="showPluginMetadataModal('create')">
              <PlusOutlined />               添加插件元数据
            </a-button>
            <a-button @click="reloadPlugins" :loading="reloadingPlugins">
              <ReloadOutlined /> 重新加载
            </a-button>
            <a-input-search v-model:value="pluginMetadataSearch" placeholder="搜索..." style="width: 200px;" allow-clear />
          </div>
          <a-table
            :columns="pluginMetadataColumns"
            :data-source="pluginMetadataSearch ? pluginMetadataList.filter(m => (m.key || '').includes(pluginMetadataSearch)) : pluginMetadataList"
            :loading="loading"
            :pagination="false"
            rowKey="key"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span style="font-size: 12px;">{{ record.key?.split('/').pop() || '-' }}</span>
              </template>
              <template v-if="column.key === 'config'">
                <pre style="max-width: 400px; overflow: auto; font-size: 11px;">{{ JSON.stringify(record.value, null, 2) }}</pre>
              </template>
              <template v-if="column.key === 'actions'">
                <a-space>
                  <a-button size="small" @click="showPluginMetadataJson(record)">JSON</a-button>
                  <a-button size="small" @click="showPluginMetadataModal('edit', record)">编辑</a-button>
                  <a-button size="small" danger @click="deletePluginMetadata(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="pluginList" tab="插件列表">
          <a-table
            :columns="pluginListColumns"
            :data-source="pluginList"
            :loading="loading"
            :pagination="false"
            :row-key="(_record: any, index: number) => index"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'index'">
                <span style="font-size: 12px;">{{ index + 1 }}</span>
              </template>
              <template v-if="column.key === 'name'">
                <span style="font-size: 12px;">{{ record }}</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-modal
      v-model:open="upstreamModalVisible"
      :title="upstreamModalMode === 'create' ? '创建上游' : '编辑上游'"
      @ok="handleUpstreamSubmit"
      width="600px"
    >
      <a-form :model="upstreamForm" layout="vertical">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="upstreamForm.name" placeholder="上游名称" />
        </a-form-item>
        <a-form-item label="类型" name="type">
          <a-select v-model:value="upstreamForm.type">
            <a-select-option value="roundrobin">roundrobin</a-select-option>
            <a-select-option value="chash">chash</a-select-option>
            <a-select-option value="ewma">ewma</a-select-option>
            <a-select-option value="least_conn">least_conn</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="节点" name="nodes">
          <div v-for="(node, index) in upstreamForm.nodes" :key="index" style="display: flex; gap: 8px; margin-bottom: 8px;">
            <a-input v-model:value="node.host" placeholder="127.0.0.1:1980" style="width: 200px;" />
            <a-input-number v-model:value="node.weight" placeholder="权重" style="width: 100px;" />
            <a-button @click="removeNode(index)" danger>删除</a-button>
          </div>
          <a-button @click="addNode" type="dashed">+ 添加节点</a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="routeModalVisible"
      :title="routeModalMode === 'create' ? '创建路由' : '编辑路由'"
      @ok="handleRouteSubmit"
      width="700px"
    >
      <a-form :model="routeForm" layout="vertical">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="routeForm.name" placeholder="路由名称" />
        </a-form-item>
        <a-form-item label="URI" name="uri">
          <a-input v-model:value="routeForm.uri" placeholder="/api/*" />
        </a-form-item>
        <a-form-item label="请求方法" name="methods">
          <a-select v-model:value="routeForm.methods" mode="multiple" placeholder="选择方法">
            <a-select-option value="GET">GET</a-select-option>
            <a-select-option value="POST">POST</a-select-option>
            <a-select-option value="PUT">PUT</a-select-option>
            <a-select-option value="DELETE">DELETE</a-select-option>
            <a-select-option value="PATCH">PATCH</a-select-option>
            <a-select-option value="HEAD">HEAD</a-select-option>
            <a-select-option value="OPTIONS">OPTIONS</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="域名" name="hosts">
          <a-input v-model:value="routeForm.hosts" placeholder="example.com,*.example.com" />
        </a-form-item>
        <a-form-item label="优先级" name="priority">
          <a-input-number v-model:value="routeForm.priority" style="width: 100%;" />
        </a-form-item>
        <a-form-item label="上游ID" name="upstream_id">
          <a-input v-model:value="routeForm.upstream_id" placeholder="上游UUID" />
        </a-form-item>
        <a-form-item label="插件配置 (JSON)" name="plugins">
          <a-textarea v-model:value="routeForm.pluginsJson" :rows="4" placeholder='{"proxy_rewrite": {...}}' />
        </a-form-item>
        <a-divider style="margin: 8px 0;" />
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">关联插件组</div>
        <div v-if="pluginConfigs.length === 0" style="padding: 16px 0; text-align: center; color: #999; font-size: 12px;">
          暂无插件组
        </div>
        <div v-else style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 240px; overflow-y: auto;">
          <div
            v-for="pg in pluginConfigs"
            :key="pg.value?.id || pg.key"
            class="plugin-config-card"
            :class="{ selected: isPluginGroupSelected(pg.value?.id || pg.key) }"
            @click="togglePluginGroup(pg)"
            style="width: 100%; border: 1px solid #e8e8e8; border-radius: 6px; padding: 10px; cursor: pointer; transition: all 0.2s; background: #fff;"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <a-checkbox :checked="isPluginGroupSelected(pg.value?.id || pg.key)" @click.stop="togglePluginGroup(pg)" />
              <strong style="font-size: 13px; flex: 1; margin-left: 8px;">{{ pg.value?.id || pg.key }}</strong>
              <span style="font-size: 11px; color: #999;">v{{ pg.value?.current_version || 0 }}</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-left: 24px;">
              <a-tag
                v-for="(pcfg, pname) in (typeof pg.value?.plugins === 'string' ? JSON.parse(pg.value.plugins) : (pg.value?.plugins || {}))"
                :key="pname"
                color="blue"
                style="font-size: 11px;"
              >
                {{ pname }}
              </a-tag>
            </div>
            <div v-if="pg.value?.desc" style="font-size: 11px; color: #999; margin-left: 24px; margin-top: 4px;">{{ pg.value?.desc }}</div>
          </div>
        </div>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="jsonModalVisible"
      title="JSON 数据"
      :footer="null"
      width="700px"
    >
      <pre style="max-height: 500px; overflow: auto; background: #f5f5f5; padding: 16px; border-radius: 4px; font-size: 12px;">{{ jsonContent }}</pre>
    </a-modal>

    <a-modal
      v-model:open="globalRuleModalVisible"
      :title="globalRuleModalMode === 'create' ? '创建全局规则' : '编辑全局规则'"
      @ok="handleGlobalRuleSubmit"
      width="700px"
    >
      <a-form :model="globalRuleForm" layout="vertical">
        <a-form-item label="规则ID" name="id">
          <a-input v-model:value="globalRuleForm.id" placeholder="如: 6001" :disabled="globalRuleModalMode === 'edit'" />
        </a-form-item>
        <a-form-item label="描述" name="desc">
          <a-input v-model:value="globalRuleForm.desc" placeholder="规则描述" />
        </a-form-item>
        <a-form-item label="插件配置 (JSON)" name="pluginsJson">
          <a-textarea v-model:value="globalRuleForm.pluginsJson" :rows="6" placeholder='{"plugin_name": {"option": "value"}}' />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="pluginConfigModalVisible"
      :title="pluginConfigModalMode === 'create' ? '创建插件组' : '编辑插件组'"
      @ok="handlePluginConfigSubmit"
      width="700px"
    >
      <a-form :model="pluginConfigForm" layout="vertical">
        <a-form-item label="配置ID" name="id">
          <a-input v-model:value="pluginConfigForm.id" placeholder="如: 5001" :disabled="pluginConfigModalMode === 'edit'" />
        </a-form-item>
        <a-form-item label="描述" name="desc">
          <a-input v-model:value="pluginConfigForm.desc" placeholder="配置描述" />
        </a-form-item>
        <a-form-item label="插件配置 (JSON)" name="pluginsJson">
          <a-textarea v-model:value="pluginConfigForm.pluginsJson" :rows="6" placeholder='{"plugin_name": {"option": "value"}}' />
        </a-form-item>
        <a-form-item label="Labels (JSON)" name="labelsJson">
          <a-textarea v-model:value="pluginConfigForm.labelsJson" :rows="2" placeholder='{"version": "v2"}' />
        </a-form-item>
        <a-form-item label="Hosts (JSON)" name="hostsJson">
          <a-textarea v-model:value="pluginConfigForm.hostsJson" :rows="2" placeholder='["foo.com", "*.bar.com"]' />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="pluginMetadataModalVisible"
      :title="pluginMetadataModalMode === 'create' ? '创建插件数据' : '编辑插件数据'"
      @ok="handlePluginMetadataSubmit"
      width="700px"
    >
      <a-form :model="pluginMetadataForm" layout="vertical">
        <a-form-item label="插件名称" name="name">
          <a-input v-model:value="pluginMetadataForm.name" placeholder="如: log_process" :disabled="pluginMetadataModalMode === 'edit'" />
        </a-form-item>
        <a-form-item label="配置数据 (JSON)" name="configJson">
          <a-textarea v-model:value="pluginMetadataForm.configJson" :rows="8" placeholder='{"option": "value"}' />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, onUnmounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, CloseCircleOutlined, SearchOutlined } from '@ant-design/icons-vue'
import api from '@/api'

const inputMode = ref<'cluster' | 'manual'>('cluster')
const clusters = ref<any[]>([])
const selectedClusterId = ref<string | null>(null)
const clusterNodes = ref<any[]>([])
const selectedNode = ref<string | null>(null)
const manualNode = ref('')
const activeTab = ref('upstreams')
const loading = ref(false)
const currentSignal = ref<AbortSignal | undefined>(undefined)

// AbortController for cancel query
let abortController: AbortController | null = null

function getSignal(): AbortSignal | undefined {
  abortController = new AbortController()
  return abortController.signal
}

function cancelQuery() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  loading.value = false
}

onUnmounted(() => {
  cancelQuery()
})

const canQuery = computed(() => {
  if (inputMode.value === 'cluster') {
    return !!selectedNode.value
  }
  return manualNode.value.trim().includes(':')
})

const upstreams = ref<any[]>([])
const routes = ref<any[]>([])
const globalRules = ref<any[]>([])
const pluginConfigs = ref<any[]>([])
const pluginMetadataList = ref<any[]>([])
const pluginList = ref<any[]>([])
const reloadingPlugins = ref(false)

const upstreamSearch = ref('')
const routeSearch = ref('')
const globalRuleSearch = ref('')
const pluginConfigSearch = ref('')
const pluginMetadataSearch = ref('')

const upstreamModalVisible = ref(false)
const upstreamModalMode = ref<'create' | 'edit'>('create')
const upstreamEditRecord = ref<any>(null)
const upstreamForm = reactive({
  name: '',
  type: 'roundrobin',
  nodes: [] as { host: string; weight: number }[]
})

const routeModalVisible = ref(false)
const routeModalMode = ref<'create' | 'edit'>('create')
const routeEditRecord = ref<any>(null)
const routeForm = reactive({
  name: '',
  uri: '',
  methods: [] as string[],
  hosts: '',
  priority: 0,
  upstream_id: '',
  pluginsJson: '',
  plugin_config_ids: [] as string[]
})

const jsonModalVisible = ref(false)
const jsonContent = ref('')

const upstreamColumns = [
  { title: 'ID', key: 'id', width: 200, sorter: (a: any, b: any) => (a.value?.id || '').localeCompare(b.value?.id || '') },
  { title: '名称', key: 'name', width: 150, sorter: (a: any, b: any) => (a.value?.name || '').localeCompare(b.value?.name || '') },
  { title: '类型', key: 'type', width: 100, sorter: (a: any, b: any) => (a.value?.type || '').localeCompare(b.value?.type || '') },
  { title: '节点数', key: 'nodes', width: 100, sorter: (a: any, b: any) => (getNodeCount(a.value?.nodes) - getNodeCount(b.value?.nodes)) },
  { title: '操作', key: 'actions', width: 150 }
]

const routeColumns = [
  { title: 'ID', key: 'id', width: 200, sorter: (a: any, b: any) => (a.value?.id || '').localeCompare(b.value?.id || '') },
  { title: '名称', key: 'name', width: 120, sorter: (a: any, b: any) => (a.value?.name || '').localeCompare(b.value?.name || '') },
  { title: 'URI', key: 'uri', width: 150, sorter: (a: any, b: any) => (a.value?.uri || '').localeCompare(b.value?.uri || '') },
  { title: '方法', key: 'methods', width: 180 },
  { title: '上游', key: 'upstream', width: 150 },
  { title: '操作', key: 'actions', width: 150 }
]

const pluginColumns = [
  { title: '名称', key: 'name', width: 150 },
  { title: '配置', key: 'config' }
]

const pluginMetadataColumns = [
  { title: '插件名称', key: 'name', width: 200, sorter: (a: any, b: any) => ((a.key?.split('/').pop() || '') + '').localeCompare((b.key?.split('/').pop() || '') + '') },
  { title: '配置', key: 'config' },
  { title: '操作', key: 'actions', width: 200 }
]

const pluginListColumns = [
  { title: '序号', key: 'index', width: 80 },
  { title: '插件名称', key: 'name', width: 300 }
]

const globalRuleColumns = [
  { title: 'ID', key: 'id', width: 120, sorter: (a: any, b: any) => (a.value?.id || '').localeCompare(b.value?.id || '') },
  { title: '描述', key: 'desc', width: 150, sorter: (a: any, b: any) => (a.value?.desc || '').localeCompare(b.value?.desc || '') },
  { title: '插件数', key: 'plugins', width: 100, sorter: (a: any, b: any) => ((a.value?.plugins ? Object.keys(a.value.plugins).length : 0) - (b.value?.plugins ? Object.keys(b.value.plugins).length : 0)) },
  { title: '操作', key: 'actions', width: 200 }
]

const pluginConfigColumns = [
  { title: 'ID', key: 'id', width: 120, sorter: (a: any, b: any) => (a.value?.id || '').localeCompare(b.value?.id || '') },
  { title: '描述', key: 'desc', width: 150, sorter: (a: any, b: any) => (a.value?.desc || '').localeCompare(b.value?.desc || '') },
  { title: '插件数', key: 'plugins', width: 80, sorter: (a: any, b: any) => ((a.value?.plugins ? Object.keys(a.value.plugins).length : 0) - (b.value?.plugins ? Object.keys(b.value.plugins).length : 0)) },
  { title: 'Labels', key: 'labels', width: 80 },
  { title: 'Hosts', key: 'hosts', width: 80 },
  { title: '操作', key: 'actions', width: 200 }
]

const globalRuleModalVisible = ref(false)
const globalRuleModalMode = ref<'create' | 'edit'>('create')
const globalRuleForm = reactive({
  id: '',
  desc: '',
  pluginsJson: ''
})

const pluginConfigModalVisible = ref(false)
const pluginConfigModalMode = ref<'create' | 'edit'>('create')
const pluginConfigForm = reactive({
  id: '',
  desc: '',
  pluginsJson: '',
  labelsJson: '',
  hostsJson: ''
})

const pluginMetadataModalVisible = ref(false)
const pluginMetadataModalMode = ref<'create' | 'edit'>('create')
const pluginMetadataForm = reactive({
  name: '',
  configJson: ''
})

const loadClusters = async () => {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch (error: any) {
    message.error('加载集群列表失败: ' + (error.response?.data?.detail || error.message))
  }
}

const onClusterChange = async () => {
  selectedNode.value = null
  clusterNodes.value = []

  if (!selectedClusterId.value) return

  try {
    const res = await api.get(`/clusters/${selectedClusterId.value}/nodes`)
    clusterNodes.value = res.data?.items || []
  } catch (error: any) {
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
  }
}

const onNodeChange = async () => {
  await loadAllData()
}

const onManualInput = () => {
  const value = manualNode.value.trim()
  if (value && value.includes(':')) {
    selectedNode.value = value
  }
}

// 单独加载各标签页数据
const loadUpstreams = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/upstreams`, { signal: currentSignal.value })
    upstreams.value = res.data.upstreams || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadUpstreams error:', error)
  }
}

const loadRoutes = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/routes`, { signal: currentSignal.value })
    routes.value = res.data.routes || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadRoutes error:', error)
  }
}

const loadGlobalRules = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/global_rules`, { signal: currentSignal.value })
    globalRules.value = res.data.global_rules || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadGlobalRules error:', error)
  }
}

const loadPluginConfigs = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugin_configs`, { signal: currentSignal.value })
    pluginConfigs.value = res.data.plugin_configs || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadPluginConfigs error:', error)
  }
}

const loadPluginMetadata = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugin_metadata`, { signal: currentSignal.value })
    pluginMetadataList.value = res.data.plugin_metadata || []
  } catch (error: any) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return
    console.error('[DEBUG] loadPluginMetadata error:', error)
  }
}

const loadPluginList = async (ip: string, port: string) => {
  try {
    const res = await api.get(`/edge-client/nodes/${ip}/${port}/plugins/list`, { signal: currentSignal.value })
    pluginList.value = res.data.plugins || []
  } catch (error: any) {
    console.error('[DEBUG] loadPluginList error:', error)
  }
}

// 预加载所有标签页数据（并行）
const loadAllData = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  
  // Create abort signal for this query
  abortController = new AbortController()
  currentSignal.value = abortController.signal
  
  loading.value = true

  try {
    await Promise.all([
      loadUpstreams(ip, port),
      loadRoutes(ip, port),
      loadGlobalRules(ip, port),
      loadPluginConfigs(ip, port),
      loadPluginMetadata(ip, port),
      loadPluginList(ip, port)
    ])
  } catch (error: any) {
    console.error('[DEBUG] loadAllData error:', error)
    message.error('加载数据失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

// 单个标签页加载（保留用于切换标签时快速刷新）
const loadData = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')

  switch (activeTab.value) {
    case 'upstreams': await loadUpstreams(ip, port); break
    case 'routes': await loadRoutes(ip, port); break
    case 'globalRules': await loadGlobalRules(ip, port); break
    case 'pluginConfigs': await loadPluginConfigs(ip, port); break
    case 'pluginMetadata': await loadPluginMetadata(ip, port); break
    case 'pluginList': await loadPluginList(ip, port); break
  }
}

const startQuery = async () => {
  await loadAllData()
}

const getNodeCount = (nodes: any) => {
  if (Array.isArray(nodes)) return nodes.length
  if (typeof nodes === 'object') return Object.keys(nodes).length
  return 0
}

const showUpstreamModal = (mode: 'create' | 'edit', record?: any) => {
  upstreamModalMode.value = mode
  upstreamEditRecord.value = mode === 'edit' ? record : null
  if (mode === 'edit' && record?.value) {
    upstreamForm.name = record.value.name || ''
    upstreamForm.type = record.value.type || 'roundrobin'
    upstreamForm.nodes = []
    if (record.value.nodes) {
      if (Array.isArray(record.value.nodes)) {
        record.value.nodes.forEach((n: any) => {
          upstreamForm.nodes.push({ host: `${n.host}:${n.port}`, weight: n.weight || 1 })
        })
      } else {
        Object.entries(record.value.nodes).forEach(([host, weight]: [string, any]) => {
          upstreamForm.nodes.push({ host, weight })
        })
      }
    }
  } else {
    upstreamForm.name = ''
    upstreamForm.type = 'roundrobin'
    upstreamForm.nodes = [{ host: '', weight: 1 }]
  }
  upstreamModalVisible.value = true
}

const addNode = () => {
  upstreamForm.nodes.push({ host: '', weight: 1 })
}

const removeNode = (index: number) => {
  upstreamForm.nodes.splice(index, 1)
}

const handleUpstreamSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  const nodesObj: Record<string, number> = {}
  upstreamForm.nodes.forEach(n => {
    if (n.host) nodesObj[n.host] = n.weight
  })

  const payload = {
    type: upstreamForm.type,
    name: upstreamForm.name || undefined,
    nodes: nodesObj
  }

  try {
    if (upstreamModalMode.value === 'create') {
      await api.post(`/edge-client/nodes/${ip}/${port}/upstreams`, payload)
      message.success('上游创建成功')
    } else {
      const upstreamId = upstreamEditRecord.value?.value?.id
      if (!upstreamId) {
        message.error('无法获取上游 ID')
        return
      }
      await api.put(`/edge-client/nodes/${ip}/${port}/upstreams/${upstreamId}`, payload)
      message.success('上游更新成功')
    }
    upstreamModalVisible.value = false
    await loadData()
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const showUpstreamJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deleteUpstream = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const upstreamId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除上游 ${record.value?.name || upstreamId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/upstreams/${upstreamId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showRouteModal = (mode: 'create' | 'edit', record?: any) => {
  routeModalMode.value = mode
  routeEditRecord.value = mode === 'edit' ? record : null
  if (mode === 'edit' && record?.value) {
    routeForm.name = record.value.name || ''
    routeForm.uri = record.value.uri || record.value.uris?.[0] || ''
    routeForm.methods = record.value.methods || []
    routeForm.hosts = record.value.hosts?.join(', ') || ''
    routeForm.priority = record.value.priority || 0
    routeForm.upstream_id = record.value.upstream_id || ''
    routeForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
    routeForm.plugin_config_ids = record.value.plugin_config_ids ? [...record.value.plugin_config_ids] : []
  } else {
    routeForm.name = ''
    routeForm.uri = ''
    routeForm.methods = []
    routeForm.hosts = ''
    routeForm.priority = 0
    routeForm.upstream_id = ''
    routeForm.pluginsJson = ''
    routeForm.plugin_config_ids = []
  }
  routeModalVisible.value = true
}

const getPluginGroupId = (pg: any) => {
  return pg.value?.id || pg.key?.split('/').pop() || pg.id
}

const isPluginGroupSelected = (edgeUuid: string) => {
  return routeForm.plugin_config_ids.indexOf(edgeUuid) !== -1
}

const togglePluginGroup = (pg: any) => {
  const edgeUuid = getPluginGroupId(pg)
  const idx = routeForm.plugin_config_ids.indexOf(edgeUuid)
  if (idx !== -1) {
    routeForm.plugin_config_ids.splice(idx, 1)
  } else {
    routeForm.plugin_config_ids.push(edgeUuid)
  }
}

const handleRouteSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')

  let plugins: any = undefined
  if (routeForm.pluginsJson) {
    try {
      plugins = JSON.parse(routeForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }

  const payload: Record<string, any> = {
    name: routeForm.name || undefined,
    uri: routeForm.uri || undefined,
    methods: routeForm.methods.length ? routeForm.methods : undefined,
    hosts: routeForm.hosts ? routeForm.hosts.split(',').map(h => h.trim()) : undefined,
    priority: routeForm.priority || 0,
    upstream_id: routeForm.upstream_id || undefined,
    plugins
  }

  if (routeForm.plugin_config_ids.length > 0) {
    payload.plugin_config_ids = routeForm.plugin_config_ids
  }

  try {
    if (routeModalMode.value === 'create') {
      await api.post(`/edge-client/nodes/${ip}/${port}/routes`, payload)
      message.success('路由创建成功')
    } else {
      const routeId = routeEditRecord.value?.value?.id
      if (!routeId) {
        message.error('无法获取路由 ID')
        return
      }
      await api.put(`/edge-client/nodes/${ip}/${port}/routes/${routeId}`, payload)
      message.success('路由更新成功')
    }
    routeModalVisible.value = false
    await loadData()
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const deleteRoute = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const routeId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除路由 ${record.value?.name || routeId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/routes/${routeId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showRouteJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const showGlobalRuleModal = (mode: 'create' | 'edit', record?: any) => {
  globalRuleModalMode.value = mode
  if (mode === 'edit' && record?.value) {
    globalRuleForm.id = record.value.id || ''
    globalRuleForm.desc = record.value.desc || ''
    globalRuleForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
  } else {
    globalRuleForm.id = ''
    globalRuleForm.desc = ''
    globalRuleForm.pluginsJson = ''
  }
  globalRuleModalVisible.value = true
}

const handleGlobalRuleSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let plugins: any = undefined
  if (globalRuleForm.pluginsJson) {
    try {
      plugins = JSON.parse(globalRuleForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }

  const payload = {
    desc: globalRuleForm.desc || undefined,
    plugins
  }

  try {
    if (globalRuleModalMode.value === 'create') {
      await api.put(`/edge-client/nodes/${ip}/${port}/global_rules/${globalRuleForm.id}`, payload)
      message.success('规则创建成功')
    } else {
      await api.patch(`/edge-client/nodes/${ip}/${port}/global_rules/${globalRuleForm.id}`, payload)
      message.success('规则更新成功')
    }
    globalRuleModalVisible.value = false
    await loadData()
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const showGlobalRuleJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const showPluginConfigModal = (mode: 'create' | 'edit', record?: any) => {
  pluginConfigModalMode.value = mode
  if (mode === 'edit' && record?.value) {
    pluginConfigForm.id = record.value.id || ''
    pluginConfigForm.desc = record.value.desc || ''
    pluginConfigForm.pluginsJson = record.value.plugins ? JSON.stringify(record.value.plugins, null, 2) : ''
    pluginConfigForm.labelsJson = record.value.labels ? JSON.stringify(record.value.labels, null, 2) : ''
    pluginConfigForm.hostsJson = record.value.hosts ? JSON.stringify(record.value.hosts, null, 2) : ''
  } else {
    pluginConfigForm.id = ''
    pluginConfigForm.desc = ''
    pluginConfigForm.pluginsJson = ''
    pluginConfigForm.labelsJson = ''
    pluginConfigForm.hostsJson = ''
  }
  pluginConfigModalVisible.value = true
}

const handlePluginConfigSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let plugins: any = undefined
  if (pluginConfigForm.pluginsJson) {
    try {
      plugins = JSON.parse(pluginConfigForm.pluginsJson)
    } catch {
      message.error('插件配置JSON格式无效')
      return
    }
  }
  let labels: any = undefined
  if (pluginConfigForm.labelsJson) {
    try {
      labels = JSON.parse(pluginConfigForm.labelsJson)
    } catch {
      message.error('Labels JSON格式无效')
      return
    }
  }
  let hosts: any = undefined
  if (pluginConfigForm.hostsJson) {
    try {
      hosts = JSON.parse(pluginConfigForm.hostsJson)
    } catch {
      message.error('Hosts JSON格式无效')
      return
    }
  }

  const payload: any = {
    desc: pluginConfigForm.desc || undefined,
    plugins
  }
  if (labels) payload.labels = labels
  if (hosts) payload.hosts = hosts

  try {
    if (pluginConfigModalMode.value === 'create') {
      await api.put(`/edge-client/nodes/${ip}/${port}/plugin_configs/${pluginConfigForm.id}`, payload)
      message.success('插件组创建成功')
    } else {
      await api.patch(`/edge-client/nodes/${ip}/${port}/plugin_configs/${pluginConfigForm.id}`, payload)
      message.success('插件组更新成功')
    }
    pluginConfigModalVisible.value = false
    await loadData()
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const showPluginConfigJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deletePluginConfig = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const configId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除插件组 ${record.value?.desc || configId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/plugin_configs/${configId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const showPluginMetadataModal = (mode: 'create' | 'edit', record?: any) => {
  pluginMetadataModalMode.value = mode
  if (mode === 'edit' && record?.key) {
    const pluginName = record.key?.split('/').pop() || ''
    pluginMetadataForm.name = pluginName
    pluginMetadataForm.configJson = record.value ? JSON.stringify(record.value, null, 2) : ''
  } else {
    pluginMetadataForm.name = ''
    pluginMetadataForm.configJson = ''
  }
  pluginMetadataModalVisible.value = true
}

const handlePluginMetadataSubmit = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  let config: any = undefined
  if (pluginMetadataForm.configJson) {
    try {
      config = JSON.parse(pluginMetadataForm.configJson)
    } catch {
      message.error('配置数据JSON格式无效')
      return
    }
  }

  try {
    if (pluginMetadataModalMode.value === 'create') {
      await api.put(`/edge-client/nodes/${ip}/${port}/plugin_metadata/${pluginMetadataForm.name}`, config || {})
      message.success('插件数据创建成功')
    } else {
      await api.put(`/edge-client/nodes/${ip}/${port}/plugin_metadata/${pluginMetadataForm.name}`, config || {})
      message.success('插件数据更新成功')
    }
    pluginMetadataModalVisible.value = false
    await loadData()
  } catch (error: any) {
    message.error('操作失败: ' + (error.response?.data?.detail || error.message))
  }
}

const showPluginMetadataJson = (record: any) => {
  jsonContent.value = JSON.stringify(record, null, 2)
  jsonModalVisible.value = true
}

const deletePluginMetadata = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const pluginName = record.key?.split('/').pop()

  Modal.confirm({
    title: '确认删除',
    content: `确定删除插件数据 ${pluginName}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/plugin_metadata/${pluginName}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

const reloadPlugins = async () => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) {
    message.warning('请先选择或输入节点')
    return
  }

  const [ip, port] = node.split(':')
  reloadingPlugins.value = true
  try {
    await api.put(`/edge-client/nodes/${ip}/${port}/plugins/reload`)
    message.success('插件重新加载成功')
  } catch (error: any) {
    message.error('重新加载失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    reloadingPlugins.value = false
  }
}

const deleteGlobalRule = (record: any) => {
  const node = inputMode.value === 'manual' ? manualNode.value.trim() : selectedNode.value
  if (!node) return

  const [ip, port] = node.split(':')
  const ruleId = record.value?.id

  Modal.confirm({
    title: '确认删除',
    content: `确定删除全局规则 ${record.value?.desc || ruleId}？此操作绕过同步流程。`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/edge-client/nodes/${ip}/${port}/global_rules/${ruleId}`)
        message.success('删除成功')
        await loadData()
      } catch (error: any) {
        message.error('删除失败: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

onMounted(async () => {
  await loadClusters()
  // Auto-select first cluster and load node list for dropdown
  if (clusters.value.length > 0) {
    selectedClusterId.value = clusters.value[0].id
    try {
      const res = await api.get(`/clusters/${clusters.value[0].id}/nodes`)
      clusterNodes.value = res.data?.items || []
      if (clusterNodes.value.length > 0) {
        selectedNode.value = clusterNodes.value[0].ip + ':' + clusterNodes.value[0].management_port
      }
    } catch (error: any) {
      message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
    }
  }
})

// Watch for cluster changes to load nodes
watch(selectedClusterId, async (newClusterId, oldClusterId) => {
  if (!newClusterId) return
  // Skip if this is the initial load (oldClusterId is undefined)
  if (oldClusterId === undefined) return
  // This fires on user manual cluster change, not on initial auto-selection
  selectedNode.value = null
  clusterNodes.value = []
  try {
    const res = await api.get(`/clusters/${newClusterId}/nodes`)
    clusterNodes.value = res.data?.items || []
    // Auto-select first node on user cluster change
    if (clusterNodes.value.length > 0) {
      selectedNode.value = clusterNodes.value[0].ip + ':' + clusterNodes.value[0].management_port
    }
  } catch (error: any) {
    message.error('加载节点列表失败: ' + (error.response?.data?.detail || error.message))
  }
})

// Watch for node changes to load data
watch(selectedNode, async (newNode) => {
  // 不再自动调用查询，用户点击「查询」按钮才加载
})
</script>

<style scoped>
.edge-client {
  padding: 16px;
}

.node-selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-config-card:hover {
  border-color: #1890ff !important;
}

.plugin-config-card.selected {
  border-color: #1890ff !important;
  background: #e6f7ff !important;
}
</style>