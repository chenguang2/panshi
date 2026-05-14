<template>
  <div class="config-diff-page">
    <div class="page-header">
      <a-breadcrumb>
        <a-breadcrumb-item><a @click="$router.push('/clusters')">集群管理</a></a-breadcrumb-item>
        <a-breadcrumb-item>配置对比: {{ nodeAddr }}</a-breadcrumb-item>
      </a-breadcrumb>

      <div class="header-actions">
        <a-select v-model:value="selectedNodeId" style="width: 300px" @change="loadDiff">
          <a-select-option v-for="n in nodes" :key="n.id" :value="n.id">
            {{ n.ip }}:{{ n.management_port }}
          </a-select-option>
        </a-select>
        <a-button type="primary" @click="loadDiff" :loading="loading">重新对比</a-button>
      </div>
    </div>

    <a-spin :spinning="loading">
      <!-- 概览统计 -->
      <div v-if="summary" class="summary-bar">
        <a-statistic title="总计" :value="summary.total" />
        <a-statistic title="✅ 一致" :value="summary.match" :value-style="{ color: '#52c41a' }" />
        <a-statistic title="❌ 差异" :value="summary.mismatch" :value-style="{ color: '#ff4d4f' }" />
        <a-statistic title="➕ 仅数据库" :value="summary.only_in_db" :value-style="{ color: '#faad14' }" />
        <a-statistic title="➖ 仅Edge" :value="summary.only_in_edge" :value-style="{ color: '#1890ff' }" />
      </div>

      <!-- 分组对比 -->
      <div v-for="group in groups" :key="group.type" class="diff-group">
        <div class="group-header" @click="toggleGroup(group.type)">
          <span v-if="collapsedGroups[group.type]" >▶</span>
          <span v-else>▼</span>
          <span class="group-title">{{ group.label }}</span>
          <span class="group-count">({{ group.items.length }})</span>
          <span class="group-stats">
            <span v-if="groupStats(group).match" class="stat-match">{{ groupStats(group).match }} 一致</span>
            <span v-if="groupStats(group).mismatch" class="stat-diff">{{ groupStats(group).mismatch }} 差异</span>
            <span v-if="groupStats(group).only_in_db" class="stat-db-only">{{ groupStats(group).only_in_db }} 仅DB</span>
            <span v-if="groupStats(group).only_in_edge" class="stat-edge-only">{{ groupStats(group).only_in_edge }} 仅Edge</span>
          </span>
        </div>

        <div v-if="!collapsedGroups[group.type]" class="group-body">
          <!-- 双栏表头 -->
          <div class="diff-row-header">
            <span class="col-status">状态</span>
            <span class="col-name">名称</span>
            <span class="col-db">数据库</span>
            <span class="col-edge">Edge 节点</span>
            <span class="col-action"></span>
          </div>

          <div
            v-for="item in group.items"
            :key="item.id"
            class="diff-row"
            :class="{ 'row-mismatch': item.status === 'mismatch', 'row-only-db': item.status === 'only_in_db', 'row-only-edge': item.status === 'only_in_edge' }"
            @click="item.status === 'mismatch' && toggleExpand(item)"
          >
            <span class="col-status">
              <span v-if="item.status === 'match'" style="color:#52c41a">✅</span>
              <span v-else-if="item.status === 'mismatch'" style="color:#ff4d4f">❌</span>
              <span v-else-if="item.status === 'only_in_db'" style="color:#faad14">➕</span>
              <span v-else style="color:#1890ff">➖</span>
            </span>
            <span class="col-name">{{ item.name }}</span>
            <span class="col-db">{{ item.status === 'only_in_edge' ? '—' : '已配置' }}</span>
            <span class="col-edge">{{ item.status === 'only_in_db' ? '—' : '已配置' }}</span>
            <span class="col-action">
              <a v-if="item.status === 'mismatch'" style="font-size:12px">{{ expandedItems[item.id] ? '收起' : '查看差异' }}</a>
            </span>
          </div>

          <!-- 展开的字段级对比 -->
          <div v-for="item in expandedItemsList" :key="'exp-' + item.id" class="diff-fields">
            <div class="fields-header">字段级对比</div>
            <div class="fields-row" v-for="f in item.fields" :key="f.name">
              <span class="field-name">{{ fieldLabel(item.groupType, f.name) }}</span>
              <span class="field-db">
                <pre>{{ f.db }}</pre>
              </span>
              <span class="field-edge">
                <pre>{{ f.edge }}</pre>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="errorMsg" class="error-banner">
        <a-alert type="error" :message="errorMsg" banner closable @close="errorMsg = ''" />
      </div>

      <div v-if="!loading && !errorMsg && summary && summary.total === 0" class="empty-state">
        <a-empty description="该集群下没有任何资源配置" />
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'

const route = useRoute()
const clusterId = Number(route.params.clusterId)
const nodeId = Number(route.params.nodeId)

const loading = ref(false)
const errorMsg = ref('')
const nodeAddr = ref('')
const summary = ref<any>(null)
const groups = ref<any[]>([])
const nodes = ref<any[]>([])
const selectedNodeId = ref(nodeId)
const collapsedGroups = ref<Record<string, boolean>>({})
const expandedItems = ref<Record<string, boolean>>({})

