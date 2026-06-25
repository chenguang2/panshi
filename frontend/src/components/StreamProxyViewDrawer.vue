<template>
  <a-drawer
    :open="visible"
    :title="`查看四层代理 - ${proxy?.name || ''}`"
    placement="right"
    width="640"
    @close="emit('update:visible', false)"
  >
    <template v-if="proxy">
      <a-descriptions :column="1" bordered size="small" :label-style="{ width: '140px' }">
        <a-descriptions-item label="名称">{{ proxy.name }}</a-descriptions-item>
        <a-descriptions-item label="所属集群">{{ proxy.cluster_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="描述">{{ proxy.description || '-' }}</a-descriptions-item>
        <a-descriptions-item label="监听端口">{{ proxy.listen_port }}</a-descriptions-item>
        <a-descriptions-item label="协议">{{ schemeLabel }}</a-descriptions-item>
        <a-descriptions-item label="负载均衡算法">{{ lbLabel }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag v-if="proxy.current_version" color="green">已发布</a-tag>
          <a-tag v-else color="orange">未发布</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="版本" v-if="proxy.current_version">
          v{{ proxy.current_version }}
        </a-descriptions-item>
        <a-descriptions-item label="发布时间" v-if="proxy.published_at">
          {{ proxy.published_at }}
        </a-descriptions-item>
        <a-descriptions-item label="remote_addr" v-if="proxy.remote_addr">
          {{ proxy.remote_addr }}
        </a-descriptions-item>
        <a-descriptions-item label="SNI" v-if="proxy.sni">
          {{ proxy.sni }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider>后端节点</a-divider>
      <a-table
        :data-source="proxy.targets || []"
        :columns="targetColumns"
        :pagination="false"
        size="small"
        bordered
        row-key="target"
      />

      <a-divider v-if="hasTimeout">超时配置</a-divider>
      <a-descriptions v-if="hasTimeout" :column="1" bordered size="small" :label-style="{ width: '140px' }">
        <a-descriptions-item v-if="proxy.timeout?.connect" label="connect">
          {{ proxy.timeout.connect }}ms
        </a-descriptions-item>
        <a-descriptions-item v-if="proxy.timeout?.send" label="send">
          {{ proxy.timeout.send }}ms
        </a-descriptions-item>
        <a-descriptions-item v-if="proxy.timeout?.read" label="read">
          {{ proxy.timeout.read }}ms
        </a-descriptions-item>
      </a-descriptions>

      <a-divider v-if="hasKeepalivePool">连接池配置</a-divider>
      <a-descriptions v-if="hasKeepalivePool" :column="1" bordered size="small" :label-style="{ width: '140px' }">
        <a-descriptions-item label="大小">{{ proxy.keepalive_pool?.size ?? '-' }}</a-descriptions-item>
        <a-descriptions-item label="空闲超时" v-if="proxy.keepalive_pool?.idle_timeout">
          {{ proxy.keepalive_pool.idle_timeout }}ms
        </a-descriptions-item>
        <a-descriptions-item label="请求数" v-if="proxy.keepalive_pool?.requests">
          {{ proxy.keepalive_pool.requests }}
        </a-descriptions-item>
      </a-descriptions>

      <a-divider>时间信息</a-divider>
      <a-descriptions :column="1" bordered size="small" :label-style="{ width: '140px' }">
        <a-descriptions-item label="创建时间">{{ proxy.created_at || '-' }}</a-descriptions-item>
        <a-descriptions-item label="更新时间">{{ proxy.updated_at || '-' }}</a-descriptions-item>
      </a-descriptions>
    </template>

    <template v-else>
      <a-empty description="暂无数据" />
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { StreamProxy, StreamProxyTarget } from '@/types'

const props = defineProps<{
  visible: boolean
  proxy: StreamProxy | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const schemeLabel = computed(() => {
  if (!props.proxy) return '-'
  const map: Record<string, string> = {
    tcp: 'TCP',
    udp: 'UDP',
    tls: 'TLS',
  }
  return map[props.proxy.scheme] || props.proxy.scheme
})

const lbLabel = computed(() => {
  if (!props.proxy) return '-'
  const map: Record<string, string> = {
    roundrobin: '轮询',
    chash: '一致性哈希',
    ewma: 'EWMA',
    least_connections: '最少连接',
  }
  return map[props.proxy.load_balance] || props.proxy.load_balance
})

const hasTimeout = computed(() => {
  return props.proxy?.timeout && Object.keys(props.proxy.timeout).length > 0
})

const hasKeepalivePool = computed(() => {
  return props.proxy?.keepalive_pool && Object.keys(props.proxy.keepalive_pool).length > 0
})

const targetColumns = [
  {
    title: '目标地址',
    dataIndex: 'target',
    key: 'target',
  },
  {
    title: '权重',
    dataIndex: 'weight',
    key: 'weight',
    width: 100,
  },
]
</script>

<style scoped>
/* consistent with other drawer contents */
</style>
