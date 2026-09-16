<template>
  <div class="database-management">
    <PageHeader
      title="数据库管理"
      description="管理当前系统使用的数据库连接，支持 SQLite / PostgreSQL，提供连接测试、切换与单向快照迁移。"
    >
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加连接</button>
      </template>
    </PageHeader>

    <!-- 当前数据库状态卡片 -->
    <div class="card">
      <div class="card-header"><h3>当前数据库</h3></div>
      <div class="card-body">
        <div class="status-body">
          <template v-if="status?.active">
            <span class="status-dot online"></span>
            <div class="active-info">
              <div class="active-name">
                <a-tag :color="status.active.type === 'postgres' ? 'blue' : 'orange'">{{
                  status.active.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
                }}</a-tag>
                <span class="name">{{ status.active.name }}</span>
              </div>
              <div class="active-address">{{ status.active.display_address || status.active.host }}</div>
            </div>
          </template>
          <a-empty v-else description="未配置活动数据库" />
        </div>
      </div>
    </div>

    <!-- 连接列表 -->
    <div class="card">
      <div class="card-header">
        <h3>连接列表</h3>
        <button class="btn btn-primary btn-sm" @click="openCreateModal">+ 添加连接</button>
      </div>
      <div class="card-body table-body">
        <a-table
          :data-source="connections"
          :columns="connectionColumns"
          row-key="id"
          :pagination="false"
          class="connection-table"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'type'">
              <a-tag :color="record.type === 'postgres' ? 'blue' : 'orange'">{{
                record.type === 'postgres' ? 'PostgreSQL' : 'SQLite'
              }}</a-tag>
            </template>
            <template v-else-if="column.key === 'address'">
              <span>{{ record.display_address || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'username'">
              <span>{{ record.username || '-' }}</span>
            </template>
            <template v-else-if="column.key === 'current'">
              <span v-if="isActive(record)" class="badge badge-success">当前</span>
              <span v-else class="text-muted">-</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm test-conn-btn" @click="handleTest(record)">测试</button>
                <button
                  class="btn btn-sm set-current"
                  :class="isActive(record) ? 'btn-secondary' : 'btn-primary'"
                  :disabled="isActive(record)"
                  @click="openSwitchModal(record)"
                >
                  设为当前
                </button>
                <button class="btn btn-secondary btn-sm" @click="openEditModal(record)">编辑</button>
                <button class="btn btn-danger btn-sm delete-conn-btn" @click="handleDelete(record)">删除</button>
              </div>
            </template>
          </template>
        </a-table>
      </div>
    </div>

    <!-- 数据迁移 -->
    <div class="card">
      <div class="card-header">
        <h3>数据迁移</h3>
        <button class="btn btn-secondary btn-sm" @click="loadMigrationState" :disabled="migrationStateLoading">
          {{ migrationStateLoading ? '刷新中…' : '刷新' }}
        </button>
      </div>
      <div class="card-body">
        <!-- 迁移进行中 -->
        <a-alert
          v-if="runningMigration.in_progress"
          type="warning"
          show-icon
          class="migration-lock-alert"
          :message="`数据库迁移进行中${runningMigration.source_id && runningMigration.target_id ? '：' + getConnectionName(runningMigration.source_id) + ' → ' + getConnectionName(runningMigration.target_id) : ''}`"
          :description="runningMigration.started_at ? '开始时间：' + formatTime(runningMigration.started_at) : ''"
        />
        <!-- 迁移进度（从 API 恢复，非 SSE 实时） -->
        <div
          v-if="runningMigration.in_progress && !migrating && runningMigration.progress"
          class="migration-progress-detail"
        >
          <div v-if="runningMigration.progress.phase === 'backup'" class="progress-phase">
            <span class="phase-label">📦 备份中</span>
            <a-progress
              :percent="
                runningMigration.progress.backup_total > 0
                  ? Math.round((runningMigration.progress.backup_done / runningMigration.progress.backup_total) * 100)
                  : 0
              "
              :stroke-color="'#1890ff'"
            />
            <span class="progress-text"
              >{{ runningMigration.progress.backup_done }} / {{ runningMigration.progress.backup_total }} 张表</span
            >
          </div>
          <div v-else-if="runningMigration.progress.phase === 'migrating'" class="progress-phase">
            <span class="phase-label">🔄 迁移中</span>
            <a-progress
              :percent="
                runningMigration.progress.total_tables > 0
                  ? Math.round((runningMigration.progress.table_index / runningMigration.progress.total_tables) * 100)
                  : 0
              "
              :stroke-color="'#52c41a'"
            />
            <span class="progress-text">
              表 {{ runningMigration.progress.table_index }} / {{ runningMigration.progress.total_tables }}
              <span v-if="runningMigration.progress.current_table"
                >：{{ runningMigration.progress.current_table }}</span
              >
              <span v-if="runningMigration.progress.total_rows > 0"
                >（{{ runningMigration.progress.copied_rows?.toLocaleString() }} /
                {{ runningMigration.progress.total_rows?.toLocaleString() }} 行）</span
              >
              <a-tag v-if="runningMigration.progress.skipped" color="orange" style="margin-left: 4px">已跳过</a-tag>
            </span>
          </div>
        </div>
        <a-alert
          class="static-notice"
          type="info"
          show-icon
          message="静态资源文件存储于服务器磁盘，仅部署该文件的本机可访问；迁移/切换数据库不影响静态资源文件。"
        />
        <div class="migrate-flow">
          <div class="flow-main">
            <!-- 源 → 目标 可视化流转 -->
            <div class="flow-cards">
              <div class="flow-card">
                <div class="flow-card-label">源数据库</div>
                <select v-model="migrateForm.sourceId" class="form-input flow-select">
                  <option value="" disabled>选择源数据库</option>
                  <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div class="flow-arrow">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
              <div class="flow-card">
                <div class="flow-card-label">目标数据库</div>
                <select v-model="migrateForm.targetId" class="form-input flow-select">
                  <option value="" disabled>选择目标数据库</option>
                  <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>

            <!-- 选项卡片区（流向卡片右侧） -->
            <div class="flow-opts-cards">
              <div class="flow-card">
                <div class="flow-card-label">迁移模式</div>
                <select v-model="migrateForm.mode" class="form-input flow-select">
                  <option value="replace">替换（清空目标库）</option>
                </select>
              </div>
              <div class="flow-card">
                <div class="flow-card-label">超时时间</div>
                <select v-model.number="migrateForm.timeout" class="form-input flow-select" :disabled="migrating">
                  <option :value="60">1 分钟</option>
                  <option :value="180">3 分钟</option>
                  <option :value="300">5 分钟（默认）</option>
                  <option :value="600">10 分钟</option>
                  <option :value="1800">30 分钟</option>
                </select>
              </div>
              <div class="flow-card flow-card-checks">
                <label class="checkbox-label flow-checkbox">
                  <input type="checkbox" v-model="migrateForm.includeLogs" />
                  <span>包含日志数据</span>
                </label>
                <label class="checkbox-label confirm-check">
                  <input type="checkbox" v-model="migrateForm.confirmed_clear" />
                  <span>我了解将清空目标库</span>
                </label>
              </div>
              <button
                class="btn btn-primary migrate-btn"
                :disabled="migrating || !migrateForm.confirmed_clear"
                :title="migrateForm.confirmed_clear ? '' : '请先勾选「我了解将清空目标库」'"
                @click="handleMigrate"
              >
                {{ migrating ? '迁移中…' : '开始迁移' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="migrating" class="migrate-progress">
          <div v-if="migrationProgress.phase === 'backup'" class="progress-section">
            <div class="progress-header">正在备份源库…</div>
            <a-progress
              :percent="
                migrationProgress.backupTotal > 0
                  ? Math.round((migrationProgress.backupDone / migrationProgress.backupTotal) * 100)
                  : 0
              "
              status="active"
            />
            <span class="progress-text"
              >表 {{ migrationProgress.backupDone }} / {{ migrationProgress.backupTotal }}</span
            >
          </div>
          <div v-else-if="migrationProgress.phase === 'migrating'" class="progress-section">
            <div class="progress-header">
              正在迁移数据… 表 {{ migrationProgress.tableIndex }} / {{ migrationProgress.totalTables }}
            </div>
            <a-progress
              :percent="
                migrationProgress.totalTables > 0
                  ? Math.round((migrationProgress.tableIndex / migrationProgress.totalTables) * 100)
                  : 0
              "
              status="active"
            />
            <div class="progress-detail">
              <span v-if="migrationProgress.currentTable" class="progress-table">
                当前表：<strong>{{ migrationProgress.currentTable }}</strong>
                <template v-if="migrationProgress.skipped">（跳过：表不存在）</template>
              </span>
              <span v-if="migrationProgress.totalRows > 0" class="progress-rows">
                已迁移 {{ migrationProgress.copiedRows.toLocaleString() }} /
                {{ migrationProgress.totalRows.toLocaleString() }} 行
              </span>
            </div>
          </div>
          <div v-else class="progress-section">
            <a-progress :percent="0" status="active" />
            <span class="progress-text">正在准备迁移…</span>
          </div>
          <div class="migrate-cancel">
            <a-button danger size="small" @click="handleCancelMigration"> 终止迁移 </a-button>
          </div>
        </div>
        <!-- 迁移结果摘要条：完成后只占一行，明细收进抽屉（避免 22+ 张表明细把页面撑长） -->
        <div v-if="migrateResult" class="migrate-result-bar">
          <div class="result-main">
            <span class="result-badge">✓</span>
            <span class="result-text">{{ migrateResult.message }}</span>
            <span class="result-meta">
              {{ migrateResult.tables_migrated }} 张表<template v-if="migrateElapsed !== null">
                · 耗时 {{ migrateElapsed }} 秒</template
              ><template v-if="migrateResult.backup_path"> · 备份已保存</template>
            </span>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary btn-sm" @click="migrateDetailOpen = true">查看迁移详情</button>
            <button v-if="migrateTargetConnection" class="btn btn-primary btn-sm" @click="openSwitchForMigrateTarget">
              去切换数据库
            </button>
          </div>
        </div>

        <!-- 迁移详情抽屉：表明细在抽屉内滚动，不再撑长主页面 -->
        <a-drawer v-model:open="migrateDetailOpen" title="迁移详情" placement="right" :width="760">
          <a-descriptions :column="2" size="small" bordered class="migrate-desc">
            <a-descriptions-item label="源数据库">{{ getConnectionName(migrateForm.sourceId) }}</a-descriptions-item>
            <a-descriptions-item label="目标数据库">{{ migrateTargetName }}</a-descriptions-item>
            <a-descriptions-item label="迁移表数">{{ migrateResult?.tables_migrated ?? '-' }}</a-descriptions-item>
            <a-descriptions-item label="耗时">{{
              migrateElapsed !== null ? migrateElapsed + ' 秒' : '-'
            }}</a-descriptions-item>
            <a-descriptions-item label="备份路径" :span="2">
              <span class="backup-path">{{ migrateResult?.backup_path || '未生成备份' }}</span>
            </a-descriptions-item>
          </a-descriptions>

          <div v-if="migrateResult?.tables?.length" class="migrate-table-detail">
            <div class="next-steps-title">
              表明细（共 {{ migrateResult.tables.length }} 张：业务表 {{ businessTables.length }} · 日志表
              {{ logTables.length }}）
            </div>
            <div class="migrate-table-group">
              <div class="group-label">业务表（{{ businessTables.length }}）</div>
              <a-table
                :data-source="businessTables"
                :columns="migrateTableColumns"
                row-key="name"
                :pagination="false"
                :scroll="{ y: 320 }"
                size="small"
                class="migrate-detail-table"
              />
            </div>
            <div v-if="logTables.length" class="migrate-table-group">
              <div class="group-label">日志表（{{ logTables.length }}）</div>
              <a-table
                :data-source="logTables"
                :columns="migrateTableColumns"
                row-key="name"
                :pagination="false"
                :scroll="{ y: 200 }"
                size="small"
                class="migrate-detail-table"
              />
            </div>
            <div v-else class="migrate-log-hint">
              本次迁移未包含日志表（如需一并迁移日志数据，请勾选「包含日志数据」后重新执行）
            </div>
          </div>

          <div class="next-steps">
            <div class="next-steps-title">迁移成功，按以下步骤启用新数据库：</div>
            <ol class="next-steps-list">
              <li>
                在「连接列表」中找到 <strong>{{ migrateTargetName }}</strong
                >，点击「设为当前」
              </li>
              <li>在确认弹窗中点击「确认切换」，然后手动重启后端服务生效</li>
              <li>重启后刷新页面，「当前数据库」卡片应显示新数据库</li>
            </ol>
          </div>
        </a-drawer>
        <!-- 迁移历史 -->
        <div v-if="migrationHistory.length > 0" class="migration-history-section">
          <div class="history-header">
            <h4>历史迁移记录</h4>
            <span class="history-count">{{ migrationHistory.length }} 条</span>
          </div>
          <a-table
            :data-source="migrationHistory"
            :columns="historyColumns"
            row-key="id"
            :pagination="{
              total: migrationHistory.length,
              showTotal: (total: number) => `共 ${total} 条记录`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showQuickJumper: true,
            }"
            size="middle"
            class="migration-history-table"
          >
            <template #bodyCell="{ record, column }">
              <template v-if="column.key === 'direction'">
                <span class="history-flow">
                  <span class="flow-node flow-source" :title="connLabel(record.source_connection)">{{
                    connLabel(record.source_connection)
                  }}</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-node flow-target" :title="connLabel(record.target_connection)">{{
                    connLabel(record.target_connection)
                  }}</span>
                </span>
              </template>
              <template v-else-if="column.key === 'mode'">
                <span class="history-mode">{{ record.mode === 'replace' ? '替换' : record.mode }}</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="record.status === 'success' ? 'green' : record.status === 'failed' ? 'red' : 'default'">
                  {{ historyStatusLabel(record.status) }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'tables_count'">
                <span class="history-tables">{{ record.tables_count ?? '-' }}</span>
              </template>
              <template v-else-if="column.key === 'duration'">
                <span class="history-time">{{ formatDuration(record.duration_seconds) }}</span>
              </template>
              <template v-else-if="column.key === 'started_at'">
                <span class="history-time">{{ formatStartTime(record) }}</span>
              </template>
              <template v-else-if="column.key === 'created_at'">
                <span class="history-time">{{ record.created_at ? formatDateTime(record.created_at) : '-' }}</span>
              </template>
            </template>
          </a-table>
        </div>
      </div>
    </div>

    <!-- 连接编辑 Modal（新增/编辑 4.3） -->
    <div class="modal-overlay" :style="{ display: connModal.open ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ connModal.editing ? '编辑连接' : '添加连接' }}</h2>
          <button class="modal-close" @click="connModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">类型 <span class="required">*</span></label>
              <select v-model="connModal.form.type" class="form-input">
                <option value="sqlite">SQLite</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input v-model="connModal.form.name" type="text" class="form-input" placeholder="连接名称" />
            </div>
          </div>
          <template v-if="connModal.form.type === 'sqlite'">
            <div class="form-group">
              <label class="form-label">数据库文件路径</label>
              <input v-model="connModal.form.path" type="text" class="form-input" placeholder="/path/to/panshi.db" />
            </div>
          </template>
          <template v-else>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">主机 <span class="required">*</span></label>
                <input v-model="connModal.form.host" type="text" class="form-input" placeholder="localhost" />
              </div>
              <div class="form-group">
                <label class="form-label">端口</label>
                <input
                  v-model.number="connModal.form.port"
                  type="number"
                  class="form-input"
                  placeholder="5432"
                  min="1"
                  max="65535"
                />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">数据库名 <span class="required">*</span></label>
                <input v-model="connModal.form.database" type="text" class="form-input" placeholder="panshi" />
              </div>
              <div class="form-group">
                <label class="form-label">用户名</label>
                <input v-model="connModal.form.username" type="text" class="form-input" placeholder="postgres" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input
                v-model="connModal.form.password"
                type="password"
                class="form-input"
                placeholder="如需修改请输入"
                autocomplete="new-password"
              />
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="connModal.open = false">取消</button>
          <button class="btn btn-secondary" @click="handleTestDraft">测试连接</button>
          <button class="btn btn-primary save-conn-btn" @click="handleSaveConnection">保存</button>
        </div>
      </div>
    </div>

    <!-- 切换确认 Modal（4.4） -->
    <div class="modal-overlay" :style="{ display: switchModal.open ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 480px">
        <div class="modal-header">
          <h2>切换数据库</h2>
          <button class="modal-close" @click="switchModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="switch-body">
            <a-alert
              type="warning"
              show-icon
              message="切换后需手动重启后端服务方可生效，期间 JWT 会话保持不变。目标库为空时仅保留 admin 账号，其余会话将失效。"
            />
            <div class="switch-restart-hint">
              重启方式：开发环境运行 <code>develop/linux/start.sh</code>；生产环境执行
              <code>sh stop.sh; sh start.sh</code>。
            </div>
            <div class="switch-target">
              <span>切换至：</span>
              <strong>{{ switchModal.connection?.name }}</strong>
              <span class="muted">{{ switchModal.connection?.display_address }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="switchModal.open = false">取消</button>
          <button class="btn btn-primary switch-confirm-btn" @click="handleSwitch">确认切换</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { formatDateTime, parseBackendDate } from '@/utils/format'
import {
  getDatabaseStatus,
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  switchDatabase,
  migrateDatabaseStream,
  getMigrationHistory,
  getRunningTasks,
} from '@/api/database'
import type {
  DbConnection,
  DbStatus,
  MigrateResult,
  MigrationCompleteEvent,
  MigrationHistoryItem,
  MigrationState,
} from '@/types/database'

const status = ref<DbStatus | null>(null)
const connections = ref<DbConnection[]>([])
const migrating = ref(false)
const migrateResult = ref<MigrateResult | null>(null)
/** 迁移详情抽屉开关（完成后默认收起，避免页面被明细撑长） */
const migrateDetailOpen = ref(false)
/** 本次迁移的起始时间与耗时（仅前端计时；完成事件本身不含 duration） */
const migrateStartedAt = ref<number | null>(null)
const migrateElapsed = ref<number | null>(null)
const migrationController = ref<AbortController | null>(null)

// Running migration state
const runningMigration = ref<MigrationState>({
  in_progress: false,
  source_id: null,
  target_id: null,
  started_at: null,
  progress: null,
})
const migrationStateLoading = ref(false)

// Migration history
const migrationHistory = ref<MigrationHistoryItem[]>([])
const historyLoading = ref(false)

const connectionColumns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '类型', key: 'type' },
  { title: '地址', key: 'address' },
  { title: '用户名', key: 'username' },
  { title: '当前', key: 'current' },
  { title: '操作', key: 'actions' },
]

function getConnectionName(connId: string): string {
  return connections.value.find((c) => c.id === connId)?.name || connId
}

// 迁移历史用友好标签：连接名（SQLite 文件名 / PG 地址），连接已删除时回退原始 ID
function connLabel(connId: string): string {
  const c = connections.value.find((x) => x.id === connId)
  if (!c) return connId
  const detail =
    c.type === 'sqlite'
      ? (c.path || '').split('/').pop() || ''
      : c.display_address || (c.host ? `${c.host}${c.port ? ':' + c.port : ''}` : '')
  return detail ? `${c.name}（${detail}）` : c.name
}

const historyColumns = [
  { title: '迁移方向', key: 'direction' },
  { title: '模式', key: 'mode', width: 90 },
  { title: '状态', key: 'status', width: 90 },
  { title: '表数量', key: 'tables_count', width: 90, align: 'right' as const },
  { title: '时长', key: 'duration', width: 100, align: 'right' as const },
  { title: '开始时间', key: 'started_at', width: 160 },
  { title: '完成时间', key: 'created_at', width: 160 },
]

function historyStatusLabel(status: string): string {
  const labels: Record<string, string> = { success: '成功', failed: '失败', cancelled: '已取消' }
  return labels[status] || status
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '-'
  if (seconds < 60) return `${seconds} 秒`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`
  const h = Math.floor(m / 60)
  return `${h} 时 ${m % 60} 分`
}

// 开始时间：优先后端记录值；旧记录无 started_at 时回退「完成时间 − 时长」推导，均无则 '-'
function formatStartTime(record: MigrationHistoryItem): string {
  if (record.started_at) return formatDateTime(record.started_at)
  if (record.created_at && record.duration_seconds != null) {
    const end = parseBackendDate(record.created_at).getTime()
    if (!Number.isNaN(end)) {
      return formatDateTime(new Date(end - record.duration_seconds * 1000).toISOString())
    }
  }
  return '-'
}

function formatTime(iso: string): string {
  return formatDateTime(iso)
}

const migrateForm = reactive({
  sourceId: '',
  targetId: '',
  mode: 'replace',
  includeLogs: true,
  confirmed_clear: false,
  timeout: 300,
})

// SSE progress state
const migrationProgress = reactive({
  active: false,
  phase: '' as 'backup' | 'migrating' | '',
  backupDone: 0,
  backupTotal: 0,
  tableIndex: 0,
  totalTables: 0,
  currentTable: '',
  copiedRows: 0,
  totalRows: 0,
  skipped: false,
})

const migrateTargetName = computed(
  () => connections.value.find((c) => c.id === migrateForm.targetId)?.name || '目标数据库',
)

/** 本次迁移的目标连接对象（用于结果条上的「去切换数据库」一键操作） */
const migrateTargetConnection = computed(() => connections.value.find((c) => c.id === migrateForm.targetId) || null)

/** 直接复用既有切换确认弹窗，省掉"去连接列表里找目标 → 点设为当前"两步 */
function openSwitchForMigrateTarget() {
  if (migrateTargetConnection.value) openSwitchModal(migrateTargetConnection.value)
}

const migrateTableColumns = [
  { title: '表名', dataIndex: 'name', key: 'name' },
  { title: '字段数', dataIndex: 'columns', key: 'columns' },
  { title: '迁移行数', dataIndex: 'rows', key: 'rows' },
]

/** 迁移明细按日志表分组（is_log 由后端标记），让用户一眼看出哪些是日志表 */
const businessTables = computed(() => (migrateResult.value?.tables || []).filter((t) => !t.is_log))
const logTables = computed(() => (migrateResult.value?.tables || []).filter((t) => t.is_log))

interface ConnForm {
  type: 'sqlite' | 'postgres'
  name: string
  path: string
  host: string
  port: number | null
  database: string
  username: string
  password: string
  ssl: boolean
}

const connModal = reactive<{
  open: boolean
  editing: boolean
  editingId: string | null
  form: ConnForm
}>({
  open: false,
  editing: false,
  editingId: null,
  form: emptyForm(),
})

const switchModal = reactive<{ open: boolean; connection: DbConnection | null }>({
  open: false,
  connection: null,
})

function emptyForm(): ConnForm {
  return {
    type: 'sqlite',
    name: '',
    path: '',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    ssl: false,
  }
}

// 原生 number 输入清空时得到 ''，统一归一化为 null（后端 Optional[int]）
function normalizePort(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isActive(record: DbConnection): boolean {
  return status.value?.active?.id === record.id
}

async function loadData() {
  const [s, cs] = await Promise.all([getDatabaseStatus(), listConnections()])
  status.value = s.data
  connections.value = cs.data
}

async function loadMigrationState() {
  const wasInProgress = runningMigration.value.in_progress
  migrationStateLoading.value = true
  try {
    const res = await getRunningTasks()
    runningMigration.value = res.data.migration
    // 迁移刚结束时自动刷新历史记录
    if (wasInProgress && !res.data.migration.in_progress) {
      loadMigrationHistory()
    }
  } finally {
    migrationStateLoading.value = false
  }
}

async function loadMigrationHistory() {
  historyLoading.value = true
  try {
    const res = await getMigrationHistory()
    migrationHistory.value = res.data
  } finally {
    historyLoading.value = false
  }
}

function openCreateModal() {
  connModal.editing = false
  connModal.editingId = null
  connModal.form = emptyForm()
  connModal.open = true
}

function openEditModal(record: DbConnection) {
  connModal.editing = true
  connModal.editingId = record.id
  connModal.form = {
    type: record.type,
    name: record.name,
    path: record.path || '',
    host: record.host || '',
    port: record.port ?? 5432,
    database: record.database || '',
    username: record.username || '',
    password: '',
    ssl: record.ssl ?? false,
  }
  connModal.open = true
}

async function handleTestDraft() {
  // Test the draft connection using its raw fields is not supported by API (test needs a saved id).
  // Validate name before allowing persistence.
  if (!connModal.form.name.trim()) {
    message.error('请输入连接名称')
    return
  }
  message.info('请先保存连接，再点击「测试」验证连接可用性')
}

async function handleSaveConnection() {
  if (!connModal.form.name.trim()) {
    message.error('请输入连接名称')
    return
  }
  if (connModal.editing) {
    await updateConnection(connModal.editingId!, {
      name: connModal.form.name,
      path: connModal.form.type === 'sqlite' ? connModal.form.path : null,
      host: connModal.form.type === 'postgres' ? connModal.form.host : null,
      port: connModal.form.type === 'postgres' ? normalizePort(connModal.form.port) : null,
      database: connModal.form.type === 'postgres' ? connModal.form.database : null,
      username: connModal.form.type === 'postgres' ? connModal.form.username : null,
      password: connModal.form.password || null,
      ssl: connModal.form.type === 'postgres' ? connModal.form.ssl : null,
    })
    message.success('连接已更新')
  } else {
    await createConnection({
      type: connModal.form.type,
      name: connModal.form.name,
      path: connModal.form.type === 'sqlite' ? connModal.form.path : null,
      host: connModal.form.type === 'postgres' ? connModal.form.host : null,
      port: connModal.form.type === 'postgres' ? normalizePort(connModal.form.port) : null,
      database: connModal.form.type === 'postgres' ? connModal.form.database : null,
      username: connModal.form.type === 'postgres' ? connModal.form.username : null,
      password: connModal.form.password || null,
      ssl: connModal.form.type === 'postgres' ? connModal.form.ssl : false,
    })
    message.success('连接已添加')
  }
  connModal.open = false
  await loadData()
}

async function handleTest(record: DbConnection) {
  const res = await testConnection(record.id)
  if (res.data.success) {
    message.success(res.data.detail)
  } else {
    message.error(res.data.detail)
  }
}

function openSwitchModal(record: DbConnection) {
  switchModal.connection = record
  switchModal.open = true
}

async function handleSwitch() {
  const target = switchModal.connection!
  const res = await switchDatabase(target.id)
  message.success(res.data?.message || '已切换，请手动重启后端服务')
  switchModal.open = false
  await loadData()
}

async function handleDelete(record: DbConnection) {
  showOverlayModal({
    title: '删除连接',
    content: `确定删除数据库连接「${record.name}」？该操作仅删除配置，不影响数据库本身。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      await deleteConnection(record.id)
      message.success('连接已删除')
      await loadData()
    },
  })
}