const expandedItemsList = computed(() => {
  const result: any[] = []
  for (const g of groups.value) {
    for (const it of g.items) {
      if (expandedItems.value[it.id] && it.fields?.length) {
        result.push({ ...it, groupType: g.type })
      }
    }
  }
  return result
})

const fieldLabel = (groupType: string, field: string): string => {
  const labels: Record<string, Record<string, string>> = {
    upstreams: {
      load_balance: '负载均衡', scheme: '协议', pass_host: 'Host 传递',
      retries: '重试次数', hash_on: 'Hash 策略', key: 'Hash Key',
      checks: '健康检查', timeout: '超时配置', keepalive_pool: '连接池',
      targets: '目标节点', uri: 'URI',
    },
    routes: {
      uri: 'URI', methods: '方法', hosts: '域名', priority: '优先级', status: '状态',
    },
    plugin_configs: { plugins: '插件配置' },
    global_rules: { plugins: '插件配置' },
    plugin_metadata: { config: '配置数据' },
  }
  return labels[groupType]?.[field] || field
}

const groupStats = (group: any) => {
  const s = { match: 0, mismatch: 0, only_in_db: 0, only_in_edge: 0 }
  for (const it of group.items) {
    if (s[it.status] !== undefined) s[it.status]++
  }
  return s
}

const toggleGroup = (type: string) => {
  collapsedGroups.value[type] = !collapsedGroups.value[type]
}

const toggleExpand = (item: any) => {
  if (item.fields?.length) {
    expandedItems.value[item.id] = !expandedItems.value[item.id]
  }
}

const loadDiff = async () => {
  loading.value = true
  try {
    const [diffRes, nodesRes] = await Promise.all([
      api.get(`/clusters/${clusterId}/nodes/${selectedNodeId.value}/diff`),
      api.get(`/clusters/${clusterId}/nodes`),
    ])
    const data = diffRes.data
    nodeAddr.value = data.node
    summary.value = data.summary
    groups.value = data.groups || []

    nodes.value = nodesRes.data.items || []
    expandedItems.value = {}
  } catch (e: any) {
    errorMsg.value = e.response?.data?.detail || e.message || '加载对比数据失败，请检查 Edge 节点连接'
  } finally {
    loading.value = false
  }
}

onMounted(loadDiff)
</script>

<style scoped>
.config-diff-page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.summary-bar {
  display: flex; gap: 24px; padding: 16px; background: #fafafa;
  border: 1px solid #e8e8e8; border-radius: 8px; margin-bottom: 16px;
}
.summary-bar .ant-statistic { flex: 1; text-align: center; }

.diff-group {
  border: 1px solid #e8e8e8; border-radius: 8px; margin-bottom: 12px; overflow: hidden;
}
.group-header {
  display: flex; align-items: center; gap: 8px; padding: 12px 16px;
  background: #fafafa; cursor: pointer; font-weight: 600; user-select: none;
}
.group-header:hover { background: #f0f0f0; }
.group-title { font-size: 15px; }
.group-count { color: #999; font-size: 13px; }
.group-stats { margin-left: auto; font-size: 12px; display: flex; gap: 8px; }
.stat-match { color: #52c41a; }
.stat-diff { color: #ff4d4f; }
.stat-db-only { color: #faad14; }
.stat-edge-only { color: #1890ff; }

.diff-row-header {
  display: flex; padding: 8px 16px; background: #f5f5f5;
  font-size: 12px; color: #999; font-weight: 500; border-bottom: 1px solid #e8e8e8;
}
.diff-row {
  display: flex; padding: 10px 16px; border-bottom: 1px solid #f0f0f0;
  font-size: 13px; cursor: default; transition: background 0.15s;
}
.diff-row:hover { background: #fafafa; }
.diff-row.row-mismatch { background: #fff2f0; }
.diff-row.row-mismatch:hover { background: #ffd8d2; }
.diff-row.row-only-db { background: #fffbe6; }
.diff-row.row-only-edge { background: #e6f7ff; }

.col-status { width: 40px; text-align: center; }
.col-name { flex: 2; font-weight: 500; }
.col-db { flex: 2; color: #666; }
.col-edge { flex: 2; color: #666; }
.col-action { width: 80px; text-align: right; }

.diff-fields {
  background: #fafafa; border-bottom: 1px solid #e8e8e8; padding: 0 16px 12px;
}
.fields-header {
  font-size: 11px; color: #999; text-transform: uppercase; padding: 8px 0 4px;
}
.fields-row {
  display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #eee; font-size: 12px;
}
.fields-row:last-child { border-bottom: none; }
.field-name { width: 100px; color: #666; flex-shrink: 0; }
.field-db { flex: 1; }
.field-edge { flex: 1; }
.field-db pre, .field-edge pre {
  margin: 0; font-size: 11px; background: #fff; padding: 4px 8px;
  border-radius: 3px; border: 1px solid #e8e8e8; white-space: pre-wrap; max-height: 200px; overflow: auto;
}

.empty-state { text-align: center; padding: 80px 0; }
.error-banner { margin-bottom: 16px; }
</style>
