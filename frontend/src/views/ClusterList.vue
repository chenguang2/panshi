<template>
  <div class="cl-page">
    <PageHeader title="集群管理" description="管理所有的网关集群，查看集群资源和运行状态">
      <template #actions>
        <button class="btn btn-primary" @click="showAddModal">+ 新建集群</button>
      </template>
    </PageHeader>

    <div class="cl-header-actions">
      <div class="search-input-wrap">
        <input v-model="filterText" type="text" placeholder="搜索集群名称或显示名..." class="form-input">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;">
        <option value="__all__">全部分组</option>
          <option v-for="g in groupOptions" :key="g" :value="g === '' ? '__ung__' : g">{{ g || '未分类' }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ filteredClusters.length }} 个集群</span>
      <button v-if="hasCollapsed" class="btn btn-secondary btn-sm" @click="expandAllGroups">全部展开</button>
      <button v-if="hasExpanded" class="btn btn-secondary btn-sm" @click="collapseAllGroups">全部收起</button>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="filteredClusters.length === 0" class="cl-empty">
      <div class="cl-empty-icon">◈</div>
      <div class="cl-empty-text">暂无集群</div>
    </div>
    <div v-else>
      <div v-for="group in groupedClusters" :key="group.name" class="cl-group">
        <div class="cl-group-header" @click="toggleGroup(group.name)">
          <span class="cl-group-arrow">{{ expandedGroups[group.name] ? '▾' : '▸' }}</span>
          <span class="cl-group-name">{{ group.name || '未分类' }}</span>
          <span class="cl-group-count">({{ group.clusters.length }})</span>
        </div>
        <div v-show="expandedGroups[group.name]" class="cl-grid">
          <div v-for="c in group.clusters" :key="c.id" class="cl-card">
            <div class="cl-card-topbar">{{ c.group_name || '未分类' }}</div>
            <div class="cl-card-header">
              <div class="cl-card-info">
                <div class="cl-card-name">{{ c.display_name || c.name }}</div>
                <div v-if="c.description" class="cl-card-desc">{{ c.description }}</div>
              </div>
              <div class="cl-card-meta">
                <span v-if="c.status === 1" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
                <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
              </div>
            </div>
            <div class="cl-card-stats">
              <router-link :to="{ path: '/nodes', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.healthy_node_count }}/{{ c.node_count }}</div><div class="cl-stat-label">节点</div></router-link>
              <router-link :to="{ path: '/upstreams', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.upstream_count }}</div><div class="cl-stat-label">上游</div></router-link>
              <router-link :to="{ path: '/routes', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.route_count }}</div><div class="cl-stat-label">路由</div></router-link>
              <router-link :to="{ path: '/plugin-configs', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.plugin_config_count }}</div><div class="cl-stat-label">插件组</div></router-link>
              <router-link :to="{ path: '/global-rules', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.global_rule_count }}</div><div class="cl-stat-label">全局规则</div></router-link>
              <router-link :to="{ path: '/plugin-metadata', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.plugin_metadata_count }}</div><div class="cl-stat-label">插件元数据</div></router-link>
              <router-link :to="{ path: '/static-resources', query: { cluster_id: c.id } }" class="cl-stat-cell cl-stat-link"><div class="cl-stat-value">{{ c.static_resource_count }}</div><div class="cl-stat-label">静态资源</div></router-link>
            </div>
            <div v-if="c.nodes && c.nodes.length > 0" class="cl-card-nodes">
              <span v-for="n in (c.nodes.length <= 3 ? c.nodes : c.nodes.slice(0, 3))" :key="n.id" class="cl-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
                <span class="status-dot" :class="n.status === 1 ? 'online' : 'offline'"></span>
                {{ n.ip }}:{{ n.service_port }}
              </span>
              <span v-if="c.nodes.length > 3" class="node-more">...还有 {{ c.nodes.length - 3 }} 个</span>
            </div>
            <div class="cl-card-actions">
              <button class="btn btn-ghost btn-sm cl-action-btn" @click="viewCluster(c)">详情</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" @click="editCluster(c)">编辑</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" @click="testCluster(c)">连接测试</button>
              <button class="btn btn-ghost btn-sm cl-action-btn" style="color:var(--danger);" @click="deleteCluster(c)">删除</button>
              <span style="flex:1"></span>
              <span class="cl-card-id">#{{ c.id }}</span>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <div class="modal-overlay" :style="{ display: detailVisible ? 'flex' : 'none' }" @click.self="detailVisible = false">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>集群详情 — {{ detailCluster?.display_name || '' }}</h2>
          <button class="modal-close" @click="detailVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="detailCluster">
            <table class="detail-table">
              <tr><td class="dt-label">集群名称</td><td class="dt-value">{{ detailCluster.name }}</td></tr>
              <tr><td class="dt-label">显示名称</td><td class="dt-value">{{ detailCluster.display_name || '-' }}</td></tr>
              <tr><td class="dt-label">分组</td><td class="dt-value">{{ detailCluster.group_name || '-' }}</td></tr>
              <tr><td class="dt-label">描述</td><td class="dt-value">{{ detailCluster.description || '-' }}</td></tr>
              <tr><td class="dt-label">状态</td>
                <td class="dt-value">
                  <span v-if="detailCluster.status === 1" class="badge badge-success"><span class="status-dot online"></span>运行中</span>
                  <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
                </td>
              </tr>
              <tr><td class="dt-label">Admin Key</td><td class="dt-value">{{ detailCluster.admin_key || '-' }}</td></tr>
              <tr><td class="dt-label">创建时间</td><td class="dt-value">{{ detailCluster.created_at ? new Date(detailCluster.created_at).toLocaleString('zh-CN') : '-' }}</td></tr>
            </table>
            <h3 class="detail-section-title">资源统计</h3>
            <div class="detail-stats-grid">
              <div class="detail-stat-card"><div class="detail-stat-label">节点</div><div class="detail-stat-value">{{ detailCluster.healthy_node_count }}/{{ detailCluster.node_count }} <span style="font-weight:400;font-size:12px;color:var(--muted)">(健康)</span></div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">上游</div><div class="detail-stat-value">{{ detailCluster.upstream_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">路由</div><div class="detail-stat-value">{{ detailCluster.route_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">插件配置</div><div class="detail-stat-value">{{ detailCluster.plugin_config_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">全局规则</div><div class="detail-stat-value">{{ detailCluster.global_rule_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">插件元数据</div><div class="detail-stat-value">{{ detailCluster.plugin_metadata_count }}</div></div>
              <div class="detail-stat-card"><div class="detail-stat-label">静态资源</div><div class="detail-stat-value">{{ detailCluster.static_resource_count }}</div></div>
            </div>
            <h3 v-if="detailCluster.nodes && detailCluster.nodes.length > 0" class="detail-section-title">节点列表</h3>
            <div v-if="detailCluster.nodes && detailCluster.nodes.length > 0" class="detail-nodes">
              <span v-for="n in detailCluster.nodes" :key="n.id" class="cl-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
                <span class="status-dot" :class="n.status === 1 ? 'online' : 'offline'"></span>
                {{ n.ip }}:{{ n.service_port }}
              </span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="detailVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Test Connection Modal -->
    <div class="modal-overlay" :style="{ display: testVisible ? 'flex' : 'none' }" @click.self="resetTest">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>测试连接</h2>
          <button class="modal-close" @click="resetTest">&times;</button>
        </div>
        <div v-if="!testRunning && testLogs.length === 0" class="modal-body">
          <div style="margin-bottom:12px;font-size:13px;color:var(--muted);">将要对下列节点进行 TCP 端口连接测试：</div>
          <div class="test-nodes-select">
            <div v-for="n in testNodes" :key="n.id" class="test-node-row">
              <span class="node-addr">{{ n.ip }}:{{ n.management_port }}</span>
              <span class="badge" :class="n.status === 1 ? 'badge-success' : 'badge-neutral'">{{ n.status === 1 ? '在线' : '离线' }}</span>
            </div>
          </div>
          <div v-if="testNodes.length === 0" style="text-align:center;padding:20px 0;color:var(--muted)">该集群没有节点</div>
        </div>
        <div v-else class="modal-body">
          <div class="test-progress">
            <div v-for="(log, i) in testLogs" :key="i" class="test-log-row" :class="log.status">
              <span v-if="log.status === 'pending'" class="log-spinner">⏳</span>
              <span v-else-if="log.status === 'success'" class="log-icon">✓</span>
              <span v-else-if="log.status === 'error'" class="log-icon log-error">✗</span>
              <span class="log-msg">{{ log.msg }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <template v-if="!testRunning && testLogs.length === 0">
            <button class="btn btn-secondary" @click="resetTest">取消</button>
            <button class="btn btn-primary" :disabled="testNodes.length === 0" @click="runTest">开始测试</button>
          </template>
          <button v-else class="btn btn-secondary" @click="resetTest">关闭</button>
        </div>
      </div>
    </div>

    <ClusterFormModal :visible="modalVisible" :editing-cluster="editingCluster" :group-options="groupOptions" @close="modalVisible = false; editingCluster = null" @saved="modalVisible = false; editingCluster = null; loadClusters()" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { message, Modal } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import ClusterFormModal from '@/components/ClusterFormModal.vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import type { Cluster } from '@/types'

const authStore = useAuthStore()

const clusters = ref<Cluster[]>([])
const loading = ref(false)
const filterText = ref('')
const groupFilter = ref('__all__')
const expandedGroups = ref<Record<string, boolean>>({})

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return Array.from(names).sort((a, b) => {
    if (!a) return 1; if (!b) return -1; return a.localeCompare(b)
  })
})

const filteredClusters = computed(() => {
  let list = clusters.value
  const ft = filterText.value?.toLowerCase()
  if (ft) list = list.filter(c => c.name.toLowerCase().includes(ft) || (c.display_name || '').toLowerCase().includes(ft))
  if (groupFilter.value === '__ung__') {
    list = list.filter(c => !c.group_name)
  } else if (groupFilter.value !== '__all__') {
    list = list.filter(c => c.group_name === groupFilter.value)
  }
  return list
})

const groupedClusters = computed(() => {
  const groups: { name: string; clusters: Cluster[] }[] = []
  const map = new Map<string, Cluster[]>()
  for (const c of filteredClusters.value) {
    const key = c.group_name || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (!a) return 1; if (!b) return -1; return a.localeCompare(b)
  })
  for (const key of keys) groups.push({ name: key, clusters: map.get(key)! })
  return groups
})

const hasCollapsed = computed(() => Object.values(expandedGroups.value).some(v => !v))
const hasExpanded = computed(() => Object.values(expandedGroups.value).some(v => v))

function toggleGroup(name: string) { expandedGroups.value[name] = !expandedGroups.value[name] }
function expandAllGroups() { for (const k of Object.keys(expandedGroups.value)) expandedGroups.value[k] = true }
function collapseAllGroups() { for (const k of Object.keys(expandedGroups.value)) expandedGroups.value[k] = false }

async function loadClusters() {
  loading.value = true
  try {
    const endpoint = authStore.user?.role === 'admin' ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: 1, page_size: 200 } })
    clusters.value = res.data.items || []
    for (const c of clusters.value) {
      const key = c.group_name || ''
      if (!(key in expandedGroups.value)) expandedGroups.value[key] = true
    }
    // 数据加载完成后恢复之前保存的滚动位置
    const savedScroll = sessionStorage.getItem('panshi_scroll_/clusters')
    if (savedScroll) {
      sessionStorage.removeItem('panshi_scroll_/clusters')
      const { x, y } = JSON.parse(savedScroll)
      // double rAF: 等待 DOM 更新后再滚动
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(x, y)))
    }
  } catch (e: any) {
    message.error('加载集群列表失败: ' + (e.response?.data?.detail || e.message))
  } finally { loading.value = false }
}

