<template>
  <div class="card db-backup-summary">
    <div class="card-header">
      <h3>SQLite 备份与容灾</h3>
      <div class="dbb-sum-header-actions">
        <button class="btn btn-primary btn-sm" @click="goManagement">进入备份管理</button>
        <button class="btn btn-secondary btn-sm" @click="goRestore">灾难恢复</button>
      </div>
    </div>
    <div class="card-body">
      <div v-if="error" class="dbb-sum-error">{{ error }}</div>
      <template v-else-if="loaded">
        <!-- 无配置引导：尚未配置任何备份位置 -->
        <div v-if="noTargets" class="dbb-sum-guide">
          <div class="dbb-sum-guide-icon">&#128230;</div>
          <div class="dbb-sum-guide-text">
            尚未配置备份位置——进入备份管理添加远端目标后，系统将按策略定时推送 SQLite 备份包，并支持一键容灾恢复。
          </div>
        </div>
        <template v-else>
          <!-- 四格状态统计（屏 1 统计条精简变体） -->
          <div class="dbb-sum-stats">
            <div class="dbb-sum-stat">
              <div class="dbb-sum-label">最近成功备份</div>
              <div class="dbb-sum-value" :class="{ 'dbb-sum-muted': !config?.last_success_at }">
                {{ config?.last_success_at ? formatDateTime(config.last_success_at) : '从未备份' }}
              </div>
            </div>
            <div class="dbb-sum-stat">
              <div class="dbb-sum-label">下一轮预计</div>
              <div class="dbb-sum-value" :class="{ 'dbb-sum-muted': !nextRunText }">{{ nextRunText }}</div>
            </div>
            <div class="dbb-sum-stat">
              <div class="dbb-sum-label">最近状态</div>
              <div class="dbb-sum-value">
                <span v-if="status?.in_progress" class="badge badge-info"
                  ><span class="dbb-sum-spin"></span>备份中</span
                >
                <span v-else-if="config?.last_status" :class="badgeClass(config.last_status)">{{
                  badgeText(config.last_status)
                }}</span>
                <span v-else class="dbb-sum-muted">尚未运行</span>
              </div>
            </div>
            <div class="dbb-sum-stat">
              <div class="dbb-sum-label">定时调度</div>
              <div class="dbb-sum-value">
                <span :class="config?.enabled ? 'badge badge-success' : 'badge badge-neutral'">{{
                  config?.enabled ? '已启用' : '未启用'
                }}</span>
              </div>
            </div>
          </div>

          <!-- 最近一次结果（partial 黄 + N/M 目标小注） -->
          <div class="dbb-sum-last">
            <div class="dbb-sum-last-label">最近一次结果</div>
            <div class="dbb-sum-last-body">
              <template v-if="lastRun">
                <span :class="badgeClass(lastRun.status)" :title="lastRun.error || ''">{{
                  badgeText(lastRun.status)
                }}</span>
                <span v-if="lastOkCount !== null" class="dbb-sum-counts"
                  >{{ lastOkCount }}/{{ lastRun.targets?.length }} 目标</span
                >
                <span class="dbb-sum-time mono">{{ formatDateTime(lastRun.started_at) }}</span>
                <span v-if="lastRun.error" class="dbb-sum-err" :title="lastRun.error">{{ lastRun.error }}</span>
              </template>
              <span v-else class="dbb-sum-muted">暂无备份历史</span>
            </div>
          </div>
          <div class="dbb-sum-locations">
            <span class="dbb-sum-loc-count">{{ enabledTargetCount }} 个启用位置</span>
            <span v-if="disabledTargetCount > 0" class="dbb-sum-loc-disabled"
              >（另 {{ disabledTargetCount }} 个已停用）</span
            >
          </div>
        </template>
      </template>
      <div v-else class="dbb-sum-muted dbb-sum-loading">加载中…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { formatDateTime } from '@/utils/format'
import { getDbBackupConfig, getDbBackupHistory } from '@/api/dbBackup'
import type { DbBackupConfig, DbBackupHistoryItem, DbBackupStatusInfo } from '@/types/dbBackup'

const router = useRouter()

