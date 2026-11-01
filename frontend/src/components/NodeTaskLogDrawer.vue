<template>
  <Teleport to="body">
    <div v-if="open && item" class="ntd-drawer-mask" @click.self="$emit('close')">
      <aside class="ntd-drawer" :style="{ width: width + 'px' }" data-test="log-drawer" role="dialog">
        <!-- 拖拽把手：向左拖加宽（不引入第三方分栏组件） -->
        <div class="ntd-drawer-handle" data-test="log-drawer-handle" @mousedown.prevent="startDrag"></div>

        <header class="ntd-drawer-head">
          <div class="ntd-drawer-title">
            <h2>节点日志 · {{ item.ip }}</h2>
            <span class="ntd-drawer-sub">
              {{ taskTypeLabel }}
              <template v-if="attemptCount > 0"> · 已重试 {{ attemptCount }} 次</template>
            </span>
          </div>
          <button type="button" class="modal-close" aria-label="关闭" @click="$emit('close')">&times;</button>
        </header>

        <div class="ntd-drawer-tools">
          <button type="button" class="btn btn-secondary btn-sm" data-test="download-log" @click="download">
            下载本次日志
          </button>
          <select
            v-if="attemptCount > 0"
            v-model.number="attempt"
            class="form-input ntd-attempt"
            data-test="attempt-select"
            aria-label="查看历史尝试"
          >
            <option :value="0">本次日志</option>
            <option v-for="n in attemptCount" :key="n" :value="n">第 {{ n }} 次</option>
          </select>
          <span v-if="active" class="ntd-live-badge">实时</span>
        </div>

        <div class="ntd-drawer-body">
          <div v-if="empty" class="ntd-log-empty">该任务没有执行日志（历史任务或未产生输出）</div>
          <NodeTaskLogViewer
            v-else
            :logs="active ? liveLines : []"
            :stdout="staticLog || item.stdout || ''"
            :stderr="item.stderr || ''"
            :command="item.command || ''"
          />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import NodeTaskLogViewer from '@/components/NodeTaskLogViewer.vue'
import { downloadTaskItemLog, fetchTaskItemLog, type NodeTaskItemData } from '@/composables/useNodeTasks'

/**
 * 节点日志抽屉（node-task-ux-optimization 7.3）
 *
 * 720px 起始宽、左缘可拖拽；内容复用既有 NodeTaskLogViewer 四页签，不重写日志渲染。
 * 任务运行中展示实时行（由 useNodeTaskStream 提供），终态时按需拉静态日志 / 历史尝试。
 */
const props = defineProps<{
  open: boolean
  taskId: number
  item: NodeTaskItemData | null
  /** 任务是否仍在执行（决定是否用实时行、是否拉静态日志） */
  active: boolean
  /** 实时日志行（来自 useNodeTaskStream） */
  liveLines: string[]
  taskTypeLabel?: string
}>()

defineEmits<{ close: [] }>()

const MIN_WIDTH = 420
const DEFAULT_WIDTH = 720

const width = ref(DEFAULT_WIDTH)
const attempt = ref(0)
const staticLog = ref('')

const attemptCount = computed(() => Math.max(0, props.item?.attempt ?? 0))

const empty = computed(() => {
  if (!props.item) return false
  const hasLive = props.active && props.liveLines.length > 0
  return (
    !hasLive &&
    !staticLog.value &&
    !props.item.stdout &&
    !props.item.stderr &&
    !props.item.command &&
    (props.item.logs || []).length === 0
  )
})

function clampWidth(px: number): number {
  const max = typeof window === 'undefined' ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, window.innerWidth - 120)
  return Math.min(Math.max(px, MIN_WIDTH), max)
}

function startDrag(e: MouseEvent) {
  const startX = e.clientX
  const startWidth = width.value
  const onMove = (ev: MouseEvent) => {
    width.value = clampWidth(startWidth + (startX - ev.clientX))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

async function loadStaticLog() {
  staticLog.value = ''
  if (!props.open || !props.item || props.active) return
  try {
    staticLog.value = await fetchTaskItemLog(props.taskId, props.item.node_id, {
      attempt: attempt.value > 0 ? attempt.value : undefined,
    })
  } catch {
    staticLog.value = ''
  }
}

/** 每次打开都回到「本次日志」，避免沿用上一个节点的历史尝试选择 */
watch(
  () => props.open,
  (open) => {
    if (open) attempt.value = 0
  },
)

watch(
  () => [props.open, props.item?.node_id, props.active, attempt.value],
  () => {
    void loadStaticLog()
  },
  { immediate: true },
)

async function download() {
  if (!props.item) return
  try {
    await downloadTaskItemLog(props.taskId, props.item.node_id, attempt.value > 0 ? attempt.value : undefined)
  } catch {
    message.error('日志下载失败')
  }
}
</script>

<style scoped>
.ntd-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: flex-end;
  background: oklch(0% 0 0 / 30%);
}

.ntd-drawer {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  height: 100%;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.ntd-drawer-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.15s;
}

.ntd-drawer-handle:hover {
  background: var(--accent-bg);
}

.ntd-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.ntd-drawer-title h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}

.ntd-drawer-sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

.ntd-drawer-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.ntd-attempt {
  width: 130px;
  height: 28px;
  font-size: 12px;
}

.ntd-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 9px;
  background: var(--success-bg);
  color: var(--success);
  font-size: 11px;
  line-height: 18px;
}

.ntd-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 20px 20px;
}

.ntd-log-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
</style>
