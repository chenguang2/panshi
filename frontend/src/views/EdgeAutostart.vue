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

    <!-- 执行进度弹窗 -->
    <a-modal
      v-model:open="execVisible"
      :title="execTitle"
      :footer="null"
      :mask-closable="false"
    >
      <div class="exec-log">
        <div v-for="(line, i) in execLogs" :key="i" class="exec-line">{{ line }}</div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
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
const execLogs = ref<string[]>([])
const { start, installing, error } = useInstallStream()

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

async function loadNodes() {
  loading.value = true
  try {
    const res = await api.get('/nodes', { params: { page_size: 500 } })
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
  execLogs.value = []
  execVisible.value = true

  await start(autostartUrl(selectedNode.value.id), {
    action: action.value,
    edge_path: actionForm.edge_path || undefined,
    run_user: actionForm.run_user || undefined,
    root_user: actionForm.root_user || undefined,
    root_password: actionForm.root_password,
  }, {
    onLine: (line) => execLogs.value.push(line),
    onComplete: (rc, status) => {
      if (rc === 0) {
        message.success(action.value === 'enable' ? '已启用自启动' : '已禁用自启动')
      } else {
        message.error(`操作失败: ${status}`)
      }
    },
    onError: (e) => message.error(e),
  })
  actionSubmitting.value = false
}

async function queryStatus(node: any) {
  execTitle.value = `查询自启动状态: ${node.ip}`
  execLogs.value = []
  execVisible.value = true
  await start(autostartUrl(node.id), { action: 'status' }, {
    onLine: (line) => execLogs.value.push(line),
    onComplete: (rc) => {
      if (rc !== 0) { message.error('查询失败'); return }
      // 解析 last line 中的状态（由 ansible set_fact 输出）
      const last = execLogs.value[execLogs.value.length - 1] || ''
      const m = last.match(/edge_autostart_state\s*[:=]\s*['\"]?(\w+)['\"]?/)
      const state: AutostartStatus = m ? (m[1] as AutostartStatus) : 'unknown'
      node.autostart_status = state
      if (state === 'not_configured') message.info('该节点未配置自启动服务')
    },
    onError: (e) => message.error(e),
  })
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
.exec-log { max-height: 320px; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; font-family: var(--font-mono); font-size: 12px; }
.exec-line { white-space: pre-wrap; word-break: break-all; line-height: 1.6; }
</style>