const config = ref<DbBackupConfig | null>(null)
const status = ref<DbBackupStatusInfo | null>(null)
const lastRun = ref<DbBackupHistoryItem | null>(null)
const loaded = ref(false)
const error = ref('')

const noTargets = computed(() => loaded.value && (config.value?.targets?.length ?? 0) === 0)
const enabledTargetCount = computed(() => (config.value?.targets || []).filter((t) => t.enabled).length)
const disabledTargetCount = computed(() => (config.value?.targets || []).filter((t) => !t.enabled).length)

/** 6.1：与主卡口径对齐——下一轮预计只读已保存 enabled + status.next_run_at */
const nextRunText = computed(() => {
  if (!config.value?.enabled) return '未启用定时'
  const next = status.value?.next_run_at
  if (next) return formatDateTime(next)
  return '启用后 30 秒内首备'
})

const lastOkCount = computed<number | null>(() => {
  const subs = lastRun.value?.targets
  if (!subs || subs.length === 0) return null
  return subs.filter((s) => s.status === 'success').length
})

function badgeClass(s: string): string {
  if (s === 'success') return 'badge badge-success'
  if (s === 'partial') return 'badge badge-warning'
  if (s === 'failed') return 'badge badge-danger'
  if (s === 'running') return 'badge badge-info'
  return 'badge badge-neutral'
}

function badgeText(s: string): string {
  const labels: Record<string, string> = { success: '成功', partial: '部分成功', failed: '失败', running: '进行中' }
  return labels[s] || s
}

function goManagement(): void {
  void router.push('/backup-management')
}

function goRestore(): void {
  void router.push('/backup-management?wizard=1')
}

onMounted(async () => {
  try {
    const [configRes, historyRes] = await Promise.all([getDbBackupConfig(), getDbBackupHistory(1, 1).catch(() => null)])
    config.value = configRes.data.config
    status.value = configRes.data.status
    lastRun.value = historyRes?.data?.items?.[0] ?? null
  } catch {
    // 摘要卡非关键路径：读失败时降级为错误文案，不打断数据库管理页
    error.value = '备份状态读取失败，请稍后在备份管理页重试'
  } finally {
    loaded.value = true
  }
})
</script>

<style scoped>
.db-backup-summary {
  border-left: 3px solid oklch(56% 0.16 210);
}
.dbb-sum-header-actions {
  display: flex;
  gap: 8px;
}
.dbb-sum-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--bg);
  overflow: hidden;
}
.dbb-sum-stat {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--border);
}
.dbb-sum-stat:last-child {
  border-right: none;
}
.dbb-sum-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dbb-sum-value {
  font-size: 13px;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.dbb-sum-muted {
  color: var(--muted);
}
.dbb-sum-loading {
  font-size: 13px;
  padding: 8px 0;
}
.dbb-sum-last {
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 6px);
  background: var(--bg);
}
.dbb-sum-last-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.dbb-sum-last-body {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--fg);
}
.dbb-sum-counts {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}
.dbb-sum-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.dbb-sum-err {
  color: var(--danger);
  font-size: 12px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dbb-sum-locations {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.dbb-sum-guide {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px dashed oklch(56% 0.16 210 / 40%);
  border-radius: var(--radius-lg, 8px);
  background: oklch(56% 0.16 210 / 4%);
}
.dbb-sum-guide-icon {
  font-size: 22px;
  line-height: 1;
}
.dbb-sum-guide-text {
  font-size: 13px;
  color: var(--fg);
  line-height: 1.6;
}
.dbb-sum-error {
  font-size: 12px;
  color: var(--danger);
  background: oklch(55% 0.18 28 / 6%);
  border: 1px solid oklch(55% 0.18 28 / 25%);
  border-radius: var(--radius-md, 6px);
  padding: 8px 12px;
}
.dbb-sum-spin {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid oklch(56% 0.16 210 / 30%);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: dbb-sum-rotate 0.8s linear infinite;
}
@keyframes dbb-sum-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .dbb-sum-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .dbb-sum-stat:nth-child(2) {
    border-right: none;
  }
  .dbb-sum-stat:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}
</style>