// Detail
const detailVisible = ref(false)
const detailCluster = ref<Cluster | null>(null)
function viewCluster(c: Cluster) { detailCluster.value = c; detailVisible.value = true }

// Test
const testVisible = ref(false)
const testRunning = ref(false)
const testNodes = ref<{ id: number; ip: string; service_port: number; management_port: number; status: number }[]>([])
const testLogs = ref<{ status: 'pending' | 'success' | 'error'; msg: string }[]>([])
let testingCluster: Cluster | null = null

function resetTest() {
  testVisible.value = false; testRunning.value = false
  testNodes.value = []; testLogs.value = []; testingCluster = null
}

async function testCluster(c: Cluster) {
  testingCluster = c
  testLogs.value = []
  testRunning.value = false
  try {
    const res = await api.get(`/clusters/${c.id}/nodes`, { params: { page: 1, page_size: 100 } })
    testNodes.value = (res.data.items || []).map((n: any) => ({
      id: n.id, ip: n.ip, service_port: n.service_port, management_port: n.management_port, status: n.status
    }))
  } catch {
    testNodes.value = []
  }
  testVisible.value = true
}

async function runTest() {
  if (!testingCluster) return
  testRunning.value = true
  testLogs.value = []
  const nodeIds = testNodes.value.filter(n => n.status === 1).map(n => n.id)
  if (nodeIds.length === 0) {
    testLogs.value.push({ status: 'error', msg: '没有在线节点可测试' })
    testRunning.value = false
    return
  }
  const startTime = Date.now()
  for (const n of testNodes.value) {
    testLogs.value.push({ status: 'pending', msg: `${n.ip}:${n.management_port} 测试中...` })
  }
  try {
    const res = await api.post(`/clusters/${testingCluster.id}/test`, { node_ids: nodeIds })
    const results: any[] = res.data.results || []
    let successCount = 0
    let failCount = 0
    for (const r of results) {
      const idx = testNodes.value.findIndex(n => n.id === r.node_id)
      if (idx >= 0) {
        const label = `${r.ip}:${r.port}`
        if (r.ok) {
          successCount++
          testLogs.value[idx] = { status: 'success', msg: `${label} 连接成功` }
        } else {
          failCount++
          testLogs.value[idx] = { status: 'error', msg: `${label} 连接失败 — ${r.msg}` }
        }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    testLogs.value.push({ status: 'success', msg: `测试完成 — 共 ${results.length} 个节点，成功 ${successCount}，失败 ${failCount}，耗时 ${elapsed}s` })
  } catch (e: any) {
    for (let i = 0; i < testLogs.value.length; i++) {
      if (testLogs.value[i].status === 'pending') {
        const n = testNodes.value[i]
        testLogs.value[i] = { status: 'error', msg: `${n.ip}:${n.management_port} 测试异常 — ${e.response?.data?.detail || e.message}` }
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    testLogs.value.push({ status: 'error', msg: `测试异常终止，耗时 ${elapsed}s` })
  }
  testRunning.value = false
}

// Add/Edit
const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)

function showAddModal() {
  editingCluster.value = null; modalVisible.value = true
}
function editCluster(c: Cluster) {
  editingCluster.value = c; modalVisible.value = true
}

function deleteCluster(c: Cluster) {
  const clusterName = c.display_name || c.name
  api.get(`/clusters/${c.id}/nodes`, { params: { page: 1, page_size: 100 } }).then(nodesRes => {
    const availableNodes = nodesRes.data.items || []
    api.get(`/clusters/${c.id}/stats`).then(statsRes => {
      showDeleteConfirm({
        title: `确定要删除集群 "${clusterName}" 吗？`, apiEndpoint: `/clusters/${c.id}`,
        showResourceStats: true, stats: statsRes.data, nodes: availableNodes,
        onOk: async (deleteDb, deleteEdge, nodeIds) => {
          let nameConfirmed = false
          const nameModal = Modal.confirm({
            title: '请输入集群名称确认删除', width: 400,
            content: h('div', { style: 'font-size:13px' }, [
              h('div', { style: 'margin-bottom:8px;color:#666' }, `请输入集群名称 "${clusterName}" 以确认删除：`),
              h('input', {
                type: 'text', placeholder: '请输入集群名称',
                onInput: (e: any) => {
                  nameConfirmed = (e.target.value || '').trim() === (clusterName || '').trim()
                  if (nameModal) nameModal.update({ okButtonProps: { disabled: !nameConfirmed } })
                },
                style: 'width:100%;padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;outline:none;box-sizing:border-box;font-size:14px',
              }),
            ]),
            okText: '确认删除', okButtonProps: { disabled: true } as any, cancelText: '取消',
            onOk: async () => {
              if (!nameConfirmed) return false
              await executeDeleteWithProgress({
                title: `删除集群: ${clusterName}`, apiEndpoint: `/clusters/${c.id}`,
                cluster: c, deleteDb, deleteEdge, nodeIds, refreshFn: () => loadClusters(),
              })
            },
          })
        },
      })
    }).catch(() => showDeleteConfirm({ title: `确定要删除集群 "${clusterName}" 吗？`, apiEndpoint: `/clusters/${c.id}`, showResourceStats: false, stats: {}, nodes: [], onOk: async () => loadClusters() }))
  }).catch(() => showDeleteConfirm({ title: `确定要删除集群 "${clusterName}" 吗？`, apiEndpoint: `/clusters/${c.id}`, showResourceStats: false, stats: {}, nodes: [], onOk: async () => loadClusters() }))
}

onMounted(() => { loadClusters() })
</script>

<style scoped>
.cl-page { padding: 20px 24px; }
.cl-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.cl-header-actions .search-input-wrap { width: 200px; flex-shrink: 0; }
.cl-header-actions :deep(.form-input) { width: 100%; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.cl-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.cl-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.cl-empty-text { font-size: 14px; color: var(--muted); }

.cl-group { margin-bottom: 12px; }
.cl-group-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: pointer; border-radius: var(--radius-md); user-select: none; }
.cl-group-header:hover { background: oklch(100% 0 0 / 4%); }
.cl-group-arrow { font-size: 12px; color: var(--muted); width: 14px; flex-shrink: 0; }
.cl-group-name { font-size: 14px; font-weight: 600; color: var(--fg); }
.cl-group-count { font-size: 12px; color: var(--muted); }

.cl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }

.cl-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.cl-card:hover { box-shadow: var(--shadow-md); }

.cl-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); }

