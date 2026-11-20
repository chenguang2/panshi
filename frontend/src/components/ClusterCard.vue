<template>
  <article class="l5-panel std-card cl-card" :class="clusterHueClass(props.cluster.id)">
    <div class="lp-head">
      <div class="lp-title">
        <span class="lp-name" :title="nameTitle">{{ cluster.display_name || cluster.name }}</span>
        <span class="lp-tag tech" :title="identTitle">{{ cluster.name }}</span>
        <slot name="topbar-extra" />
      </div>
      <div class="lp-status">
        <span v-if="cluster.status === 1" class="badge badge-success">已启用</span>
        <span v-else class="badge badge-danger">已禁用</span>
        <span class="ps-tag" :class="versionChip.published ? 'ps-pub' : 'ps-unpub'" :title="VERSION_CHIP_TOOLTIP">{{
          versionChip.text
        }}</span>
        <span v-if="routeBadge" class="lp-tag cl-route-badge" :class="routeBadge.cls">{{ routeBadge.label }}</span>
      </div>
    </div>
    <div class="lp-body">
      <div class="lp-row">
        <span class="lp-k">描述</span>
        <span class="lp-v dim" :title="cluster.description || ''">{{ cluster.description || '—' }}</span>
      </div>
      <div class="lp-row">
        <span class="lp-k">节点</span>
        <template v-if="cluster.nodes && cluster.nodes.length > 0">
          <div class="lp-chips">
            <span
              v-for="n in visibleNodes"
              :key="n.id"
              class="node-chip"
              :class="{ off: n.status !== 1 }"
              :title="`管理端口 ${n.management_port}`"
            >
              <span class="dot"></span>{{ n.ip }}:{{ n.service_port }}
            </span>
            <span v-if="cluster.nodes.length > 3" class="node-more">…还有 {{ cluster.nodes.length - 3 }} 个</span>
          </div>
          <span class="lp-cnt" :class="healthCls" title="健康节点 / 节点总数"
            >{{ cluster.healthy_node_count }}/{{ cluster.node_count }} 健康</span
          >
        </template>
        <span v-else class="lp-v dim">未挂节点</span>
      </div>
      <div v-if="offlineNotice" class="lp-notice alert alert-warning">
        <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
        <span class="n-txt">{{ offlineNotice }}</span>
      </div>
    </div>
    <!-- 统计格：statClick 接管（统一管理直切 Tab）/ router-link 深链（集群管理跳资源页）双分支 -->
    <div v-if="statClick" class="stat-grid">
      <div
        class="stat-cell"
        :class="healthCls"
        title="健康节点 / 节点总数（点击进入统一管理 · 节点）"
        @click="onStatClick('nodes')"
      >
        <div class="sv">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div>
        <div class="sl">节点</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 上游" @click="onStatClick('upstreams')">
        <div class="sv">{{ cluster.upstream_count }}</div>
        <div class="sl">上游</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 路由" @click="onStatClick('routes')">
        <div class="sv">{{ cluster.route_count }}</div>
        <div class="sl">路由</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 插件组" @click="onStatClick('pluginConfigs')">
        <div class="sv">{{ cluster.plugin_config_count }}</div>
        <div class="sl">插件组</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 全局规则" @click="onStatClick('globalRules')">
        <div class="sv">{{ cluster.global_rule_count }}</div>
        <div class="sl">全局规则</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 插件元数据" @click="onStatClick('pluginMetadata')">
        <div class="sv">{{ cluster.plugin_metadata_count }}</div>
        <div class="sl">插件元数据</div>
      </div>
      <div class="stat-cell" title="进入统一管理 · 静态资源" @click="onStatClick('staticResources')">
        <div class="sv">{{ cluster.static_resource_count }}</div>
        <div class="sl">静态资源</div>
      </div>
    </div>
    <div v-else class="stat-grid">
      <router-link
        :to="{ path: '/nodes', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        :class="healthCls"
        title="健康节点 / 节点总数"
      >
        <div class="sv">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div>
        <div class="sl">节点</div>
      </router-link>
      <router-link
        :to="{ path: '/upstreams', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的上游列表"
      >
        <div class="sv">{{ cluster.upstream_count }}</div>
        <div class="sl">上游</div>
      </router-link>
      <router-link
        :to="{ path: '/routes', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的路由列表"
      >
        <div class="sv">{{ cluster.route_count }}</div>
        <div class="sl">路由</div>
      </router-link>
      <router-link
        :to="{ path: '/plugin-configs', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的插件组"
      >
        <div class="sv">{{ cluster.plugin_config_count }}</div>
        <div class="sl">插件组</div>
      </router-link>
      <router-link
        :to="{ path: '/global-rules', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的全局规则"
      >
        <div class="sv">{{ cluster.global_rule_count }}</div>
        <div class="sl">全局规则</div>
      </router-link>
      <router-link
        :to="{ path: '/plugin-metadata', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的插件元数据"
      >
        <div class="sv">{{ cluster.plugin_metadata_count }}</div>
        <div class="sl">插件元数据</div>
      </router-link>
      <router-link
        :to="{ path: '/static-resources', query: { cluster_id: cluster.id } }"
        class="stat-cell"
        title="查看该集群的静态资源"
      >
        <div class="sv">{{ cluster.static_resource_count }}</div>
        <div class="sl">静态资源</div>
      </router-link>
    </div>
    <div v-if="$slots.actions" class="lp-foot">
      <slot name="actions"></slot>
    </div>
    <slot name="footer"></slot>
  </article>
