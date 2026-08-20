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
            <a-tag v-else-if="record.autostart_status === 'permission_denied'" color="red">无权限</a-tag>
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

    <!-- 高级参数 / root 凭据抽屉（启用/禁用，参考路由插件编辑抽屉风格） -->
    <a-drawer
      v-model:open="actionModalVisible"
      :title="action === 'enable' ? '启用自启动' : '禁用自启动'"
      width="560"
      :closable="true"
      @close="actionModalVisible = false"
    >
      <a-form layout="vertical">
        <div class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">节点</span>
            <span class="field-block-desc">目标 Edge 节点</span>
          </div>
          <div class="field-value">{{ selectedNode?.ip }}（{{ selectedNode?.edge_path }}）</div>
        </div>

        <div class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">Edge 目录</span>
            <span class="field-block-desc">edge.service 的 WorkingDirectory 与 ExecStart 路径</span>
          </div>
          <a-input v-model:value="actionForm.edge_path" placeholder="默认取节点 Edge 目录" class="field-input" />
        </div>

        <div class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">运行用户（edge.service 的 User=）</span>
            <span class="field-block-desc">edge.service 将以该用户执行；默认已填节点配置用户，请确认是否为节点 Edge 实际运行用户</span>
          </div>
          <a-input v-model:value="actionForm.run_user" placeholder="默认取节点 inventory 用户" class="field-input" />
        </div>

        <template v-if="action === 'enable' || action === 'disable'">
          <div class="field-block">
            <div class="field-block-header">
              <span class="field-block-title">root 账号</span>
              <span class="field-block-desc">启用/禁用自启动需 root 权限</span>
            </div>
            <a-input v-model:value="actionForm.root_user" placeholder="root" class="field-input" />
          </div>

          <div class="field-block">
            <div class="field-block-header">
              <span class="field-block-title">root 密码</span>
              <span class="field-block-desc">必填，仅本次操作使用，不保存</span>
            </div>
            <a-input-password v-model:value="actionForm.root_password" placeholder="必填，仅本次使用" class="field-input" />
          </div>
        </template>
      </a-form>

      <template #footer>
        <a-space>
          <a-button @click="actionModalVisible = false">取消</a-button>
          <a-button type="primary" :loading="actionSubmitting" @click="confirmAction">
            {{ action === 'enable' ? '确认启用' : '确认禁用' }}
          </a-button>
        </a-space>
      </template>
    </a-drawer>

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

async function openAction(node: any, act: 'enable' | 'disable') {
  action.value = act
  selectedNode.value = node
  actionForm.edge_path = node.edge_path || ''
  // 运行用户默认取节点 inventory 的 ansible_ssh_user（通常即 Edge 实际运行用户）
  actionForm.run_user = ''
  try {
    const res = await api.get(`/nodes/${node.id}/autostart/defaults`)
    actionForm.run_user = res.data?.run_user || defaultRunUser.value || ''
  } catch { actionForm.run_user = defaultRunUser.value || '' }
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
      // 在全部日志行中搜索 edge_autostart_state（debug 输出可能位于日志中部而非末尾）
      const state = parseAutostartState(execLogs.value)
      node.autostart_status = state
      const labels: Record<AutostartStatus, string> = {
        enabled: '已启用', disabled: '已禁用', not_configured: '未配置', permission_denied: '无权限查询', unknown: '未知',
      }
      if (state === 'permission_denied') {
        // 从日志中提取 rc 等具体信息贴给用户
        const rcInfo = extractAutostartRc(execLogs.value)
        execStatistics.value = { '自启动状态': labels[state], '原因': rcInfo }
        execHighlights.value = [`无权限执行 systemctl（${rcInfo}），请确认节点普通用户能否读取 systemctl`]
      } else {
        execStatistics.value = { '自启动状态': labels[state] }
        execHighlights.value = rc === 0 ? [`自启动状态: ${labels[state]}`] : []
      }
      addLog(rc === 0 ? `✅ 查询成功（${labels[state]}）` : `❌ 查询失败（${labels[state]}）`)
      if (rc === 0 && state === 'not_configured') message.info('该节点未配置自启动服务')
      if (state === 'permission_denied') message.warning('该节点普通用户无权限查询自启动状态')
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

function parseAutostartState(logs: string[]): AutostartStatus {
  for (const line of logs) {
    const m = line.match(/edge_autostart_state\s*[:=]\s*['\"]?(\w+)['\"]?/)
    if (m) {
      const v = m[1] as AutostartStatus
      if (v === 'enabled' || v === 'disabled' || v === 'not_configured' || v === 'permission_denied' || v === 'unknown') {
        return v
      }
    }
  }
  return 'unknown'
}

function extractAutostartRc(logs: string[]): string {
  for (const line of logs) {
    const m = line.match(/rc=(\d+)/)
    if (m) return `systemctl 退出码 ${m[1]}（权限不足）`
  }
  return 'systemctl 无权限执行'
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
  try {
    const res = await api.get('/nodes/autostart/defaults')
    defaultRunUser.value = res.data?.default_run_user || ''
  } catch { /* ignore */ }
  await loadClusters()
  await loadNodes()
})
</script>

<style scoped>
.autostart-page { padding: 20px 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }

/* 参考路由插件编辑抽屉（PluginEditorDrawer）的 field-block 风格 */
.field-block {
  margin-bottom: 20px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.field-block-header { margin-bottom: 8px; }
.field-block-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 2px;
}
.field-block-desc {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.field-input { margin-bottom: 6px; }
.field-value {
  font-size: 13px;
  color: var(--fg);
  word-break: break-all;
}
</style>
