<template>
  <div class="autostart-page">
    <PageHeader title="自启动管理" description="管理 Edge 节点开机自启动（systemd）。启用/禁用需提供 root 凭据（仅本次使用，不保存）">
    </PageHeader>

    <div class="card">
      <div class="toolbar">
        <a-select
          v-model:value="clusterFilter"
          placeholder="全部集群"
          style="width: 220px;"
          allow-clear
          @change="loadNodes"
        >
          <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">
            {{ c.display_name || c.name }}
          </a-select-option>
        </a-select>
        <a-button @click="loadNodes">刷新</a-button>
      </div>

      <a-table
        :data-source="nodes"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <a-table-column title="集群" data-index="cluster_name" key="cluster_name" />
        <a-table-column title="节点 IP" data-index="ip" key="ip" />
        <a-table-column title="Edge 目录" data-index="edge_path" key="edge_path" />
        <a-table-column title="自启动状态" key="status" width="180">
          <template #default="{ record }">
            <a-tag v-if="record.autostart_status === 'enabled'" color="green">已启用</a-tag>
            <a-tag v-else-if="record.autostart_status === 'disabled'" color="orange">已禁用</a-tag>
            <a-tag v-else-if="record.autostart_status === 'not_configured'" color="red">未配置</a-tag>
            <a-tag v-else color="default">未知</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="操作" key="action" width="360">
          <template #default="{ record }">
            <a-button size="small" type="primary" @click="openAction(record, 'enable')">启用</a-button>
            <a-button size="small" style="margin-left:6px" @click="openAction(record, 'disable')">禁用</a-button>
            <a-button size="small" style="margin-left:6px" @click="queryStatus(record)">查询状态</a-button>
          </template>
        </a-table-column>
      </a-table>
    </div>

    <!-- 高级参数 / root 凭据弹窗（启用/禁用） -->
    <a-modal
      v-model:open="actionModalVisible"
      :title="action === 'enable' ? '启用自启动' : '禁用自启动'"
      :confirm-loading="actionSubmitting"
      @ok="confirmAction"
    >
      <p class="hint">节点：{{ selectedNode?.ip }}（{{ selectedNode?.edge_path }}）</p>

      <div class="form-item">
        <label>Edge 目录</label>
        <a-input v-model:value="actionForm.edge_path" placeholder="默认取节点 Edge 目录" />
      </div>

      <div class="form-item">
        <label>运行用户</label>
        <a-input v-model:value="actionForm.run_user" :placeholder="`默认 ${defaultRunUser}`" />
        <div class="form-hint">请确认节点 Edge 的实际运行用户</div>
      </div>

      <template v-if="action === 'enable' || action === 'disable'">
        <div class="form-item">
          <label>root 账号</label>
          <a-input v-model:value="actionForm.root_user" placeholder="root" />
        </div>
        <div class="form-item">
          <label>root 密码</label>
          <a-input-password v-model:value="actionForm.root_password" placeholder="必填，仅本次使用" />
        </div>
      </template>
    </a-modal>

    <!-- 执行结果抽屉（与节点状态查询风格一致） -->
    <NodeExecutionResultDrawer
      v-model:visible="execVisible"
      :title="execTitle"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      :installing="installing"
      :stream-status="streamStatus"
      :stream-error="streamError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import api from '@/api'
import { useInstallStream } from '@/composables/useInstallStream'
import { autostartUrl, AutostartStatus } from '@/api/edgeAutostart'

const clusters = ref<any[]>([])
const nodes = ref<any[]>([])
const loading = ref(false)
const clusterFilter = ref<number | undefined>(undefined)
const defaultRunUser = ref('')

const actionModalVisible = ref(false)
const actionSubmitting = ref(false)
const action = ref<'enable' | 'disable'>('enable')
const selectedNode = ref<any | null>(null)
const actionForm = reactive({
  edge_path: '',
  run_user: '',
  root_user: 'root',
  root_password: '',
})

const execVisible = ref(false)
const execTitle = ref('')
const execProgress = reactive({ percent: 0, status: 'active' as 'active' | 'success' | 'exception' })
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number } | null>(null)
const execHighlights = ref<string[]>([])
const execStatistics = ref<Record<string, string> | null>(null)
const streamStatus = ref<string>('')
const streamError = ref<string | null>(null)
const { start, installing } = useInstallStream()

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