</template>

<script setup lang="ts">
// 集群卡片（档位 C 统一实现）：集群管理 / 统一管理两页共用。
// mockup-parity-standard 21.11：卡片重写为 l5-panel 解剖（与全部卡片页同语言）——
// lp-head（显示名 + 标识 tech tag）/ lp-status（启用徽标 + 配置版本微标 + 中继徽章）/
// lp-body（描述 + 节点 chips + 健康比）/ stat-grid 七格（色相分域可点）/
// lp-foot 由页面 slot 注入（两页动作行同构）。纯展示组件：不发请求。
import { computed } from 'vue'
import type { Cluster } from '@/types'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { clusterHueClass } from '@/utils/clusterHue'

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

/** 标题条身份 tooltip（数字 ID 唯一露出面随身份条迁移） */
const identTitle = computed(() => `集群标识（API/管理面使用）: ${props.cluster.name} · ID: ${props.cluster.id}`)

/** 悬停保底：主标题 tooltip 携带数字 ID（#id 尾注删除后全 UI 唯一露出面） */
const nameTitle = computed(
  () => `集群名: ${props.cluster.display_name || props.cluster.name} · ID: ${props.cluster.id}`,
)

/** 发布状态微标（cluster-ux-close-loop 3.2；2026-10-30 裁决 A 扩口径）：
 *  配置 vN = edge.env 版本（唯一写集群行的发布链路）；has_published = 任一资源有 ConfigVersion；
 *  两者皆无 = 未发布。上游/路由发布写各自表、不回写集群行，故不能用 current_version 单独判定 */
const VERSION_CHIP_TOOLTIP =
  '「配置 vN」= edge.env 配置版本；「已发布」= 集群下有已发布资源（上游/路由等）；两者皆无 = 未发布'
const versionChip = computed(() => {
  if (props.cluster.current_version) {
    return { text: `配置 v${props.cluster.current_version}`, published: true }
  }
  if (props.cluster.has_published) {
    return { text: '已发布', published: true }
  }
  return { text: '未发布', published: false }
})

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

/** 离线节点警示（卡片页 lp-notice 语言；数量与首个 IP 具体化，与 republish 提示同构） */
const offlineNotice = computed<string | null>(() => {
  const off = (props.cluster.nodes ?? []).filter((n) => n.status !== 1)
  if (!off.length) return null
  const first = off[0]
  return `${off.length} 个节点离线（${first.ip}:${first.service_port}${off.length > 1 ? ' 等' : ''}），发布将跳过该节点`
})
</script>

<style scoped>
.cl-card {
  min-width: 0;
}
/* 节点 chips（设计稿 node-chip 语言；在线/离线圆点 + mono 地址） */
.node-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
}
.node-chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--success);
  flex-shrink: 0;
}
.node-chip.off {
  opacity: 0.8;
}
.node-chip.off .dot {
  background: var(--muted);
}
.node-more {
  font-size: 10.5px;
  color: var(--muted);
  align-self: center;
}
/* 健康比分级（沿用 cluster-ux-close-loop 3.3 语义：0 健康红 / 不足橙） */
.lp-cnt.is-danger {
  color: var(--danger);
  font-weight: 600;
}
.lp-cnt.is-warning {
  color: var(--warning);
  font-weight: 600;
}
.stat-cell.is-danger .sv {
  color: var(--danger);
}
.stat-cell.is-warning .sv {
  color: var(--warning);
}
.stat-cell.is-danger,
.stat-cell.is-warning {
  cursor: pointer;
}
/* 中继徽章（页面传入：经中继 accent 淡底 / 直连灰） */
.cl-route-badge {
  border-color: oklch(56% 0.16 210 / 30%);
  background: var(--accent-bg);
  color: var(--accent);
}
.cl-route-badge.is-direct {
  color: var(--muted);
}
/* 统计格（设计稿 stat-grid 语言；共享 .stat-cell 底座之上补色相分域） */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin: 0 14px 4px;
}
.stat-cell {
  display: block;
  text-align: center;
  padding: 7px 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.12s,
    background 0.12s,
    transform 0.12s;
}
.stat-cell:hover {
  border-color: oklch(56% 0.16 210 / 45%);
  background: var(--accent-bg);
  transform: translateY(-1px);
}
.stat-cell .sv {
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--fg);
  line-height: 1.1;
}
.stat-cell .sl {
  font-size: 10.5px;
  color: var(--muted);
  margin-top: 2px;
}
</style>
