<template>
  <div class="tab-content node-tab">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddNodeModal(cluster)">添加节点</a-button>
      <a-button size="small" @click="editNode(cluster)" :disabled="!cluster.selectedNode">编辑节点</a-button>
      <a-button size="small" danger :disabled="!cluster.selectedNode" @click="deleteNode(cluster)">删除节点</a-button>
      <a-divider type="vertical" />
      <a-button size="small" @click="handleNodeStart" :disabled="!cluster.selectedNode">▶ 启动</a-button>
      <a-button size="small" @click="handleNodeStop" :disabled="!cluster.selectedNode">⏹ 停止</a-button>
      <a-button size="small" @click="handleNodeReload" :disabled="!cluster.selectedNode">⟳ reload</a-button>
      <a-button size="small" @click="queryNodeStatus(cluster.selectedNode!)" :disabled="!cluster.selectedNode">状态查询</a-button>
      <a-dropdown v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')" :trigger="['click']">
        <a-button size="small" :disabled="!cluster.selectedNode">安装 <DownOutlined /></a-button>
        <template #overlay>
          <a-menu>
            <a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty" :disabled="!cluster.selectedNode">安装 OpenResty</a-menu-item>
            <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge" :disabled="!cluster.selectedNode">安装 Edge</a-menu-item>
            <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleAssociateNewOpenresty" :disabled="!cluster.selectedNode">关联新OpenResty</a-menu-item>
            <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleEdgePackManagement" :disabled="!cluster.selectedNode">升级Edge小版本</a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
      <a-popover v-model:open="nodeColumnPopoverVisible" trigger="click" placement="bottomLeft">
        <template #content>
          <div style="min-width: 400px;">
            <div style="font-weight: 500; margin-bottom: 8px;">列选择</div>
            <a-checkbox-group v-model:value="nodeColumnsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <div v-for="col in allNodeColumns" :key="col.key" style="margin-bottom: 4px;">
                  <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0;" />
            <div style="font-weight: 500; margin-bottom: 8px;">操作按钮</div>
            <a-checkbox-group v-model:value="nodeActionsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <div v-for="btn in allNodeActionButtons" :key="btn.key" style="margin-bottom: 4px;">
                  <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0;" />
            <div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
            <a-checkbox v-model:checked="nodeSearchVisible">显示搜索框</a-checkbox>
          </div>
        </template>
        <a-button size="small">列配置</a-button>
      </a-popover>

      <div class="toolbar-right">
        <template v-if="nodeSearchVisible">
          <a-input-search
            v-model:value="cluster.nodesSearch"
            placeholder="搜索节点"
            style="width: 150px;"
            @search="() => { cluster.nodesPagination!.page = 1; loadNodes(cluster) }"
            allow-clear
            size="small"
          />
          <a-select
            v-model:value="cluster.nodesSearchField"
            placeholder="字段"
            style="width: 90px;"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
            <a-select-option value="ip">IP</a-select-option>
          </a-select>
        </template>
      </div>
    </div>
    <a-table
      :columns="visibleNodeColumns"
      :data-source="cluster.nodes || []"
      :pagination="{
        current: cluster.nodesPagination?.page,
        pageSize: cluster.nodesPagination?.pageSize,
        total: cluster.nodesPagination?.total,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50', '100'],
        showQuickJumper: true
      }"
      :row-selection="{ selectedRowKeys: cluster.selectedNode ? [cluster.selectedNode.id] : [], onChange: (_keys: unknown, rows: unknown[]) => selectNode(cluster, (rows[rows.length - 1]) as import('@/types').Node | undefined) }"
      :loading="cluster.nodesLoading"
      :showSorterTooltip="false"
      size="small"
      row-key="id"
      class="node-table"
      @change="(pag: Record<string, unknown>, _filters: unknown, sorter: Record<string, unknown> | null) => handleNodeTableChange(cluster, pag, sorter)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'edge_version'">
          {{ record.status_detail?.statistic?.edge_version || '-' }}
        </template>
        <template v-if="column.key === 'status'">
          <BadgeStatus
            :text="nginxRunning(record) ? '健康' : '离线'"
            :status="nginxRunning(record) ? 'online' : 'offline'"
          />
        </template>
        <template v-if="column.key === 'actions'">
          <template v-for="btnKey in nodeActionsSelected" :key="btnKey">
            <a-button size="small" @click="handleNodeActionWithConfirm(cluster, record, btnKey)">
              {{ getNodeActionButtonTitle(btnKey) }}
            </a-button>
          </template>
          <a-dropdown v-if="moreNodeActions.length > 0">
            <a-button size="small">
              更多 <DownOutlined />
            </a-button>
            <template #overlay>
              <a-menu @click="(e: { key: string }) => handleNodeActionWithConfirm(cluster, record, e.key)">
                <a-menu-item v-for="btn in moreNodeActions" :key="btn.key">
                  {{ btn.title }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>
    </a-table>

    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: nodeModalVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingNode ? '编辑节点' : '添加节点' }}</h2>
          <button class="modal-close" @click="nodeModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <a-form ref="nodeFormRef" :model="nodeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="IP" name="ip" :rules="[{ required: true, validator: validateIP, trigger: 'blur' }]">
              <a-input v-model:value="nodeForm.ip" placeholder="请输入IP地址" />
            </a-form-item>
            <a-form-item label="服务端口" name="service_port" :rules="[{ required: true, type: 'number', message: '请输入服务端口' }]">
              <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item label="管理端口" name="management_port" :rules="[{ required: true, type: 'number', message: '请输入管理端口' }]">
              <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
            </a-form-item>
            <a-form-item label="Nginx安装路径" name="edge_install_path" :rules="[{ required: true, message: '请输入Nginx安装路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' }, { max: 255, message: '最多255个字符' }]">
              <a-input v-model:value="nodeForm.edge_install_path" placeholder="/usr/local/nginx" />
            </a-form-item>
            <a-form-item label="Edge安装路径" name="edge_path" :rules="[{ required: true, message: '请输入Edge安装路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { pattern: /^\/.*[^/]$/, message: '路径末尾不能为 /' }, { max: 255, message: '最多255个字符' }]">
              <a-input v-model:value="nodeForm.edge_path" placeholder="运行时路径，如 /edge/node1" />
            </a-form-item>
            <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
              <a-select v-model:value="nodeForm.status">
                <a-select-option :value="1">正常</a-select-option>
                <a-select-option :value="0">禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="nodeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleNodeSubmit">{{ editingNode ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
    </Teleport>

    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />

    <NodeExecutionResultDrawer
      v-model:visible="execDrawerVisible"
      :title="execDrawerTitle"
      :progress="execProgress"
      :logs="execLogs"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      :elapsed="execElapsed"
      :installing="installInstalling"
      :stream-error="installError"
      :stream-status="installStatus"
      @cancel="handleCancelInstall"
    />

    <!-- Custom Confirm Modal -->
    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: confirmState.visible ? 'flex' : 'none', zIndex: 2000 }">
      <div class="modal" style="max-width: 420px;">
        <div class="modal-header">
          <h2>{{ confirmState.title }}</h2>
          <button class="modal-close" @click="confirmState.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6;">{{ confirmState.content }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="confirmState.visible = false">取消</button>
          <button class="btn btn-danger" :disabled="confirmState.loading" @click="executeConfirm">
            {{ confirmState.loading ? '处理中...' : confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <InstallOpenrestyDialog
      :visible="installDialogVisible"
      :node="installTargetNode"
      :cluster-id="installTargetNode?.cluster_id ?? 0"
      @confirm="onInstallConfirm"
      @close="closeInstallDialog"
    />

    <EdgePackManagementDialog
      v-model:visible="edgePackDialogVisible"
      :node="edgePackDialogNode"
      :cluster-id="edgePackDialogNode?.cluster_id ?? 0"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue'
import { DownOutlined } from '@ant-design/icons-vue'
import type { Cluster, Node } from '@/types'
import BadgeStatus from '@/components/BadgeStatus.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import InstallOpenrestyDialog from '@/components/InstallOpenrestyDialog.vue'
import EdgePackManagementDialog from '@/components/EdgePackManagementDialog.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import api from '@/api'
import { useClusterNodes, allNodeColumns, allNodeActionButtons } from '@/composables/useClusterNodes'
import { useInstallStream } from '@/composables/useInstallStream'
import { useFeaturesStore } from '@/stores/features'

const featuresStore = useFeaturesStore()

/** Check whether nginx is actually running by analyzing parsed stdout. */
function nginxRunning(node: Node): boolean {
  const sd = node.status_detail
  // Use nginx.nginx_running parsed from command stdout (more accurate than rc)
  if (sd?.nginx?.nginx_running !== undefined) return sd.nginx.nginx_running
  // Fallback: node.status (1=active/healthy, 0=offline)
  return node.status === 1
}

const props = defineProps<{
  cluster: Cluster
}>()

const emit = defineEmits<{
  refresh: []
}>()

// Wrap single cluster prop into a Ref<Cluster[]> for the composable
const clusters = computed<Cluster[]>(() => [props.cluster])

const onRefresh = () => {
  emit('refresh')
}

const {
  nodeModalVisible,
  editingNode,
  nodeFormRef,
  nodeForm,
  diffDrawerVisible,
  diffClusterId,
  diffNodeId,
  nodeColumnPopoverVisible,
  nodeColumnsSelected,
  nodeSearchVisible,
  nodeActionsSelected,
  moreNodeActions,
  visibleNodeColumns,
  validateIP,
  getNodeActionButtonTitle,
  handleNodeAction,
  handleNodeTableChange,
  loadNodes,
  selectNode,
  showAddNodeModal,
  editNode,
  handleNodeSubmit,
  deleteNode,
  startNode,
  stopNode,
  queryNodeStatus,
  executeNodeAction,
  execDrawerVisible,
  execDrawerTitle,
  execProgress,
  execLogs,
  execResult,
  execHighlights,
  execStatistics,
  execElapsed,
} = useClusterNodes({
  clusters,
  onRefresh,
})

// ── Custom Confirm (matches NodeList.vue pattern) ──
const confirmState = reactive({
  visible: false,
  title: '',
  content: '',
  confirmText: '',
  loading: false,
  onConfirm: null as (() => Promise<void>) | null,
})

function showConfirm(title: string, content: string, confirmText: string, onConfirm: () => Promise<void>) {
  confirmState.title = title
  confirmState.content = content
  confirmState.confirmText = confirmText
  confirmState.loading = false
  confirmState.onConfirm = onConfirm
  confirmState.visible = true
}

async function executeConfirm() {
  if (!confirmState.onConfirm) return
  confirmState.visible = false
  try {
    await confirmState.onConfirm()
  } finally {
    confirmState.loading = false
  }
}

function handleNodeStart() {
  const node = props.cluster.selectedNode
  if (!node) return
  showConfirm(
    '确认启动节点',
    `即将对节点 ${node.ip} 执行"启动"操作，确认无误后继续。`,
    '确认启动',
    () => executeNodeAction(node as any, 'start', '启动'),
  )
}

function handleNodeStop() {
  const node = props.cluster.selectedNode
  if (!node) return
  showConfirm(
    '确认停止节点',
    `即将对节点 ${node.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    '确认停止',
    () => executeNodeAction(node as any, 'stop', '停止'),
  )
}

function handleNodeReload() {
  const node = props.cluster.selectedNode
  if (!node) return
  showConfirm(
    '确认重新加载节点',
    `即将对节点 ${node.ip} 执行"reload"操作，重新加载配置，确认继续？`,
    '确认reload',
    () => executeNodeAction(node as any, 'reload', 'reload'),
  )
}

function handleNodeActionWithConfirm(cluster: Cluster, record: Node, btnKey: string) {
  if (btnKey === 'start') {
    showConfirm(
      '确认启动节点',
      `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`,
      '确认启动',
      () => executeNodeAction(record as any, 'start', '启动'),
    )
  } else if (btnKey === 'stop') {
    showConfirm(
      '确认停止节点',
      `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
      '确认停止',
      () => executeNodeAction(record as any, 'stop', '停止'),
    )
  } else {
    handleNodeAction(cluster, record, btnKey)
  }
}

// ── Install OpenResty Dialog ─────────────────────────────────────
const installDialogVisible = ref(false)
const installTargetNode = ref<any>(null)

// ── Install OpenResty / Edge streaming ──────────────────────────────
const installStream = useInstallStream()
const cancelling = ref(false)
const execTargetNode = ref<any | null>(null)
const { installing: installInstalling, error: installError, status: installStatus } = installStream

let _installTimer: ReturnType<typeof setInterval> | null = null
function clearInstallTimer() { if (_installTimer) { clearInterval(_installTimer); _installTimer = null } }

function buildInstallCommand(node: any, tag: string, extravars: Record<string, string>) {
  const ev = JSON.stringify({ ...extravars, ips: node.ip })
  const ansibleCmd = `ansible-playbook -i /home/qcg/panshi/backend/ansible/inventory -e @/home/qcg/panshi/backend/ansible/env/extravars -e '${ev}' --tags ${tag} edge.yml`
  // install-edge 只走 Ansible, 不执行 SSH; install-openresty 才走 Ansible + SSH 两阶段
  if (tag === 'install_edge') {
    return `# Ansible 命令:\n${ansibleCmd}`
  }
  const prefix = extravars.prefix || node.edge_path || ''
  const destpath = prefix.replace(/\/[^/]+$/, '') + '/'
  const sshUser = 'jboss'
  const sshCmd = [
    'ssh',
    '-i', '~/.ssh/id_rsa',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=30',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    `${sshUser}@${node.ip}`,
    `"source /etc/profile; cd ${destpath}soft/install-edge/ && ./install-edge.sh ${prefix}; wait"`,
  ].join(' ')
  return `# Ansible 命令:\n${ansibleCmd}\n\n# SSH 编译命令:\n${sshCmd}`
}

function handleInstallOpenresty() {
  const node = props.cluster.selectedNode
  if (!node) return
  installTargetNode.value = node
  installDialogVisible.value = true
}

function closeInstallDialog() {
  installDialogVisible.value = false
}

function onInstallConfirm(payload: { node: any; clusterId: number; openrestyFile: string }) {
  installDialogVisible.value = false
  const node = payload.node
  execTargetNode.value = node
  const prefix = node.edge_install_path
  execDrawerVisible.value = true
  execDrawerTitle.value = `安装 OpenResty - ${node.ip}`
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execResult.value = { stdout: '', stderr: '', command: '', rc: null as any }
  execElapsed.value = 0
  clearInstallTimer()
  _installTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
    execProgress.percent = Math.min(Math.round((execElapsed.value ?? 0) / 200 * 100), 99)
  }, 1000)

  installStream.start(
    `/clusters/${node.cluster_id}/nodes/${node.id}/install-openresty`,
    { prefix, openresty_file: payload.openrestyFile },
    {
      onLine: (line: string) => {
        execLogs.value = [...execLogs.value, line]
      },
      onProgress: (percent: number) => {
        if (percent > execProgress.percent) execProgress.percent = percent
      },
      onComplete: (rc: number, _status: string) => {
        clearInstallTimer()
        execProgress.status = rc === 0 ? 'success' : 'exception'
        execProgress.percent = 100
        const prevCmd = execResult.value?.command || ''
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
      },
      onError: () => { clearInstallTimer() },
    },
  )
}

function handleInstallEdge() {
  const node = props.cluster.selectedNode
  if (!node) return
  showConfirm(
    '\u786e\u8ba4\u5b89\u88c5 Edge',
    `\u5373\u5c06\u5728\u8282\u70b9 ${node.ip} \u4e0a\u5b89\u88c5 Edge\uff08${node.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = node
      const installPrefix = node.edge_install_path || node.edge_path
      const pendingCommand = buildInstallCommand(node, 'install_edge', { prefix: installPrefix || '' })
      execDrawerVisible.value = true
      execDrawerTitle.value = `\u5b89\u88c5 Edge - ${node.ip}`
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null as any }
      execElapsed.value = 0
      clearInstallTimer()
      _installTimer = setInterval(() => {
        execElapsed.value = (execElapsed.value ?? 0) + 1
        execProgress.percent = Math.min(Math.round((execElapsed.value ?? 0) / 200 * 100), 99)
      }, 1000)

      installStream.start(
        `/clusters/${node.cluster_id}/nodes/${node.id}/install-edge`,
        { prefix: installPrefix },
        {
          onLine: (line: string) => {
            execLogs.value = [...execLogs.value, line]
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            clearInstallTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: () => { clearInstallTimer() },
        },
      )
    },
  )
}

function handleCancelInstall() {
  const node = execTargetNode.value
  if (!node || cancelling.value) return

  showConfirm(
    '确认取消安装',
    `即将取消节点 ${node.ip} 的安装操作，终止正在编译的进程。确认？`,
    '确认取消',
    async () => {
      cancelling.value = true
      try {
        execLogs.value.push(`[${new Date().toLocaleTimeString()}] 正在取消安装...`)
        execProgress.percent = 60
        execProgress.status = 'active'

        const res = await api.post(`/clusters/${node.cluster_id}/nodes/${node.id}/cancel-install`)
        const data = res.data

        execLogs.value.push('')
        execLogs.value.push('═══════════════════════════════════════════')
        execLogs.value.push('取消安装结果:')

        for (const step of data.steps) {
          const icon = step.status === 'success' ? '✓' : step.status === 'skipped' ? '−' : '✗'
          execLogs.value.push('')
          execLogs.value.push(` ${icon} ${step.command}`)
          if (step.stdout) {
            for (const line of step.stdout.split('\n')) {
              execLogs.value.push(`   ${line}`)
            }
          }
          if (step.stderr) {
            execLogs.value.push(`   stderr: ${step.stderr}`)
          }
        }

        const allOk = data.steps.every((s: any) => s.status === 'success' || s.status === 'skipped')
        execLogs.value.push('')
        execLogs.value.push('═══════════════════════════════════════════')
        execLogs.value.push(
          data.status === 'skipped'
            ? '⚠️ 没有运行中的安装进程'
            : allOk
              ? '✅ 安装已取消'
              : '⚠️ 取消过程部分异常'
        )

        execProgress.percent = 100
        execProgress.status = 'success'

        execResult.value = {
          stdout: execLogs.value.join('\n'),
          stderr: '',
          command: data.steps.map((s: any) => `# ${s.command}\n${s.stdout || ''}`).join('\n\n'),
          rc: 0,
        }
      } catch (error: any) {
        const err = error as { response?: { data?: { detail?: string } }; message?: string }
        const detail = err.response?.data?.detail || err.message || '取消失败'
        execLogs.value.push(`❌ ${detail}`)
        execProgress.percent = 100
        execProgress.status = 'exception'
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: detail, command: '', rc: -1 }
      } finally {
        cancelling.value = false
        installStream.cancel()
      }
    },
  )
}