async function handleMigrate() {
  if (!migrateForm.sourceId || !migrateForm.targetId) {
    message.error('请选择源数据库与目标数据库')
    return
  }
  if (migrateForm.sourceId === migrateForm.targetId) {
    message.error('源数据库与目标数据库不能相同')
    return
  }
  if (!migrateForm.confirmed_clear) {
    message.error('请先勾选「我了解将清空目标库」')
    return
  }
  if (runningMigration.value.in_progress || migrating.value) {
    message.warning('数据库迁移正在进行中，请等待当前迁移完成后再试')
    return
  }
  migrating.value = true
  migrateResult.value = null
  migrateDetailOpen.value = false
  migrateStartedAt.value = Date.now()
  migrateElapsed.value = null
  loadMigrationState()

  // Reset progress state
  Object.assign(migrationProgress, {
    active: true,
    phase: '',
    backupDone: 0,
    backupTotal: 0,
    tableIndex: 0,
    totalTables: 0,
    currentTable: '',
    copiedRows: 0,
    totalRows: 0,
    skipped: false,
  })

  const sseController = migrateDatabaseStream(migrateForm.sourceId, migrateForm.targetId, {
    mode: migrateForm.mode,
    includeLogs: migrateForm.includeLogs,
    confirmedClear: migrateForm.confirmed_clear,
    timeout: migrateForm.timeout,
    onBackupProgress: (data) => {
      migrationProgress.phase = 'backup'
      migrationProgress.backupDone = data.done
      migrationProgress.backupTotal = data.total
    },
    onBackupComplete: () => {
      migrationProgress.phase = 'migrating'
    },
    onProgress: (data) => {
      migrationProgress.phase = 'migrating'
      migrationProgress.tableIndex = data.table_index
      migrationProgress.totalTables = data.total_tables
      migrationProgress.currentTable = data.table_name || ''
      migrationProgress.copiedRows = data.copied_rows || 0
      migrationProgress.totalRows = data.total_rows || 0
      migrationProgress.skipped = data.skipped || false
    },
    onComplete: (data: MigrationCompleteEvent) => {
      migrateResult.value = {
        message: data.message,
        tables_migrated: data.tables_migrated,
        tables: data.tables,
        backup_path: data.backup_path ?? '',
      }
      // 耗时仅用于摘要条/详情展示；后端完成事件不含 duration，故前端计时
      migrateElapsed.value =
        migrateStartedAt.value === null ? null : Math.round((Date.now() - migrateStartedAt.value) / 1000)
      message.success(`迁移完成，共迁移 ${data.tables_migrated} 张表`)
      getMigrationHistory()
      loadMigrationHistory()
      migrating.value = false
    },
    onError: (msg) => {
      message.error(msg || '迁移失败')
      migrating.value = false
    },
  })

  // Store controller for cancellation
  migrationController.value = sseController
}

