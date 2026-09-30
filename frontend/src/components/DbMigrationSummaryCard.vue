<template>
  <div class="card db-migration-summary">
    <div class="card-header">
      <h3>数据迁移</h3>
      <div class="dbm-sum-header-actions">
        <button class="btn btn-primary btn-sm" @click="goMigration">开始迁移</button>
      </div>
    </div>
    <div class="card-body">
      <div v-if="error" class="dbm-sum-error">{{ error }}</div>
      <template v-else-if="loaded">
        <!-- 无连接注册表引导：尚无可用连接（发起迁移需要源与目标两个连接） -->
        <div v-if="noConnections" class="dbm-sum-guide">
          <div class="dbm-sum-guide-icon">&#128230;</div>
          <div class="dbm-sum-guide-text">
            尚未配置数据库连接——先在上方「连接列表」添加源与目标连接（迁移发起需要两个不同连接），再进入数据迁移页发起迁移。
          </div>
        </div>
        <template v-else>
          <!-- 四格状态统计（对齐备份摘要卡口径：active 连接 / 最近一次迁移 / 进行中状态 / 历史记录） -->
          <div class="dbm-sum-stats">
            <div class="dbm-sum-stat">
              <div class="dbm-sum-label">当前活动库</div>
              <div class="dbm-sum-value">
                <template v-if="status?.active">
                  <span class="badge badge-neutral">{{
                    status.active.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
                  }}</span>
                  <span>{{ status.active.name }}</span>
                </template>
                <span v-else class="dbm-sum-muted">未配置</span>
              </div>
            </div>
            <div class="dbm-sum-stat">
              <div class="dbm-sum-label">最近一次迁移</div>
              <div class="dbm-sum-value">
                <span v-if="lastRun" :class="badgeClass(lastRun.status)">{{ badgeText(lastRun.status) }}</span>
                <span v-else class="dbm-sum-muted">从未迁移</span>
              </div>
            </div>
            <div class="dbm-sum-stat">
              <div class="dbm-sum-label">迁移状态</div>
              <div class="dbm-sum-value">
                <span v-if="runningMigration?.in_progress" class="badge badge-warning">进行中</span>
                <span v-else class="badge badge-success">空闲</span>
              </div>
            </div>
            <div class="dbm-sum-stat">
              <div class="dbm-sum-label">历史记录</div>
              <div class="dbm-sum-value">
                <span>{{ historyCountText }}</span>
              </div>
            </div>
          </div>

          <!-- 最近一次结果（表数 + 完成时间，明细在迁移页） -->
          <div class="dbm-sum-last">
            <div class="dbm-sum-last-label">最近一次结果</div>
            <div class="dbm-sum-last-body">
              <template v-if="lastRun">
                <span :class="badgeClass(lastRun.status)" :title="lastRun.error_message || ''">{{
                  badgeText(lastRun.status)
                }}</span>
                <span v-if="lastRun.tables_count != null" class="dbm-sum-counts">{{ lastRun.tables_count }} 张表</span>
                <span class="dbm-sum-time mono">{{ formatDateTime(lastRun.created_at) }} 完成</span>
                <span v-if="lastRun.error_message" class="dbm-sum-err" :title="lastRun.error_message">{{
                  lastRun.error_message
                }}</span>
              </template>
              <span v-else class="dbm-sum-muted">暂无迁移历史</span>
            </div>
          </div>
          <div class="dbm-sum-locations">
            <span>迁移与历史管理在「数据迁移」页进行；迁移期间全局写暂停（写请求 503）。</span>
          </div>
        </template>
      </template>
      <div v-else class="dbm-sum-muted dbm-sum-loading">加载中…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { formatDateTime } from '@/utils/format'
import { getDatabaseStatus, getMigrationHistory, getRunningTasks } from '@/api/database'
import type { DbStatus, MigrationHistoryItem, MigrationState } from '@/types/database'

// 摘要卡为纯导航入口（spec：MUST NOT 就地触发迁移）；数据挂载时单次轻量拉取，
// 不建常驻轮询——进行中状态以打开页面时为准（对齐 DbBackupSummaryCard 口径）。
const router = useRouter()

const status = ref<DbStatus | null>(null)
const lastRun = ref<MigrationHistoryItem | null>(null)
const runningMigration = ref<MigrationState | null>(null)
const loaded = ref(false)
const error = ref('')

const noConnections = computed(() => loaded.value && (status.value?.connections_count ?? 0) === 0)

const historyLength = ref(0)
const historyCountText = computed(() => {
  const n = historyLength.value
  if (n === 0) return '暂无'
  return n >= 100 ? '100+ 条' : `${n} 条`
})

function badgeClass(s: string): string {
  if (s === 'success') return 'badge badge-success'
  if (s === 'failed') return 'badge badge-danger'
  return 'badge badge-neutral'
}

function badgeText(s: string): string {
  const labels: Record<string, string> = { success: '成功', failed: '失败', cancelled: '已取消' }
  return labels[s] || s
}

function goMigration(): void {
  void router.push('/db-migration')
}

onMounted(async () => {
  try {
    const [statusRes, historyRes, runningRes] = await Promise.all([
      getDatabaseStatus(),
      getMigrationHistory().catch(() => null),
      getRunningTasks().catch(() => null),
    ])
    status.value = statusRes.data
    lastRun.value = historyRes?.data?.[0] ?? null
    historyLength.value = historyRes?.data?.length ?? 0
    runningMigration.value = runningRes?.data?.migration ?? null
  } catch {
    // 摘要卡非关键路径：读失败时降级为错误文案，不打断数据库管理页
    error.value = '迁移状态读取失败，请稍后在数据迁移页重试'
  } finally {
    loaded.value = true
  }
})
</script>

<style scoped>
.db-migration-summary {
  border-left: 3px solid oklch(56% 0.16 210);
}
.dbm-sum-header-actions {
  display: flex;
  gap: 8px;
}
.dbm-sum-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--bg);
  overflow: hidden;
}
.dbm-sum-stat {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--border);
}
.dbm-sum-stat:last-child {
  border-right: none;
}
.dbm-sum-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dbm-sum-value {
  font-size: 13px;
  color: var(--fg);
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}
.dbm-sum-muted {
  color: var(--muted);
}
.dbm-sum-loading {
  font-size: 13px;
  padding: 8px 0;
}
.dbm-sum-last {
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 6px);
  background: var(--bg);
}
.dbm-sum-last-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}
.dbm-sum-last-body {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--fg);
}
.dbm-sum-counts {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}
.dbm-sum-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.dbm-sum-err {
  color: var(--danger);
  font-size: 12px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dbm-sum-locations {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.dbm-sum-guide {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px dashed oklch(56% 0.16 210 / 40%);
  border-radius: var(--radius-lg, 8px);
  background: oklch(56% 0.16 210 / 4%);
}
.dbm-sum-guide-icon {
  font-size: 22px;
  line-height: 1;
}
.dbm-sum-guide-text {
  font-size: 13px;
  color: var(--fg);
  line-height: 1.6;
}
.dbm-sum-error {
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .dbm-sum-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .dbm-sum-stat:nth-child(2) {
    border-right: none;
  }
  .dbm-sum-stat:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}
</style>