async function loadNodes() {
  loading.value = true
  try {
    const res = await api.get('/nodes', {
      params: {
        page_size: 500,
        ...(clusterFilter.value ? { cluster_id: clusterFilter.value } : {}),
      },
    })
    const items = res.data?.items || []
    const clusterMap = new Map(clusters.value.map((c: any) => [c.id, c]))
    nodes.value = items.map((n: any) => ({
      ...n,
      cluster_name: clusterMap.get(n.cluster_id)?.display_name || clusterMap.get(n.cluster_id)?.name || String(n.cluster_id),
      autostart_status: null as AutostartStatus | null,
    }))
  } catch (e: any) {
    message.error(e.response?.data?.detail || '加载节点失败')
  } finally {
    loading.value = false
  }
}

function openAction(node: any, act: 'enable' | 'disable') {
  action.value = act
  selectedNode.value = node
  actionForm.edge_path = node.edge_path || ''
  actionForm.run_user = ''
  actionForm.root_user = 'root'
  actionForm.root_password = ''
  actionModalVisible.value = true
}

async function confirmAction() {
  if (!selectedNode.value) return
  if (!actionForm.root_password) {
    message.warning('请输入 root 密码')
    return
  }
  actionSubmitting.value = true
  actionModalVisible.value = false
  execTitle.value = action.value === 'enable' ? `启用自启动: ${selectedNode.value.ip}` : `禁用自启动: ${selectedNode.value.ip}`
  resetExec()
  execVisible.value = true

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  await start(autostartUrl(selectedNode.value.id), {
    action: action.value,
    edge_path: actionForm.edge_path || undefined,
    run_user: actionForm.run_user || undefined,
    root_user: actionForm.root_user || undefined,
    root_password: actionForm.root_password,
  }, {
    onLine: (line) => addLog(line),
    onComplete: (rc, status) => {
      execProgress.percent = 100
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: `autostart ${action.value} ${selectedNode.value.ip}`, rc }
      execHighlights.value = rc === 0 ? [`${action.value === 'enable' ? '已启用' : '已禁用'}自启动`] : []
      addLog(rc === 0 ? `✅ ${action.value === 'enable' ? '启用' : '禁用'}自启动成功` : `❌ ${action.value === 'enable' ? '启用' : '禁用'}自启动失败`)
      if (rc === 0) message.success(action.value === 'enable' ? '已启用自启动' : '已禁用自启动')
      else message.error(`操作失败: ${status}`)
    },
    onError: (e) => {
      execProgress.percent = 100
      execProgress.status = 'exception'
      streamError.value = e
      addLog(`❌ 操作失败: ${e}`)
      message.error(e)
    },
  })
  actionSubmitting.value = false
}

async function queryStatus(node: any) {
  execTitle.value = `查询自启动状态: ${node.ip}`
  resetExec()
  execVisible.value = true

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  await start(autostartUrl(node.id), { action: 'status' }, {
    onLine: (line) => addLog(line),
    onComplete: (rc) => {
      execProgress.percent = 100
      execProgress.status = rc === 0 ? 'success' : 'exception'
      const last = execLogs.value[execLogs.value.length - 1] || ''
      const m = last.match(/edge_autostart_state\s*[:=]\s*['\"]?(\w+)['\"]?/)
      const state: AutostartStatus = m ? (m[1] as AutostartStatus) : 'unknown'
      node.autostart_status = state
      const labels: Record<AutostartStatus, string> = {
        enabled: '已启用', disabled: '已禁用', not_configured: '未配置', unknown: '未知',
      }
      execStatistics.value = { '自启动状态': labels[state] }
      execHighlights.value = rc === 0 ? [`自启动状态: ${labels[state]}`] : []
      addLog(rc === 0 ? `✅ 查询成功（${labels[state]}）` : '❌ 查询失败')
      if (rc === 0 && state === 'not_configured') message.info('该节点未配置自启动服务')
    },
    onError: (e) => {
      execProgress.percent = 100
      execProgress.status = 'exception'
      streamError.value = e
      addLog(`❌ 查询失败: ${e}`)
      message.error(e)
    },
  })
}

function resetExec() {
  execProgress.percent = 0
  execProgress.status = 'active'
  execLogs.value = []
  execElapsed.value = null
  execResult.value = null
  execHighlights.value = []
  execStatistics.value = null
  streamStatus.value = ''
  streamError.value = null
}

onMounted(async () => {
  await loadClusters()
  await loadNodes()
})
</script>

<style scoped>
.autostart-page { padding: 20px 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.form-item { margin-bottom: 14px; }
.form-item label { display: block; margin-bottom: 4px; font-size: 13px; color: var(--muted); }
.form-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
.hint { margin-bottom: 12px; color: var(--muted); }
</style>
