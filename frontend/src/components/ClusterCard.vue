<template>
  <div class="cl-card">
    <div class="cl-card-topbar">
      <slot name="topbar">
        <span>{{ cluster.group_name || '未分组' }}</span>
      </slot>
    </div>
    <div class="cl-card-header">
      <div class="cl-card-info">
        <div class="cl-card-name" :title="nameTitle">{{ cluster.display_name || cluster.name }}</div>
        <div v-if="subtitle" class="cl-card-desc">{{ subtitle }}</div>
      </div>
      <div class="cl-card-meta">
        <span v-if="cluster.status === 1" class="badge badge-success"
          ><span class="status-dot online"></span>已启用</span
        >
        <span v-else class="badge badge-danger"><span class="status-dot offline"></span>已禁用</span>
        <span
          class="cl-version-chip"
          :class="versionChip.published ? 'is-published' : 'is-unpublished'"
          :title="VERSION_CHIP_TOOLTIP"
          >{{ versionChip.text }}</span
        >
        <span v-if="routeBadge" class="badge cl-route-badge" :class="routeBadge.cls">{{ routeBadge.label }}</span>
      </div>
    </div>
    <div v-if="statClick" class="cl-card-stats">
      <div
        class="cl-stat-cell cl-stat-link"
        :class="healthCls"
        title="健康节点 / 节点总数"
        @click="onStatClick('nodes')"
      >
        <div class="cl-stat-value">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div>
        <div class="cl-stat-label">节点</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('upstreams')">
        <div class="cl-stat-value">{{ cluster.upstream_count }}</div>
        <div class="cl-stat-label">上游</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('routes')">
        <div class="cl-stat-value">{{ cluster.route_count }}</div>
        <div class="cl-stat-label">路由</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('pluginConfigs')">
        <div class="cl-stat-value">{{ cluster.plugin_config_count }}</div>
        <div class="cl-stat-label">插件组</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('globalRules')">
        <div class="cl-stat-value">{{ cluster.global_rule_count }}</div>
        <div class="cl-stat-label">全局规则</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('pluginMetadata')">
        <div class="cl-stat-value">{{ cluster.plugin_metadata_count }}</div>
        <div class="cl-stat-label">插件元数据</div>
      </div>
      <div class="cl-stat-cell cl-stat-link" @click="onStatClick('staticResources')">
        <div class="cl-stat-value">{{ cluster.static_resource_count }}</div>
        <div class="cl-stat-label">静态资源</div>
      </div>
    </div>
    <div v-else class="cl-card-stats">
      <router-link
        :to="{ path: '/nodes', query: { cluster_id: cluster.id } }"
        class="cl-stat-cell cl-stat-link"
        :class="healthCls"
        title="健康节点 / 节点总数"
        ><div class="cl-stat-value">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div>
        <div class="cl-stat-label">节点</div></router-link
      >
      <router-link :to="{ path: '/upstreams', query: { cluster_id: cluster.id } }" class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.upstream_count }}</div>
        <div class="cl-stat-label">上游</div></router-link
      >
      <router-link :to="{ path: '/routes', query: { cluster_id: cluster.id } }" class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.route_count }}</div>
        <div class="cl-stat-label">路由</div></router-link
      >
      <router-link
        :to="{ path: '/plugin-configs', query: { cluster_id: cluster.id } }"
        class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.plugin_config_count }}</div>
        <div class="cl-stat-label">插件组</div></router-link
      >
      <router-link :to="{ path: '/global-rules', query: { cluster_id: cluster.id } }" class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.global_rule_count }}</div>
        <div class="cl-stat-label">全局规则</div></router-link
      >
      <router-link
        :to="{ path: '/plugin-metadata', query: { cluster_id: cluster.id } }"
        class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.plugin_metadata_count }}</div>
        <div class="cl-stat-label">插件元数据</div></router-link
      >
      <router-link
        :to="{ path: '/static-resources', query: { cluster_id: cluster.id } }"
        class="cl-stat-cell cl-stat-link"
        ><div class="cl-stat-value">{{ cluster.static_resource_count }}</div>
        <div class="cl-stat-label">静态资源</div></router-link
      >
    </div>
    <div v-if="cluster.nodes && cluster.nodes.length > 0" class="cl-card-nodes">
      <span v-for="n in visibleNodes" :key="n.id" class="cl-node-tag" :class="n.status === 1 ? 'online' : 'offline'">
        <span class="status-dot" :class="n.status === 1 ? 'online' : 'offline'"></span>
        {{ n.ip }}:{{ n.service_port }}
      </span>
      <span v-if="cluster.nodes.length > 3" class="node-more">...还有 {{ cluster.nodes.length - 3 }} 个</span>
    </div>
    <div v-if="$slots.actions" class="cl-card-actions">
      <slot name="actions"></slot>
    </div>
    <slot name="footer"></slot>
  </div>
