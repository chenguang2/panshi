<template>
  <Teleport to="body">
    <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none', zIndex: 2000 }">
      <div class="modal" style="max-width: 860px;">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="modal-close" @click="$emit('update:visible', false)">&times;</button>
        </div>
        <div class="modal-body">
          <div style="max-height:360px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);">
            <div
              v-for="item in items"
              :key="item.ip"
              style="border-bottom:1px solid var(--border);"
            >
              <div
                class="batch-node-row"
                style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;"
                @click="$emit('toggle-expand', item.ip)"
              >
                <span :style="{ color: statusColor(item.status), flexShrink: 0 }">{{ statusIcon(item.status) }}</span>
                <span style="font-family:var(--font-mono);font-size:12px;color:var(--fg);min-width:110px;">{{ item.ip }}</span>
                <span style="font-size:12px;color:var(--muted);">{{ statusText(item.status) }}</span>
                <span style="margin-left:auto;color:var(--muted);font-size:11px;">{{ expandedIp === item.ip ? '收起 ▴' : '详情 ▾' }}</span>
              </div>
              <div v-if="expandedIp === item.ip" style="padding:4px 12px 10px;">
                <div
                  style="background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-family:var(--font-mono);font-size:11px;line-height:1.6;max-height:200px;overflow-y:auto;"
                >
                  <div v-if="item.rc !== undefined">返回码 (rc): {{ item.rc }}</div>
                  <div v-for="(l, i) in item.logs" :key="i" style="white-space:pre-wrap;">{{ l }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="$emit('update:visible', false)">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
export interface BatchNodeProgressItem {
  ip: string
  status: 'pending' | 'running' | 'success' | 'error'
  logs: string[]
  rc?: number
}

defineProps<{
  visible: boolean
  title: string
  items: BatchNodeProgressItem[]
  expandedIp: string | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
  'toggle-expand': [ip: string]
}>()

function statusIcon(status: string): string {
  if (status === 'success') return '✅'
  if (status === 'error') return '❌'
  if (status === 'running') return '🔄'
  return '⏳'
}

function statusText(status: string): string {
  if (status === 'success') return '成功'
  if (status === 'error') return '失败'
  if (status === 'running') return '执行中'
  return '等待中'
}

function statusColor(status: string): string {
  if (status === 'success') return 'var(--success)'
  if (status === 'error') return 'var(--danger)'
  if (status === 'running') return 'var(--accent)'
  return 'var(--muted)'
}
</script>
