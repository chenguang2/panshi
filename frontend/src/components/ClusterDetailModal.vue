<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal">
      <div class="modal-header">
        <h2>集群详情 — {{ cluster?.display_name || cluster?.name || '' }}</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="cluster">
          <table class="detail-table">
            <tbody>
              <tr>
                <td class="dt-label">集群名称</td>
                <td class="dt-value">{{ cluster.name }}</td>
              </tr>
              <tr>
                <td class="dt-label">显示名称</td>
                <td class="dt-value">{{ cluster.display_name || '-' }}</td>
              </tr>
              <tr>
                <td class="dt-label">分组</td>
                <td class="dt-value">{{ cluster.group_name || '未分组' }}</td>
              </tr>
              <tr>
                <td class="dt-label">描述</td>
                <td class="dt-value">{{ cluster.description || '-' }}</td>
              </tr>
              <tr>
                <td class="dt-label">状态</td>
                <td class="dt-value">
                  <span v-if="cluster.status === 1" class="badge badge-success"
                    ><span class="status-dot online"></span>已启用</span
                  >
                  <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
                </td>
              </tr>
              <tr>
                <td class="dt-label">所属区域</td>
                <td class="dt-value">{{ cluster.region_code || '直连' }}</td>
              </tr>
              <tr>
                <td class="dt-label">发布状态</td>
                <td class="dt-value" :title="VERSION_TOOLTIP">
                  {{ cluster.current_version ? `配置 v${cluster.current_version}` : '未发布' }}
                </td>
              </tr>
              <tr>
                <td class="dt-label">Admin Key</td>
                <td class="dt-value cdm-admin-key">
                  <template v-if="cluster.admin_key">
                    <span class="cdm-key-text">{{ keyRevealed ? cluster.admin_key : '••••••••' }}</span>
                    <button class="cdm-key-toggle" @click="toggleKey">{{ keyRevealed ? '隐藏' : '显示' }}</button>
                  </template>
                  <template v-else>-</template>
                </td>
              </tr>
              <tr>
                <td class="dt-label">创建时间</td>
                <td class="dt-value">{{ formatDateTime(cluster.created_at) }}</td>
              </tr>
            </tbody>
          </table>
          <h3 class="detail-section-title">资源统计</h3>
          <div class="detail-stats-grid">
            <div class="detail-stat-card">
              <div class="detail-stat-label">节点</div>
              <div class="detail-stat-value">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">上游</div>
              <div class="detail-stat-value">{{ cluster.upstream_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">路由</div>
              <div class="detail-stat-value">{{ cluster.route_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">插件组</div>
              <div class="detail-stat-value">{{ cluster.plugin_config_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">全局规则</div>
              <div class="detail-stat-value">{{ cluster.global_rule_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">插件元数据</div>
              <div class="detail-stat-value">{{ cluster.plugin_metadata_count }}</div>
            </div>
            <div class="detail-stat-card">
              <div class="detail-stat-label">静态资源</div>
              <div class="detail-stat-value">{{ cluster.static_resource_count }}</div>
            </div>
          </div>
          <template v-if="nodes.length > 0">
            <h3 class="detail-section-title">节点列表</h3>
            <div class="cdm-nodes">
              <span v-for="n in nodes" :key="n.id" class="cdm-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
                <span class="status-dot" :class="n.status === 1 ? 'online' : 'offline'"></span>
                {{ n.ip }}:{{ n.service_port }}
              </span>
            </div>
          </template>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 集群详情弹窗共享组件（cluster-ux-close-loop 3.6）：ClusterList / CentralList 唯一实现。
// 基本信息含「所属区域」（无区域显示「直连」）与「发布状态」（与 ClusterCard 版本微标同口径）；
// Admin Key 默认脱敏；节点列表由组件自取（GET /clusters/{id}/nodes，失败静默隐藏该节）。
import { ref, watch } from 'vue'
import api from '@/api'
import type { Cluster, Node } from '@/types'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  cluster: Cluster | null
  visible: boolean
}>()

const emit = defineEmits<{ close: [] }>()

/** 与 ClusterCard 发布状态微标同口径的 tooltip（cluster-ux-close-loop 3.2） */
const VERSION_TOOLTIP = '集群配置（edge.env）版本；子资源发布不推进此版本'

const keyRevealed = ref(false)
const nodes = ref<Node[]>([])

function toggleKey() {
  keyRevealed.value = !keyRevealed.value
}

watch(
  () => [props.visible, props.cluster?.id] as const,
  ([visible, id]) => {
    keyRevealed.value = false
    nodes.value = []
    if (!visible || !id) return
    api
      .get(`/clusters/${id}/nodes`, { params: { page: 1, page_size: 500 } })
      .then((res) => {
        nodes.value = res.data?.items || []
      })
      .catch(() => {
        nodes.value = []
      })
  },
  { immediate: true },
)
</script>

<style scoped>
/* 详情表格与统计格样式唯一收敛点（两页本地副本随 3.6 组件化移除） */
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.detail-table td {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.dt-label {
  color: var(--muted);
  font-weight: 500;
  width: 100px;
  vertical-align: top;
}
.dt-value {
  color: var(--fg);
  word-break: break-all;
}
.detail-section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 16px 0 10px;
  color: var(--fg);
}
.detail-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
.detail-stat-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
}
.detail-stat-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.detail-stat-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
  color: var(--fg);
  margin-top: 2px;
}
.cdm-admin-key {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cdm-key-text {
  font-family: var(--font-mono);
}
.cdm-key-toggle {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--muted);
  border-radius: var(--radius-sm);
  font-size: 12px;
  padding: 1px 8px;
  cursor: pointer;
}
.cdm-key-toggle:hover {
  color: var(--fg);
}
.cdm-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.cdm-node-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.cdm-node-tag.online {
  border-color: oklch(55% 0.15 145 / 25%);
}
.cdm-node-tag.offline {
  border-color: oklch(55% 0.18 28 / 25%);
}
</style>