.cl-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.cl-card-info { flex: 1; min-width: 0; }
.cl-card-name { font-size: 15px; font-weight: 600; color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cl-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }

.cl-card-stats { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; padding: 8px 16px; }
.cl-stat-cell { text-align: center; min-width: 0; }
.cl-stat-value { font-family: var(--font-mono); font-size: 16px; font-weight: 700; color: var(--accent); line-height: 1.3; }
.cl-stat-link { text-decoration: none; display: flex; flex-direction: column; align-items: center; gap: 1px; border-radius: var(--radius-md); padding: 4px 2px; transition: background 0.15s; cursor: pointer; }
.cl-stat-link:hover { background: oklch(100% 0 0 / 6%); }
.cl-stat-link:hover .cl-stat-value { color: var(--accent); }
.cl-stat-link:hover .cl-stat-label { color: var(--accent); text-decoration: underline; }
.cl-stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; margin-top: 1px; }
.cl-card-id { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }

.cl-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.cl-action-btn { background: none !important; background-color: transparent !important; }
.cl-action-btn:hover { background: var(--bg) !important; }

/* Node tags */
.cl-card-nodes { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 8px; }
.cl-node-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: var(--bg); border: 1px solid var(--border); font-family: var(--font-mono); }
.cl-node-tag.online { border-color: oklch(55% 0.15 145 / 25%); }
.cl-node-tag.offline { border-color: oklch(55% 0.18 28 / 25%); }
.node-more { font-size: 11px; color: var(--p-text-tertiary); padding: 2px 4px; }