// ── 关联新OpenResty ──

function handleAssociateNewOpenresty() {
  const node = props.cluster.selectedNode
  if (!node) return
  const prefix = node.edge_install_path || ''
  showConfirm(
    '关联新OpenResty',
    `即将把节点 ${node.ip} 的 Edge（${node.edge_path}）关联到新 OpenResty（${prefix}），确认开始？`,
    '确认关联',
    async () => {
      execTargetNode.value = node
      execDrawerVisible.value = true
      execDrawerTitle.value = `关联新OpenResty - ${node.ip}`
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      execResult.value = { stdout: '', stderr: '', command: '', rc: null as any }
      execElapsed.value = 0
      clearInstallTimer()
      _installTimer = setInterval(() => {
        execElapsed.value = (execElapsed.value ?? 0) + 1
        execProgress.percent = Math.min(Math.round((execElapsed.value ?? 0) / 200 * 100), 99)
      }, 1000)

      installStream.start(
        `/clusters/${node.cluster_id}/nodes/${node.id}/associate-new-openresty`,
        {},
        {
          onLine: (line: string) => { execLogs.value = [...execLogs.value, line] },
          onProgress: (percent: number) => { if (percent > execProgress.percent) execProgress.percent = percent },
          onComplete: (rc: number, _status: string) => {
            clearInstallTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: () => { clearInstallTimer() },
        },
      )
    },
  )
}

// ── 升级Edge小版本 ──

const edgePackDialogVisible = ref(false)
const edgePackDialogNode = ref<any>(null)

function handleEdgePackManagement() {
  edgePackDialogNode.value = props.cluster.selectedNode
  edgePackDialogVisible.value = true
}

function streamEdgeAction(node: any, title: string, url: string, body: Record<string, any>) {
  execTargetNode.value = node
  execDrawerVisible.value = true
  execDrawerTitle.value = title
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execResult.value = { stdout: '', stderr: '', command: '', rc: null as any }
  execElapsed.value = 0
  clearInstallTimer()
  _installTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
    execProgress.percent = Math.min(Math.round((execElapsed.value ?? 0) / 200 * 100), 99)
  }, 1000)

  installStream.start(url, body, {
    onLine: (line: string) => { execLogs.value = [...execLogs.value, line] },
    onProgress: (percent: number) => { if (percent > execProgress.percent) execProgress.percent = percent },
    onComplete: (rc: number, _status: string) => {
      clearInstallTimer()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      const prevCmd = execResult.value?.command || ''
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
    },
    onError: () => { clearInstallTimer() },
  })
}

function onEdgePackAdd(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.node) return
  streamEdgeAction(
    detail.node,
    `添加版本包 - ${detail.node.ip}`,
    `/clusters/${detail.clusterId}/nodes/${detail.node.id}/edge-pack-add`,
    { pack_file: detail.packFile },
  )
}

function onEdgePackRebase(e: Event) {
  const detail = (e as CustomEvent).detail
  if (!detail?.node) return
  streamEdgeAction(
    detail.node,
    `切换版本 - ${detail.node.ip}`,
    `/clusters/${detail.clusterId}/nodes/${detail.node.id}/edge-pack-rebase`,
    { version: detail.version },
  )
}

onMounted(() => {
  window.addEventListener('edge-pack-add', onEdgePackAdd)
  window.addEventListener('edge-pack-rebase', onEdgePackRebase)
})

onUnmounted(() => {
  window.removeEventListener('edge-pack-add', onEdgePackAdd)
  window.removeEventListener('edge-pack-rebase', onEdgePackRebase)
})
</script>

<style scoped>
.tab-content {
  min-height: 100px;
}

.node-tab {
  width: 100%;
  padding: 0;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}

.node-table {
  margin-top: 8px;
}
</style>
