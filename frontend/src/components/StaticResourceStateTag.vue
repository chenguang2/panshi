<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@/utils/format'
import { staticResourceState } from '@/utils/staticResourceRoute'

/**
 * 静态资源分发状态五态徽章（static-resources-ux-close-loop 7.1）
 * 判定逻辑唯一实现在 utils/staticResourceRoute.ts（两入口按钮禁用同源复用）；
 * 视觉对齐 PublishStatusTag（红/灰/橙/绿/橙红），时间展示走 utils/format.ts（#26）。
 */
interface PublishDetailLike {
  total?: number
  success?: number
  failed?: number
  failed_nodes?: { node: string; error?: string }[]
}

const props = withDefaults(
  defineProps<{
    currentVersion?: number | null
    lastPublishOk?: boolean | null
    routeExists?: boolean | null
    updatedAt?: string | null
    lastPublishedAt?: string | null
    publishDetail?: PublishDetailLike | null
  }>(),
  {
    currentVersion: null,
    lastPublishOk: null,
    routeExists: null,
    updatedAt: null,
    lastPublishedAt: null,
    publishDetail: null,
  },
)

const state = computed(() =>
  staticResourceState({
    current_version: props.currentVersion,
    last_publish_ok: props.lastPublishOk,
    route_exists: props.routeExists,
  }),
)

const label = computed((): string => {
  switch (state.value) {
    case 'broken':
      return '配置异常'
    case 'pending_upload':
      return '待上传'
    case 'pending_dispatch':
      return '待分发'
    case 'dispatched':
    case 'failed': {
      const d = props.publishDetail
      if (d && typeof d.total === 'number' && d.total > 0) {
        const ok = typeof d.success === 'number' ? d.success : 0
        return state.value === 'failed' ? `${ok}/${d.total} 节点失败` : `已分发 ${ok}/${d.total} 节点`
      }
      return '已分发'
    }
    default:
      return ''
  }
})

const tooltip = computed((): string => {
  switch (state.value) {
    case 'broken':
      return '关联路由不存在，请删除该资源或重建路由'
    case 'pending_upload':
      return '尚未上传 ZIP 文件'
    case 'pending_dispatch': {
      const at = props.updatedAt ? formatDateTime(props.updatedAt) : ''
      return at ? `上传于 ${at}，尚未分发到任何节点` : '尚未分发到任何节点'
    }
    case 'dispatched': {
      return props.lastPublishedAt ? `最近分发: ${formatDateTime(props.lastPublishedAt)}` : ''
    }
    case 'failed': {
      const parts: string[] = []
      if (props.lastPublishedAt) parts.push(`最近分发: ${formatDateTime(props.lastPublishedAt)}`)
      const nodes = (props.publishDetail?.failed_nodes || []).slice(0, 5)
      if (nodes.length > 0) {
        parts.push(`失败节点: ${nodes.map((n) => `${n.node}${n.error ? ` - ${n.error}` : ''}`).join('；')}`)
      }
      return parts.join('；')
    }
    default:
      return ''
  }
})
</script>

<template>
  <span
    class="srs-tag"
    :class="{
      'srs-broken': state === 'broken',
      'srs-pending-upload': state === 'pending_upload',
      'srs-pending-dispatch': state === 'pending_dispatch',
      'srs-dispatched': state === 'dispatched',
      'srs-failed': state === 'failed',
    }"
    :title="tooltip || undefined"
    >{{ label }}</span
  >
</template>

<style scoped>
.srs-tag {
  display: inline-block;
  font-size: 12px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 3px;
  font-weight: 500;
  white-space: nowrap;
}
.srs-broken {
  border: 1px solid #f5222d;
  color: #f5222d;
  background: #fff1f0;
  cursor: help;
}
.srs-pending-upload {
  border: 1px solid #d9d9d9;
  color: #999;
  background: #fafafa;
}
.srs-pending-dispatch {
  border: 1px solid #fa8c16;
  color: #fa8c16;
  background: #fff7e6;
  cursor: help;
}
.srs-dispatched {
  border: 1px solid #52c41a;
  color: #52c41a;
  background: #f6ffed;
  cursor: help;
}
.srs-failed {
  border: 1px solid #fa541c;
  color: #fa541c;
  background: #fff2e8;
  cursor: help;
}
</style>
