<template>
  <div v-if="visible" class="migration-lock-banner" role="alert">
    <span class="banner-mark">⚠</span>
    <div class="banner-body">
      <div class="banner-text">{{ displayText }}</div>
      <div v-if="metaText" class="banner-meta">{{ metaText }}</div>
    </div>
    <router-link to="/db-migration" class="banner-link">查看进度</router-link>
    <button class="banner-close" type="button" aria-label="关闭" @click="closeBanner">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MIGRATION_LOCK_CLEAR_EVENT, MIGRATION_LOCK_SHOW_EVENT } from '@/api/index'
import { getRunningTasks, listConnections } from '@/api/database'
import { formatDateTime } from '@/utils/format'
import type { DbConnection, MigrationState } from '@/types/database'

// 全局迁移锁横幅（db-migration-ux-optimization D5）：事件驱动零轮询。
// 503 锁响应由 axios 拦截器广播（api/index.ts notifyMigrationLock），
// 本组件只负责展示与移除：用户可手动关闭（后续再次 503 重新拉起），
// 任意写请求成功由拦截器广播清除事件移除。running-tasks 需 db_migration
// 权限，403/失败时降级为只显示 503 detail 文本，不报错。

const visible = ref(false)
const lockDetail = ref('')
const migration = ref<MigrationState | null>(null)
const connections = ref<DbConnection[]>([])

function connectionName(connId: string): string {
  return connections.value.find((c) => c.id === connId)?.name || connId
}

// running-tasks 填充成功（迁移进行中且源/目标齐全）时展示结构化内容，否则降级 detail
const enriched = computed(() => {
  const m = migration.value
  if (m?.in_progress && m.source_id && m.target_id) {
    return { sourceId: m.source_id, targetId: m.target_id, startedAt: m.started_at }
  }
  return null
})

const displayText = computed(() => {
  const info = enriched.value
  if (info) {
    return `数据库迁移进行中：${connectionName(info.sourceId)} → ${connectionName(info.targetId)}`
  }
  return lockDetail.value || '数据库迁移进行中，所有写操作暂被锁定'
})

const metaText = computed(() => {
  if (!enriched.value) return ''
  const parts: string[] = []
  if (enriched.value.startedAt) parts.push(`${formatDateTime(enriched.value.startedAt)} 起`)
  parts.push('所有写操作暂被锁定，完成后自动恢复')
  return parts.join(' · ')
})

/** 拉起后一次性拉取 running-tasks + 连接列表填充源→目标与开始时间（不做轮询）。 */
async function enrich(): Promise<void> {
  try {
    const [tasksRes, connRes] = await Promise.all([
      getRunningTasks(),
      listConnections().catch(() => null),
    ])
    migration.value = tasksRes.data.migration
    if (connRes) connections.value = connRes.data
  } catch {
    // 降级：只显示 503 detail 文本
    migration.value = null
    connections.value = []
  }
}

function onLockShow(event: Event): void {
  const detail = (event as CustomEvent<string>).detail || ''
  lockDetail.value = detail
  migration.value = null
  connections.value = []
  visible.value = true
  void enrich()
}

function onLockClear(): void {
  visible.value = false
}

function closeBanner(): void {
  visible.value = false
}

onMounted(() => {
  window.addEventListener(MIGRATION_LOCK_SHOW_EVENT, onLockShow)
  window.addEventListener(MIGRATION_LOCK_CLEAR_EVENT, onLockClear)
})

onBeforeUnmount(() => {
  window.removeEventListener(MIGRATION_LOCK_SHOW_EVENT, onLockShow)
  window.removeEventListener(MIGRATION_LOCK_CLEAR_EVENT, onLockClear)
})
</script>

<style scoped>
.migration-lock-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1050; /* 页面头部(1000)之上、GlobalSearch(1100)/弹窗(2000)之下 */
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: oklch(96% 0.05 90);
  border-bottom: 1px solid oklch(70% 0.14 80 / 60%);
  font-size: 13px;
  color: oklch(45% 0.12 70);
  box-shadow: 0 2px 6px oklch(0% 0 0 / 8%);
}
.banner-mark {
  flex-shrink: 0;
}
.banner-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.banner-text {
  font-weight: 600;
}
.banner-meta {
  font-size: 12px;
  color: var(--muted);
}
.banner-link {
  flex-shrink: 0;
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.banner-link:hover {
  text-decoration: underline;
}
.banner-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  color: oklch(45% 0.12 70);
}
.banner-close:hover {
  color: oklch(35% 0.12 70);
}
</style>
