<template>
  <a-drawer
    :open="visible"
    title=""
    placement="right"
    width="820px"
    @close="onClose"
  >
    <template #extra>
      <a-button size="small" @click="copyAll" :disabled="logs.length === 0">
        复制日志
      </a-button>
    </template>

    <!-- Title -->
    <div style="font-size:16px;font-weight:600;margin-bottom:12px;">{{ title }}</div>

    <!-- Progress bar -->
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <a-progress :percent="progress.percent" :status="progress.status" size="small" style="flex:1;" />
        <span style="font-size:13px;color:#666;white-space:nowrap;">{{ progress.percent }}%</span>
      </div>
    </div>

    <!-- Tabs -->
    <a-tabs v-model:activeKey="activeTab" type="card" size="small">
      <a-tab-pane key="summary" tab="📋 关键信息">
        <div class="tab-body">
          <!-- Status result -->
          <div v-if="result" style="margin-bottom:12px;">
            <div v-if="result.rc === 0" style="font-size:15px;color:#52c41a;font-weight:600;">✅ 成功</div>
            <div v-else style="font-size:15px;color:#ff4d4f;font-weight:600;">❌ 失败 (rc: {{ result.rc }})</div>
          </div>
          <div v-if="result && result.rc !== 0 && result.stderr" style="color:#ff4d4f;margin-bottom:12px;">
            {{ result.stderr }}
          </div>

          <!-- Nginx status card (parsed from highlights) -->
          <div v-if="nginxStatus.known" style="margin-bottom:12px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;padding:10px 14px;">
            <div style="font-weight:600;font-size:14px;color:#389e0d;margin-bottom:4px;">
              <span :style="{ color: nginxStatus.running ? '#52c41a' : '#ff4d4f' }">
                {{ nginxStatus.running ? '●' : '○' }}
              </span>
              Nginx 进程: {{ nginxStatus.running ? '运行中' : '未运行' }}
            </div>
            <div v-if="nginxStatus.pid" style="font-size:13px;color:#666;">PID: {{ nginxStatus.pid }}</div>
          </div>
          <div v-else-if="result && result.rc !== 0" style="margin-bottom:12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:6px;padding:10px 14px;">
            <div style="font-weight:600;font-size:14px;color:#d48806;margin-bottom:4px;">
              <span style="color:#faad14;">○</span>
              Nginx 进程: 未查询到（操作未成功执行）
            </div>
          </div>

          <!-- Highlights -->
          <div v-if="highlights.length > 0" style="margin-bottom:12px;">
            <div style="font-weight:500;margin-bottom:6px;">关键信息</div>
            <div class="log-box">
              <div v-for="(line, i) in highlights" :key="i" style="color:#52c41a;">{{ line }}</div>
            </div>
          </div>

          <!-- Statistics (for status query) -->
          <div v-if="statistics && Object.keys(statistics).length > 0" style="margin-bottom:12px;">
            <div style="font-weight:500;margin-bottom:6px;">节点统计信息</div>
            <div class="stat-grid">
              <div v-for="(val, key) in statistics" :key="key" class="stat-item">
                <span class="stat-label">{{ statLabels[key] || key }}</span>
                <span class="stat-value">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- Rc -->
          <div v-if="result" style="color:#666;">返回码 (rc): {{ result.rc }}</div>

          <!-- All logs -->
          <div v-if="logs.length > 0" style="margin-top:12px;">
            <div style="font-weight:500;margin-bottom:6px;">执行日志</div>
            <div class="log-box">
              <div v-for="(line, i) in logs" :key="i" style="white-space:pre-wrap;">{{ line }}</div>
            </div>
          </div>
        </div>
      </a-tab-pane>

      <a-tab-pane key="stdout" tab="📄 stdout">
        <div class="tab-body">
          <div v-if="result && result.stdout" class="log-box full-width">
            <pre style="margin:0;white-space:pre-wrap;word-break:break-all;">{{ result.stdout }}</pre>
          </div>
          <div v-else style="color:#999;">无输出</div>
        </div>
      </a-tab-pane>

      <a-tab-pane v-if="result && result.stderr" key="stderr" tab="❌ stderr" :closable="false">
        <div class="tab-body">
          <div class="log-box full-width" style="border-color:#ff4d4f;">
            <pre style="margin:0;white-space:pre-wrap;word-break:break-all;color:#ff4d4f;">{{ result.stderr }}</pre>
          </div>
        </div>
      </a-tab-pane>

      <a-tab-pane key="command" tab="💻 命令">
        <div class="tab-body">
          <div v-if="result && result.command" class="log-box full-width">
            <pre style="margin:0;white-space:pre-wrap;word-break:break-all;">{{ result.command }}</pre>
          </div>
          <div v-else style="color:#ff4d4f;padding:8px;background:#fff2f0;border-radius:4px;border:1px solid #ffccc7;">
            <div style="font-weight:500;margin-bottom:4px;">⚠ 无法获取执行命令</div>
            <div style="font-size:13px;">请求异常，命令未成功投递到服务端。请检查节点网络连接或尝试手动执行。</div>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'

const props = defineProps<{
  visible: boolean
  title: string
  progress: { percent: number; status: 'active' | 'success' | 'exception' }
  logs: string[]
  result: { stdout: string; stderr: string; command: string; rc: number } | null
  highlights: string[]
  statistics: Record<string, string> | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const activeTab = ref('summary')

/** Collect all text lines from highlights and stdout for nginx status detection. */
function allLines(): string[] {
  const lines = [...props.highlights]
  if (props.result?.stdout) {
    for (const l of props.result.stdout.split('\n')) {
      const t = l.trim()
      if (t && !lines.includes(t)) lines.push(t)
    }
  }
  return lines
}

const nginxStatus = computed(() => {
  const lines = allLines()
  if (lines.length === 0) {
    return { known: false, running: false, pid: null }
  }
  // Detect running: line contains "running" or "started" in nginx context,
  // OR a PID was found (nginx process has a PID). "exist" is excluded
  // because "does not exist" would falsely match.
  const hasRunning = (l: string) => /\b(running|started)\b/i.test(l) && /nginx/i.test(l)
  const hasPid = lines.some(l => /PID\s*:\s*\d+/i.test(l))
  const running = lines.some(hasRunning) || hasPid
  const pidLine = lines.find(l => /PID\s*:\s*\d+/i.test(l))
  const pid = pidLine ? (pidLine.match(/PID\s*:\s*(\d+)/i)?.[1] || null) : null
  return { known: true, running, pid }
})

const statLabels: Record<string, string> = {
  cpu_usage: 'CPU 使用率 (Nginx)',
  memory_usage: '内存使用率 (Nginx)',
  system_cpu_usage: 'CPU 使用率 (系统)',
  system_memory_usage: '内存使用率 (系统)',
  edge_version: 'Edge 版本',
}

watch(() => props.result, (r) => {
  if (r && r.rc !== 0 && r.stderr) {
    activeTab.value = 'stderr'
  }
})

function onClose() {
  emit('update:visible', false)
}

async function copyAll() {
  const text = props.logs.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    message.success('已复制到剪贴板')
  }
}
</script>

<style scoped>
.tab-body {
  min-height: 200px;
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}

.log-box {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid #333;
  max-height: 400px;
  overflow-y: auto;
}

.log-box.full-width {
  max-height: calc(100vh - 260px);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.stat-item {
  background: #fafafa;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 8px 12px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #666;
}

.stat-value {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-top: 2px;
}
</style>
