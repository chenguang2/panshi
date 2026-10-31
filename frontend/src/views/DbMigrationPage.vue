<template>
  <div class="db-migration-page">
    <PageHeader
      title="数据迁移"
      description="在 SQLite 与 PostgreSQL 之间单向快照迁移，支持实时进度、进行中状态恢复与迁移历史管理；迁移期间全局写暂停，请避开业务高峰。"
    >
    </PageHeader>
    <!-- 切换成功后的重启指引横幅：固定展示直至用户关闭或刷新（文案复用 DatabaseManagement 待重启指引） -->
    <a-alert
      v-if="showRestartGuide"
      class="restart-guide-banner"
      type="warning"
      show-icon
      closable
      @close="dismissRestartGuide"
    >
      <template #message>
        切换待重启生效，当前页面数据仍来自旧库；请按提示完成后端重启（开发环境运行
        <code>develop/linux/start.sh</code>，生产环境执行 <code>sh stop.sh; sh start.sh</code>）。
      </template>
    </a-alert>
    <StatusBand :status="status" :migration="runningMigration" :connections="connections" />
    <DbMigrationCard
      :connections="connections"
      :active-db-name="activeDbName"
      :active-conn-id="activeConnId"
      @switch-connection="goSwitchTarget"
    />
    <!-- 迁移完成后就地切换（9.2）：共享切换确认弹窗，预选迁移目标连接 -->
    <SwitchConnectionModal
      v-model:open="switchModalOpen"
      :connection="switchTarget"
      :active-name="activeDbName"
      @confirm="handleSwitchConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import DbMigrationCard from '@/components/DbMigrationCard.vue'
import StatusBand from '@/components/StatusBand.vue'
import SwitchConnectionModal from '@/components/SwitchConnectionModal.vue'
import { getDatabaseStatus, getRunningTasks, listConnections, switchDatabase } from '@/api/database'
import type { DbConnection, DbStatus, MigrationState } from '@/types/database'

const connections = ref<DbConnection[]>([])
const activeDbName = ref('未配置')
/** 活动连接 ID（GET /database/status 的 active.id）：供迁移卡 G8 前置禁用与源预选 */
const activeConnId = ref('')
/** 状态带数据：status 失败（含 403）时为 null → 状态带整条隐藏 */
const status = ref<DbStatus | null>(null)
const runningMigration = ref<MigrationState | null>(null)

/** 状态带锁态轮询：迁移起止后状态带随之刷新（读多写少接口，开销可忽略） */
let _bandPollTimer: ReturnType<typeof setInterval> | null = null

async function loadStatus(): Promise<void> {
  try {
    const res = await getDatabaseStatus()
    status.value = res.data
    activeDbName.value = res.data.active?.name || '未配置'
    activeConnId.value = res.data.active?.id || ''
  } catch {
    // 403（无 database_management 权限）/网络错误：状态带整条隐藏，不打断页面
  }
}

async function loadRunningMigration(): Promise<void> {
  try {
    const res = await getRunningTasks()
    runningMigration.value = res.data.migration
  } catch {
    // 403（无权限）/网络错误：状态带隐藏锁段即可，不打断页面
  }
}

onMounted(async () => {
  const [cs, rt] = await Promise.all([listConnections().catch(() => null), getRunningTasks().catch(() => null)])
  connections.value = cs?.data ?? []
  runningMigration.value = rt?.data?.migration ?? null
  await loadStatus()
  _bandPollTimer = setInterval(() => {
    void loadRunningMigration()
  }, 5000)
})

onUnmounted(() => {
  if (_bandPollTimer) {
    clearInterval(_bandPollTimer)
    _bandPollTimer = null
  }
})

// ── 9.2 迁移完成后就地切换：本页弹共享切换确认弹窗（预选迁移目标连接），
//    替代原「跳转数据库管理页再找连接」的纯导航行为 ──
const switchModalOpen = ref(false)
const switchTarget = ref<DbConnection | null>(null)
/** 切换成功后的重启指引横幅（页面内固定展示，直至用户关闭或刷新） */
const showRestartGuide = ref(false)

/** 卡片结果条「去切换数据库」：携带目标连接对象打开本页弹窗 */
function goSwitchTarget(connection: DbConnection): void {
  switchTarget.value = connection
  switchModalOpen.value = true
}

// 写操作错误统一分类（同 DatabaseManagement.vue extractWriteError 语义）：
// 有 response：4xx/5xx detail 中文直出，503 迁移锁补出口指引；无 response：网络异常。
function extractSwitchError(err: unknown): string {
  const resp = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  if (!resp) return '网络异常，请检查连接后重试'
  const detail = resp.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    if (resp.status === 503 && detail.includes('迁移')) {
      // 兼容后端新旧锁文案：新文案已含「数据迁移」页指引则直出，旧文案补一条出口指引
      return detail.includes('数据迁移') ? detail : `${detail}；迁移完成后自动恢复，进度可前往「数据迁移」页查看`
    }
    return detail
  }
  return `请求失败（HTTP ${resp.status ?? ''}）`
}

/** 弹窗内「确认切换」（弹窗不自关）：成功关弹窗 + 指引横幅 + 刷新 status；失败保持打开可重试 */
async function handleSwitchConfirm(): Promise<void> {
  const target = switchTarget.value
  if (!target) return
  try {
    const res = await switchDatabase(target.id)
    message.success(res.data?.message || '已切换，请手动重启后端服务')
    switchModalOpen.value = false
    showRestartGuide.value = true
    // 刷新 status：状态带随即展示新活动库与「待重启生效」黄标（迁移卡 G8 预选/禁用同步联动）
    await loadStatus()
  } catch (err: unknown) {
    message.error(extractSwitchError(err))
  }
}

function dismissRestartGuide(): void {
  showRestartGuide.value = false
}
</script>

<style scoped>
/* 页面容器只做纵向布局与间距（备份与容灾页同款派系；不设 padding，内容边界由布局层统一控制） */
.db-migration-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
/* 重启指引横幅中的命令以代码样式呈现（同 DatabaseManagement 重启提示） */
.restart-guide-banner code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
}
</style>
