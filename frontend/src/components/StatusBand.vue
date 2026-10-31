<template>
  <!-- 数据源（status/running-tasks）任一读取失败（含无 database_management 权限 403）时整条隐藏 -->
  <div v-if="status" class="status-band db-migration-status-band" role="status">
    <span class="band-seg band-active">
      <span class="band-label">当前活动库</span>
      <span class="badge badge-neutral">{{ activeTypeLabel }}</span>
      <span class="band-value">{{ status.active?.name || '未配置' }}</span>
    </span>
    <span v-if="status.pending_restart" class="band-seg band-restart">⚠ 切换待重启生效，注意迁移方向</span>
    <span v-if="migration?.in_progress" class="band-seg band-lock">
      <span class="band-label">迁移进行中</span>
      <span class="band-flow">{{ sourceLabel }} → {{ targetLabel }}</span>
      <span class="band-lock-tag">写操作已锁定</span>
      <span v-if="migration.started_at" class="band-time">{{ formatDateTime(migration.started_at) }} 起</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@/utils/format'
import type { DbConnection, DbStatus, MigrationState } from '@/types/database'

/**
 * 迁移页状态带（design D9 / tasks 6.1）：集中展示迁移决策所需核心事实——
 * 当前活动库（类型+名称）、切换待重启警示、迁移锁进行中（源 → 目标 + 写锁 + 开始时间）。
 *
 * 纯展示组件、数据经 props 传入：宿主页面本就拉取 status/connections（活动库名、
 * 迁移卡 G8 前置与源预选同源），锁态由页面 5s 轮询刷新；组件内不自拉可避免与页面
 * 请求重复，也让「权限 403 整条隐藏」收敛为页面 catch 后传 null 的单一行为。
 */
const props = defineProps<{
  status: DbStatus | null
  migration: MigrationState | null
  connections: DbConnection[]
}>()

const activeTypeLabel = computed(() => (props.status?.active?.type === 'postgres' ? 'PostgreSQL' : 'SQLite'))

/** 连接名解析：匹配不到（连接已删除等）回退原始 ID */
function connLabel(id: string | null): string {
  if (!id) return '-'
  return props.connections.find((c) => c.id === id)?.name || id
}

const sourceLabel = computed(() => connLabel(props.migration?.source_id ?? null))
const targetLabel = computed(() => connLabel(props.migration?.target_id ?? null))
</script>

<style scoped>
.status-band {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--bg);
  font-size: 13px;
}
.band-seg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.band-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.band-value {
  font-weight: 600;
}
.band-restart {
  color: #ad6800;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
}
.band-lock {
  color: oklch(45% 0.13 210);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 30%);
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
  flex-wrap: wrap;
}
.band-lock-tag {
  font-weight: 600;
  color: var(--danger, #ff4d4f);
  white-space: nowrap;
}
.band-flow {
  font-family: var(--font-mono, monospace);
}
.band-time {
  color: var(--muted);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  white-space: nowrap;
}
</style>