.test-nodes-select { max-height: 320px; overflow-y: auto; }
.test-node-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px; border-bottom: 1px solid var(--border); }
.test-node-row:last-child { border-bottom: none; }
.node-addr { font-family: var(--font-mono); font-size: 14px; }
.test-progress { max-height: 400px; overflow-y: auto; }
.test-log-row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; font-size: 13px; border-bottom: 1px solid var(--border); }
.test-log-row:last-child { border-bottom: none; }
.test-log-row.success { color: var(--success); }
.test-log-row.error { color: var(--danger); }
.log-spinner { width: 16px; text-align: center; }
.log-icon { font-weight: 700; width: 16px; text-align: center; }
.log-icon.log-error { color: var(--danger); }
.log-msg { font-family: var(--font-mono); font-size: 12px; }

.detail-stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.detail-nodes { display: flex; flex-wrap: wrap; gap: 6px; }
.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-table td { padding: 6px 0; border-bottom: 1px solid var(--border); }
.dt-label { color: var(--muted); font-weight: 500; width: 100px; vertical-align: top; }
.dt-value { color: var(--fg); word-break: break-all; }
.detail-section-title { font-size: 14px; font-weight: 600; margin: 16px 0 10px; color: var(--fg); }
.detail-stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; text-align: center; }
.detail-stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.detail-stat-value { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--fg); margin-top: 2px; }

.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }

/* Modal overlay (matching NodeList add node modal style) */
.modal-overlay {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 600px; max-height: 80vh;
  display: flex; flex-direction: column;
}
.modal-wide { max-width: 700px; }

@media (max-width: 1200px) { .cl-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .cl-grid { grid-template-columns: 1fr; }
  .cl-header-actions { flex-direction: column; align-items: stretch; }
}
</style>
