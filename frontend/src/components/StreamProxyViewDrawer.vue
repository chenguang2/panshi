<template>
  <Teleport to="body">
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:600px;">
      <div class="modal-header">
        <h2>查看四层代理 - {{ proxy?.name }}</h2>
        <button class="modal-close" @click="emit('update:visible', false)">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="proxy" class="spvd-body">
          <div class="spvd-field">
            <span class="spvd-label">名称</span>
            <span class="spvd-value">{{ proxy.name }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">集群</span>
            <span class="spvd-value">{{ proxy.cluster_name || '-' }}</span>
          </div>
          <div class="spvd-field" v-if="proxy.description">
            <span class="spvd-label">描述</span>
            <span class="spvd-value">{{ proxy.description }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">监听端口</span>
            <span class="spvd-value spvd-port">{{ proxy.listen_port }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">协议</span>
            <span class="spvd-value">{{ schemeLabel(proxy.scheme) }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">负载均衡</span>
            <span class="spvd-value">{{ lbLabel }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">状态</span>
            <span>
              <span v-if="proxy.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
              <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            </span>
          </div>
          <div class="spvd-field" v-if="proxy.current_version">
            <span class="spvd-label">版本</span>
            <span class="spvd-value">v{{ proxy.current_version }}</span>
          </div>
          <div class="spvd-field" v-if="proxy.published_at">
            <span class="spvd-label">发布时间</span>
            <span class="spvd-value">{{ formatDate(proxy.published_at) }}</span>
          </div>

          <div class="spvd-section">目标节点</div>
          <div v-if="proxy.targets && proxy.targets.length > 0" class="spvd-tags">
            <span v-for="(t, i) in proxy.targets" :key="i" class="spvd-tag">{{ t.target }}<span class="spvd-tag-wt">:{{ t.weight }}</span></span>
          </div>
          <div v-else class="spvd-muted">无目标</div>

          <div v-if="hasTimeout" class="spvd-section">超时配置</div>
          <div v-if="hasTimeout" class="spvd-inline-fields">
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">connect</span>
              <span class="spvd-ivalue">{{ proxy.timeout?.connect ?? '-' }}s</span>
            </div>
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">send</span>
              <span class="spvd-ivalue">{{ proxy.timeout?.send ?? '-' }}s</span>
            </div>
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">read</span>
              <span class="spvd-ivalue">{{ proxy.timeout?.read ?? '-' }}s</span>
            </div>
          </div>

          <div v-if="hasKeepalivePool" class="spvd-section">连接池配置</div>
          <div v-if="hasKeepalivePool" class="spvd-inline-fields">
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">大小</span>
              <span class="spvd-ivalue">{{ proxy.keepalive_pool?.size ?? '-' }}</span>
            </div>
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">空闲超时</span>
              <span class="spvd-ivalue">{{ proxy.keepalive_pool?.idle_timeout ?? '-' }}s</span>
            </div>
            <div class="spvd-inline-item">
              <span class="spvd-ilabel">请求数</span>
              <span class="spvd-ivalue">{{ proxy.keepalive_pool?.requests ?? '-' }}</span>
            </div>
          </div>

          <div v-if="proxy.remote_addr || proxy.sni" class="spvd-section">匹配条件</div>
          <div class="spvd-field" v-if="proxy.remote_addr">
            <span class="spvd-label">remote_addr</span>
            <span class="spvd-value spvd-mono">{{ proxy.remote_addr }}</span>
          </div>
          <div class="spvd-field" v-if="proxy.sni">
            <span class="spvd-label">SNI</span>
            <span class="spvd-value spvd-mono">{{ proxy.sni }}</span>
          </div>

          <div class="spvd-section">时间信息</div>
          <div class="spvd-field">
            <span class="spvd-label">创建时间</span>
            <span class="spvd-value">{{ formatDate(proxy.created_at) }}</span>
          </div>
          <div class="spvd-field">
            <span class="spvd-label">更新时间</span>
            <span class="spvd-value">{{ formatDate(proxy.updated_at) }}</span>
          </div>
        </div>
        <div v-else class="spvd-empty">暂无数据</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('update:visible', false)">关闭</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { StreamProxy } from '@/types'

const props = defineProps<{
  visible: boolean
  proxy: StreamProxy | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

function schemeLabel(scheme: string | undefined): string {
  if (scheme === 'tcp') return 'TCP'
  if (scheme === 'udp') return 'UDP'
  return scheme || 'TCP'
}

const lbLabel = computed(() => {
  if (!props.proxy) return '-'
  const map: Record<string, string> = {
    weighted_roundrobin: '加权轮询',
    roundrobin: '轮询',
    chash: '一致性哈希',
    ewma: 'EWMA',
    least_conn: '最少连接',
  }
  return map[props.proxy.load_balance] || props.proxy.load_balance
})

const hasTimeout = computed(() => {
  return props.proxy?.timeout && Object.keys(props.proxy.timeout).length > 0
})

const hasKeepalivePool = computed(() => {
  return props.proxy?.keepalive_pool && Object.keys(props.proxy.keepalive_pool).length > 0
})

function formatDate(d: string | null | undefined): string {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}
</script>

<style scoped>
.spvd-body { font-size: 13px; }
.spvd-field {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.spvd-field:last-child { border-bottom: none; }
.spvd-label {
  flex-shrink: 0;
  width: 100px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}
.spvd-value { color: var(--fg); }
.spvd-port { font-family: var(--font-mono); font-weight: 600; color: var(--accent); }
.spvd-mono { font-family: var(--font-mono); font-size: 12px; }
.spvd-muted { color: var(--muted); font-style: italic; font-size: 12px; }

.spvd-section {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 14px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.spvd-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.spvd-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  font-family: var(--font-mono);
}
.spvd-tag-wt { color: var(--muted); font-size: 10px; }

.spvd-inline-fields {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.spvd-inline-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.spvd-ilabel { font-size: 11px; color: var(--muted); }
.spvd-ivalue { font-size: 12px; color: var(--fg); font-family: var(--font-mono); }

.spvd-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--muted);
}
</style>