function handleCancelMigration() {
  if (migrationController.value) {
    migrationController.value.abort()
    migrationController.value = null
  }
  migrating.value = false
  migrationProgress.active = false
  message.warning('迁移已终止')
}

// Auto-refresh polling for migration state (every 5 seconds)
let _migrationPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadData()
  loadMigrationState()
  loadMigrationHistory()
  _migrationPollTimer = setInterval(loadMigrationState, 5000)
})

onUnmounted(() => {
  if (_migrationPollTimer) {
    clearInterval(_migrationPollTimer)
    _migrationPollTimer = null
  }
})

defineExpose({
  migrateForm,
  migrateResult,
  migrating,
  connModal,
  switchModal,
  openCreateModal,
  handleMigrate,
  handleSaveConnection,
  handleTestDraft,
  handleTest,
  handleSwitch,
  handleDelete,
  loadMigrationState,
  runningMigration,
})
</script>

<style scoped>
.database-management {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 当前数据库 ── */
.status-body {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.active-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.active-name .name {
  font-size: 15px;
  font-weight: 600;
}
.active-address {
  color: var(--muted);
  font-size: 13px;
  margin-top: 2px;
}

/* ── 连接列表表格（与列表页 table-container 口径一致） ── */
.table-body {
  padding: 0;
}
.connection-table :deep(.ant-table) {
  background: transparent;
}
.connection-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 8px 14px;
}
.connection-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.connection-table :deep(.ant-table-tbody > tr > td) {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
}
.connection-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none;
}
.connection-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg);
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── 数据迁移 · 可视化流转 ── */
.migrate-flow {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 160px;
  padding-bottom: 8px;
}
.flow-main {
  display: flex;
  align-items: stretch;
  gap: 24px;
}
.flow-cards {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.flow-opts-cards {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: 20px;
  padding-left: 20px;
  border-left: 1px solid var(--border);
}
.flow-card {
  min-width: 160px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.flow-card-checks {
  min-width: auto;
  gap: 10px;
}
.flow-card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.flow-select {
  width: 100%;
}
.flow-arrow {
  color: var(--muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.flow-checkbox {
  padding-bottom: 0;
}
.flow-actions {
  display: none;
}
.migrate-btn {
  align-self: center;
  white-space: nowrap;
}
.confirm-check {
  font-size: 13px;
  color: var(--danger, #ff4d4f);
}
.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  accent-color: var(--accent);
}
.migrate-progress {
  margin-top: 16px;
  max-width: 640px;
}
.migrate-cancel {
  margin-top: 12px;
}
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-header {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.progress-text {
  font-size: 13px;
  color: var(--muted);
}
.progress-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.progress-table strong {
  color: var(--text);
}
.progress-rows {
  font-variant-numeric: tabular-nums;
}
.static-notice {
  margin-bottom: 16px;
}
/* 迁移结果摘要条：完成后只占一行，明细在抽屉里 */
.migrate-result-bar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  background: #f6ffed;
}
.result-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.result-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #52c41a;
  color: #fff;
  font-size: 12px;
  flex-shrink: 0;
}
.result-text {
  font-size: 13px;
  font-weight: 600;
}
.result-meta {
  font-size: 12px;
  color: var(--muted);
}
.result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.migrate-desc {
  margin-bottom: 16px;
}
.next-steps {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--card-bg, #fff);
}
.next-steps-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.next-steps-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ── 切换确认弹窗内容 ── */
.switch-restart-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}
.switch-restart-hint code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
}
.switch-target {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.switch-target .muted {
  color: var(--muted);
}

/* ── 迁移详情 ── */
.migrate-table-detail {
  margin-top: 12px;
}
.migrate-table-group {
  margin-top: 12px;
}
.group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 6px;
}
.migrate-log-hint {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  font-size: 12px;
  color: var(--muted);
}
.migrate-detail-table {
  margin-top: 6px;
}
.backup-path {
  color: var(--muted);
  font-family: monospace;
  font-size: 12px;
}

/* ── 迁移锁警告 ── */
.migration-lock-alert {
  margin-bottom: 12px;
}

/* ── 迁移进度详情（API 恢复） ── */
.migration-progress-detail {
  margin-bottom: 12px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
}
.progress-phase {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.phase-label {
  font-weight: 600;
  font-size: 13px;
}
.migration-progress-detail .progress-text {
  font-size: 12px;
  color: #666;
}

/* ── 迁移历史 ── */
.migration-history-section {
  margin-top: 24px;
}
.history-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid oklch(56% 0.16 210);
}
.history-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.history-count {
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  border-radius: 999px;
  padding: 3px 9px;
}
.history-flow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.flow-node {
  font-family: monospace;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  white-space: nowrap;
}
.flow-source {
  background: oklch(55% 0.01 250 / 8%);
  color: var(--muted);
}
.flow-target {
  background: oklch(56% 0.16 210 / 12%);
  color: oklch(45% 0.13 210);
  font-weight: 600;
}
.flow-arrow {
  color: var(--muted);
  font-size: 12px;
}
.history-mode {
  font-size: 12px;
  color: var(--muted);
  background: oklch(55% 0.01 250 / 8%);
  border-radius: 4px;
  padding: 2px 8px;
}
.history-tables {
  font-family: monospace;
  font-weight: 600;
}
.history-time {
  font-family: monospace;
  font-size: 12px;
  color: var(--muted);
}
.migration-history-table :deep(.ant-table) {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.migration-history-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 8px 14px;
}
.migration-history-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.migration-history-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.migration-history-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}
.migration-history-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}
</style>
