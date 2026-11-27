<template>
  <a-drawer :open="open" title="迁移详情" placement="right" :width="760" @update:open="$emit('update:open', $event)">
    <!-- 概要四格 + 备份路径通栏（.mig-desc 解剖单点 = style.css；数据全部来自 props） -->
    <div class="mig-desc">
      <div class="k">源数据库</div>
      <div>{{ sourceName }}</div>
      <div class="k">目标数据库</div>
      <div>{{ targetName }}</div>
      <div class="k">迁移表数</div>
      <div class="c-mono">{{ tablesCount ?? '-' }}</div>
      <div class="k">耗时</div>
      <div class="c-mono">{{ durationText }}</div>
      <div class="k">备份路径</div>
      <div class="wide c-mono">{{ backupPath || '未生成备份' }}</div>
    </div>

    <div v-if="tables.length" class="migrate-table-detail">
      <div class="next-steps-title">
        表明细（共 {{ tables.length }} 张：业务表 {{ businessTables.length }} · 审计与导入日志
        {{ auditLogTables.length }} · 任务日志 {{ taskLogTables.length }}）
      </div>
      <div class="migrate-table-group">
        <div class="group-label">业务表（{{ businessTables.length }}）</div>
        <a-table
          :data-source="businessTables"
          :columns="tableColumns"
          row-key="name"
          :pagination="false"
          :scroll="{ x: 520 }"
          :table-layout="'fixed'"
          size="small"
          class="migrate-detail-table grid-table"
        />
      </div>
      <div v-if="auditLogTables.length" class="migrate-table-group">
        <div class="group-label">审计与导入日志（{{ auditLogTables.length }}）</div>
        <a-table
          :data-source="auditLogTables"
          :columns="tableColumns"
          row-key="name"
          :pagination="false"
          :scroll="{ x: 520 }"
          :table-layout="'fixed'"
          size="small"
          class="migrate-detail-table grid-table"
        />
      </div>
      <div v-if="taskLogTables.length" class="migrate-table-group">
        <div class="group-label">任务日志（{{ taskLogTables.length }}）</div>
        <a-table
          :data-source="taskLogTables"
          :columns="tableColumns"
          row-key="name"
          :pagination="false"
          :scroll="{ x: 520 }"
          :table-layout="'fixed'"
          size="small"
          class="migrate-detail-table grid-table"
        />
      </div>
      <div v-if="!auditLogTables.length && !taskLogTables.length" class="migrate-log-hint">
        本次迁移未包含日志表（如需一并迁移日志数据，请勾选「包含日志数据」后重新执行）
      </div>
    </div>

    <div class="next-steps">
      <div class="next-steps-title">迁移成功，按以下步骤启用新数据库：</div>
      <ol class="next-steps-list">
        <li>
          在「连接列表」中找到 <strong>{{ targetName }}</strong
          >，点击「设为当前」
        </li>
        <li>在确认弹窗中点击「确认切换」，然后手动重启后端服务生效</li>
        <li>重启后刷新页面，「当前数据库」卡片应显示新数据库</li>
      </ol>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MigrateTableDetail } from '@/types/database'

/**
 * 迁移详情共享抽屉（db-migration-history-detail D4）：迁移完成态（DbMigrationCard 结果条）
 * 与历史回看（DbMigrationHistoryCard 行展开入口）共用唯一实现——
 * 视图模型全部经 props 传入，调用方各自装配数据源（实时 SSE 事件 / 历史记录接口）。
 * 耗时收展示文案（实时态=前端计时、历史态=记录 duration_seconds，格式化归调用方）。
 */
const props = defineProps<{
  open: boolean
  sourceName: string
  targetName: string
  tablesCount: number | null
  /** 已格式化的耗时展示文案（如「34 秒」） */
  durationText: string
  backupPath: string
  tables: MigrateTableDetail[]
}>()

defineEmits<{ (e: 'update:open', value: boolean): void }>()

/** 迁移明细按表类型分三组（kind 由后端标记），让用户分清业务表与两类日志表 */
const businessTables = computed(() => props.tables.filter((t) => t.kind !== 'audit_log' && t.kind !== 'task_log'))
const auditLogTables = computed(() => props.tables.filter((t) => t.kind === 'audit_log'))
const taskLogTables = computed(() => props.tables.filter((t) => t.kind === 'task_log'))

const tableColumns = [
  { title: '表名', dataIndex: 'name', key: 'name', width: 260 },
  { title: '列数', dataIndex: 'columns', key: 'columns', width: 110 },
  { title: '行数', dataIndex: 'rows', key: 'rows', width: 110 },
]
</script>

<style scoped>
.mig-desc {
  margin-bottom: 16px;
}
.mig-desc > div.wide {
  word-break: break-all;
}
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
  border-radius: var(--radius-md, 6px);
  background: oklch(50% 0.018 240 / 4%);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
}
.migrate-detail-table {
  margin-top: 6px;
}
.next-steps {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 6px);
  background: var(--bg);
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
</style>