</template>

<script setup lang="ts">
// 集群卡片（档位 C 统一实现）：集群管理 / 统一管理两页共用。
// 纯展示组件：不拉取中继区域等信息——routeBadge 由页面计算后传入（null = 不渲染路径徽章）。
// 页面差异经 slot 注入：topbar（统一管理的最大化按钮）、actions（按钮组 + #id 尾注）、footer（扩展位）。
import { computed } from 'vue'
import type { Cluster } from '@/types'

const props = defineProps<{
  cluster: Cluster
  routeBadge?: { label: string; cls: string } | null
  /** 统计格点击接管（方案 A）：传入时统计格不再跳全局列表页，改由页面处理（如直切本页集群 Tab） */
  statClick?: (key: string) => void
}>()

/** 统计格点击转发（约定 #25：模板 handler 提取为函数）；仅在 statClick 分支渲染 */
function onStatClick(key: string) {
  props.statClick?.(key)
}

/** 回退式二显副标题：description 优先 → 回退「集群标识: name」（仅 display_name 存在时）→ 无 */
const subtitle = computed<string | null>(() => {
  const c = props.cluster
  if (c.description) return c.description
  if (c.display_name) return `集群标识: ${c.name}`
  return null
})

/** 悬停保底：主标题 tooltip 携带数字 ID（#id 尾注删除后全 UI 唯一露出面） */
const nameTitle = computed(
  () => `集群名: ${props.cluster.display_name || props.cluster.name} · ID: ${props.cluster.id}`,
)

/** 发布状态微标（cluster-ux-close-loop 3.2）：独立迷你徽章，不复用 PublishStatusTag */
const VERSION_CHIP_TOOLTIP = '集群配置（edge.env）版本；子资源发布不推进此版本'
const versionChip = computed(() => ({
  text: props.cluster.current_version ? `配置 v${props.cluster.current_version}` : '未发布',
  published: !!props.cluster.current_version,
}))

/** 健康节点格分级（cluster-ux-close-loop 3.3）：0 健康红 / 不足橙 / 全健康默认（无节点不告警） */
const healthCls = computed(() => {
  const total = props.cluster.node_count || 0
  const healthy = props.cluster.healthy_node_count || 0
  if (total > 0 && healthy === 0) return 'is-danger'
  if (healthy < total) return 'is-warning'
  return ''
})

/** 节点 tag 最多展示前 3 个 */
const visibleNodes = computed(() => props.cluster.nodes?.slice(0, 3) ?? [])
</script>

<style scoped>
/* 卡片解剖样式唯一收敛点（两页本地副本已删除；漂移取舍见组件化报告）：
   - topbar/stats/stats 数值字号取 CentralList 版（较新）；
   - card-desc 保留两行截断（CentralList 获得描述副标题后需防长文撑高卡片）；
   - card-meta 取纵向堆叠版（路径徽章 + 状态徽章并列的结构超集）。 */
.cl-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cl-card:hover {
  box-shadow: var(--shadow-md);
}

.cl-card-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 12px 3px 16px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
}

.cl-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.cl-card-info {
  flex: 1;
  min-width: 0;
}
.cl-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cl-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cl-card-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 12px;
}
.cl-route-badge {
  white-space: nowrap;
}
.cl-version-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.5;
  border: 1px solid var(--border);
  color: var(--muted);
  background: var(--bg);
  white-space: nowrap;
}
.cl-version-chip.is-published {
  color: var(--success);
  border-color: oklch(55% 0.15 145 / 35%);
  background: oklch(55% 0.15 145 / 10%);
}

.cl-card-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  background: oklch(50% 0 0 / 4%);
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  margin: 4px 16px;
}
.cl-stat-cell {
  text-align: center;
  padding: 5px 12px;
  transition: all 0.15s;
}
.cl-stat-cell + .cl-stat-cell {
  border-left: 1px solid var(--border);
}
.cl-stat-cell:hover {
  background: oklch(100% 0 0 / 6%);
}
.cl-stat-value {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.3;
}
.cl-stat-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  margin-top: 2px;
}
.cl-stat-cell.is-danger .cl-stat-value {
  color: var(--danger);
}
.cl-stat-cell.is-warning .cl-stat-value {
  color: var(--warning);
}
.cl-stat-link {
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.cl-card-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 20px 8px;
}
.cl-node-tag {
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
.cl-node-tag.online {
  border-color: oklch(55% 0.15 145 / 25%);
}
.cl-node-tag.offline {
  border-color: oklch(55% 0.18 28 / 25%);
}
.node-more {
  font-size: 11px;
  color: var(--muted);
  padding: 2px 4px;
}

.cl-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
</style>
