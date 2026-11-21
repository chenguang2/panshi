<template>
  <div class="node-status-cell" :class="variant === 'page' ? 'is-page' : 'is-panel'">
    <!-- 面板（central.html .pub-cell）：两枚**无圆点** .ps-tag —— 管理开关态 + 运行态并列 -->
    <template v-if="variant === 'panel'">
      <span v-if="!enabled" class="ps-tag ps-unpub" title="管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询"
        >已禁用</span
      >
      <span v-else class="ps-tag ps-pub" title="管理开关：已启用">已启用</span>
      <span v-if="runtime === 'running'" class="ps-tag ps-pub" title="运行态：在线（Edge 进程运行中）">在线</span>
      <span v-else-if="runtime === 'stopped'" class="ps-tag ps-partial" title="运行态：离线（Edge 进程已停止）"
        >离线</span
      >
      <span v-else class="ps-tag ps-unpub" title="运行态：未检测">未检测</span>
    </template>

    <!-- 页面（nodes.html）：BadgeStatus 两行封顶（胶囊行 + 检测时间行），与 NodeList.vue 一致 -->
    <template v-else>
      <div class="nsc-row">
        <BadgeStatus
          v-if="!enabled"
          text="已禁用"
          status="disabled"
          title="管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询"
        />
        <BadgeStatus v-if="runtime === 'running'" text="运行中" status="online" />
        <BadgeStatus v-else-if="runtime === 'stopped'" text="已停止" status="offline" />
        <BadgeStatus v-else text="未检测" status="neutral" />
      </div>
    </template>

    <!-- 检测时效：无 last_execution 时调用方不传 execText（不渲染） -->
    <span v-if="execText" class="status-exec-time" :class="{ 'is-page': variant === 'page' }">{{ execText }}</span>
  </div>
</template>

<script setup lang="ts">
import BadgeStatus from '@/components/BadgeStatus.vue'

/**
 * 节点状态格（纯展示）——两种既有渲染形态的二选一：
 *
 * · `panel`：旧最大化面板（ClusterNodes.vue，2026-11-21 已删除）的双 `.ps-tag` 无圆点形态：
 *   管理开关（已启用 `ps-pub` / 已禁用 `ps-unpub`）+ 运行态（在线/离线/未检测）。
 *   面板现直接渲染 NodeList 的 scoped 形态（两处均为 `page` 变体），panel 变体仅留向后兼容。
 * · `page`：节点独立页（NodeList.vue）`BadgeStatus`，只在管理开关关闭时多一枚
 *   「已禁用」虚线胶囊，运行态三态互斥。
 *
 * `execText` 是**完整文案**（调用方传 `${formatRelativeTime(x)}检测`），组件不拼后缀。
 */
withDefaults(
  defineProps<{
    /** 渲染形态：面板双胶囊 / 页面 BadgeStatus 两行 */
    variant?: 'panel' | 'page'
    /** 管理开关（节点 `status === 1`） */
    enabled?: boolean
    /** 运行态（由 `nginxState` 归一后传入） */
    runtime?: 'running' | 'stopped' | 'unknown'
    /** 检测时效文案（如「3 分钟前检测」）；缺省不渲染 */
    execText?: string
  }>(),
  { variant: 'panel', enabled: true, runtime: 'unknown', execText: undefined },
)
</script>

<style scoped>
/* 面板解剖（= 旧 ClusterNodes 的 .node-status-cell：并排 + gap 6 + 可折行；现仅向后兼容） */
.node-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* 页面解剖（= NodeList 的 .status-cell：纵向两行、左对齐、gap 3） */
.node-status-cell.is-page {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.nsc-row {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

.status-exec-time {
  font-size: 12px;
  color: var(--muted);
}

/* 页面侧检测时间为 11px + 不折行（NodeList .exec-time），与面板 12px 有意不同 */
.status-exec-time.is-page {
  font-size: 11px;
  white-space: nowrap;
}
</style>
