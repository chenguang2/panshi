<template>
  <!-- 切换数据库确认弹窗（db-migration-ux-optimization D6：从 DatabaseManagement.vue 提取的共享组件）。
       视图级内联弹窗（AGENTS.md #25 三层制）：手写 modal-overlay 风格，数据全走 props/events，
       不依赖任何页面本地状态，供数据库管理页与迁移页复用。 -->
  <div class="modal-overlay switch-connection-modal" :style="{ display: open ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 480px">
      <div class="modal-header">
        <h2>切换数据库</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
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
            <strong>{{ connection?.name }}</strong>
            <span class="muted">{{ connection?.display_address }}</span>
          </div>
          <div v-if="activeName" class="switch-current">
            <span>当前活动库：</span>
            <strong>{{ activeName }}</strong>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary switch-confirm-btn" @click="handleConfirm">确认切换</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DbConnection } from '@/types/database'

defineProps<{
  /** 弹窗开关（v-model:open） */
  open: boolean
  /** 目标连接（打开前置由父级保证：当前活动连接不应触发切换） */
  connection: DbConnection | null
  /** 当前活动库名（可选；迁移页复用场景展示「从哪切到哪」，不传不渲染该行） */
  activeName?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 确认切换：父级执行 switchDatabase，成功后自行关闭（失败时弹窗保持打开） */
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

// #25：模板内多语句会触发 prettier 重排陷阱，handler 一律提取为 script 函数
function handleCancel() {
  emit('update:open', false)
  emit('cancel')
}

function handleConfirm() {
  emit('confirm')
}
</script>

<style scoped>
/* ── 切换确认弹窗内容（自 DatabaseManagement.vue 原样迁移） ── */
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
.switch-current {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
</style>
