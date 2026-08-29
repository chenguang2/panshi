<template>
  <div class="node-task-list">
    <PageHeader title="节点任务" description="查看和管理节点运维操作任务（安装/升级/启动/停止等），支持取消与重试">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">＋ 新建任务</button>
      </template>
    </PageHeader>

    <div class="node-filter-bar">
      <select v-model="filterStatus" class="form-input" style="width:140px;">
        <option value="">全部状态</option>
        <option value="pending">待执行</option>
        <option value="running">执行中</option>
        <option value="success">成功</option>
        <option value="partial">部分成功</option>
        <option value="failed">失败</option>
        <option value="cancelled">已取消</option>
      </select>
      <select v-model="filterType" class="form-input" style="width:180px;">
        <option value="">全部类型</option>
        <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <button class="btn btn-secondary" @click="loadTasks(1)">刷新</button>
      <button
        v-if="selectedRowKeys.length > 0"
        class="btn btn-danger"
        @click="handleBatchDelete"
      >批量删除（{{ selectedRowKeys.length }}）</button>
    </div>

    <div class="table-container">
      <a-table
        :data-source="tasks"
        :columns="columns"
        :loading="loading"
        row-key="id"
        :row-selection="{ selectedRowKeys, onChange: onSelectionChange }"
        :pagination="paginationProps({ page, pageSize, total }, '条')"
        size="middle"
        class="node-task-table"
        @change="onTableChange"
      >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'task_type'">
          {{ typeLabel(record.task_type) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <span :class="'status-tag status-' + record.status">{{ statusLabel(record.status) }}</span>
        </template>
        <template v-else-if="column.key === 'nodes'">
          {{ record.success_nodes }}/{{ record.total_nodes }} 成功
        </template>
        <template v-else-if="column.key === 'progress'">
          <div class="progress-bar-wrap" style="min-width:120px;">
            <div class="progress-bar" :class="'progress-' + progressStatus(record)" :style="{ width: progressPercent(record) + '%' }"></div>
          </div>
        </template>
        <template v-else-if="column.key === 'created_at'">
          {{ formatTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-dropdown :trigger="['click']">
            <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="openDetail(record)">详情</a-menu-item>
                <a-menu-item v-if="record.status === 'running' || record.status === 'pending'" @click="handleCancel(record)">取消</a-menu-item>
                <a-menu-item v-if="['failed', 'partial', 'cancelled'].includes(record.status)" @click="handleRetry(record)">重试</a-menu-item>
                <a-menu-item v-if="['success', 'failed', 'partial', 'cancelled'].includes(record.status)" danger @click="handleDelete(record)">删除</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>
    </a-table>
    </div>

    <!-- Detail drawer -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: detailVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width:900px;">
          <div class="modal-header">
            <h2>任务详情 #{{ detail?.id }}</h2>
            <button class="modal-close" @click="closeDetail">&times;</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <div v-if="detail" style="margin-bottom:16px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px;">
              <div><strong>类型:</strong> {{ typeLabel(detail.task_type) }}</div>
              <div><strong>状态:</strong> {{ statusLabel(detail.status) }}</div>
              <div><strong>节点:</strong> {{ detail.success_nodes }}/{{ detail.total_nodes }} 成功</div>
              <div><strong>失败:</strong> {{ detail.failed_nodes }}，<strong>取消:</strong> {{ detail.cancelled_nodes }}</div>
              <div v-if="detail.params && Object.keys(detail.params).length > 0" style="grid-column:1/-1;">
                <strong>参数:</strong> <code style="white-space:pre-wrap;">{{ JSON.stringify(detail.params, null, 2) }}</code>
              </div>
            </div>

            <table class="ner-table" style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="text-align:left;color:var(--muted,#888);">
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">节点</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">状态</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">rc</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">耗时</th>
                  <th style="padding:6px 8px;border-bottom:1px solid #eee;">日志</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in detail?.items || []" :key="item.id">
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ item.ip }}<span v-if="item.node_name" style="color:var(--muted,#999);margin-left:6px;">{{ item.node_name }}</span></td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">
                    <span :class="'status-tag status-' + streamItem(item).status">{{ statusLabel(streamItem(item).status) }}</span>
                  </td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ streamItem(item).rc ?? '-' }}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ durationText(item) }}</td>
                  <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">
                    <button class="btn btn-secondary btn-sm" @click="expandedIp = expandedIp === item.ip ? null : item.ip">
                      {{ expandedIp === item.ip ? '收起' : '展开' }}
                    </button>
                    <button class="btn btn-secondary btn-sm" @click="loadFullLog(item)">完整日志</button>
                  </td>
                </tr>
                <tr v-if="expandedItem">
                  <td colspan="5" style="padding:8px;">
                    <NodeTaskLogViewer
                      :logs="streamLogLines(expandedItem)"
                      :stdout="expandedItem.stdout || ''"
                      :stderr="expandedItem.stderr || ''"
                      :command="expandedItem.command || ''"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="detail?.task_type === 'software_check'" style="margin-top:16px;">
              <div style="font-size:14px;font-weight:600;margin-bottom:8px;">软件查询结果</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr>
                    <th style="padding:6px 8px;border-bottom:1px solid #eee;text-align:left;">软件</th>
                    <th v-for="item in detail?.items || []" :key="'h'+item.id" style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">{{ item.ip }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="soft in softwareMatrixRows()" :key="soft">
                    <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;">{{ soft }}</td>
                    <td v-for="item in detail?.items || []" :key="'c'+item.id+soft" style="padding:6px 8px;border-bottom:1px solid #f5f5f5;text-align:center;">
                      <template v-if="softwareCell(item, soft)">
                        <span v-if="softwareCell(item, soft)!.status === 'installed'" style="color:var(--success,#16a34a);" :title="'包: ' + softwareCell(item, soft)!.pkg + (softwareCell(item, soft)!.ver ? '\n版本: ' + softwareCell(item, soft)!.ver : '')">✓ {{ softwareCell(item, soft)!.pkg }}</span>
                        <span v-else-if="softwareCell(item, soft)!.status === 'missing'" style="color:var(--danger,#e5484d);">✗ 未安装</span>
                        <span v-else style="color:var(--muted,#999);">检测失败</span>
                      </template>
                      <span v-else style="color:var(--muted,#999);">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="detail && (detail.status === 'running' || detail.status === 'pending')" class="btn btn-danger" @click="handleCancel(detail)">取消任务</button>
            <button v-if="detail && ['failed','partial','cancelled'].includes(detail.status)" class="btn btn-secondary" @click="handleRetry(detail)">重试失败节点</button>
            <button class="btn btn-secondary" @click="closeDetail">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create task modal -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: createVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width:640px;">
          <div class="modal-header">
            <h2>创建节点任务</h2>
            <button class="modal-close" @click="createVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">集群</label>
              <select v-model="createClusterId" class="filter-select" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" @change="loadCreateNodes">
                <option :value="0" disabled>请选择集群</option>
                <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
              </select>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">节点</label>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;font-size:12px;color:var(--muted,#888);">
                <div>
                  <a style="cursor:pointer;margin-right:12px;color:var(--accent,#4096ff);" @click="selectAllCreateNodes">全选</a>
                  <a style="cursor:pointer;color:var(--accent,#4096ff);" @click="clearAllCreateNodes">取消全选</a>
                </div>
                <span>已选择 {{ createNodeIds.length }} / {{ createNodes.length }} 个节点</span>
              </div>
              <div style="border:1px solid var(--border,#e5e5e5);border-radius:6px;padding:8px;max-height:180px;overflow-y:auto;">
                <label v-for="n in createNodes" :key="n.id" style="display:block;padding:4px 6px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" :value="n.id" v-model="createNodeIds" style="margin-right:6px;" />
                  {{ n.ip }} <span v-if="n.edge_path" style="color:var(--muted,#999);font-size:12px;">({{ n.edge_path }})</span>
                </label>
                <div v-if="createNodes.length === 0" style="color:var(--muted,#999);font-size:12px;padding:4px;">请先选择集群</div>
              </div>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">任务类型</label>
              <select v-model="createTaskType" data-test="task-type" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择操作类型</option>
                <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div v-if="createTaskType === 'install_openresty'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">安装包</label>
              <select v-model="createOpenrestyFile" data-test="openresty-file" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择 OpenResty 安装包</option>
                <option v-for="f in openrestyFiles" :key="f.name" :value="f.name">{{ f.name }} <template v-if="f.size_display">({{ f.size_display }})</template></option>
              </select>
            </div>
            <div v-if="createTaskType === 'edge_pack_add'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">Edge 版本包</label>
              <select v-model="selectedPackFile" data-test="edge-pack-file" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择 Edge 版本包</option>
                <option v-for="f in edgePackFiles" :key="f.name" :value="f.name">{{ f.name }} <template v-if="f.size_display">({{ f.size_display }})</template></option>
              </select>
            </div>
            <div v-if="createTaskType === 'edge_pack_rebase'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:4px;">目标版本</label>
              <select v-model="selectedPackVersion" data-test="edge-pack-version" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);">
                <option value="" disabled>请选择目标版本</option>
                <option v-for="v in edgePackVersions" :key="v.name" :value="v.name" :disabled="v.current">{{ v.name }} <template v-if="v.current">(当前)</template></option>
              </select>
            </div>
            <div v-if="createTaskType === 'software_check'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:6px;">软件列表</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                <label
                  v-for="s in softwareOptions"
                  :key="s.value"
                  style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 8px;border:1px solid var(--border,#e5e5e5);border-radius:12px;cursor:pointer;"
                  :class="{ 'soft-opt-selected': softwareSelected.includes(s.value) }"
                >
                  <input type="checkbox" :value="s.value" v-model="softwareSelected" style="accent-color:var(--accent,#4096ff);">
                  <span>{{ s.label }}</span>
                </label>
              </div>
              <div style="display:flex;gap:6px;">
                <input v-model="customSoftwareInput" data-test="custom-software" type="text" placeholder="输入软件名（如 telnet）" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" @keydown.enter.prevent="addCustomSoftware">
                <button class="btn btn-secondary btn-sm" @click="addCustomSoftware">添加</button>
              </div>
              <div v-if="customSoftwareList.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                <span
                  v-for="s in customSoftwareList"
                  :key="s"
                  style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 8px;border:1px solid var(--border,#e5e5e5);border-radius:12px;background:var(--bg,#f8f8f8);"
                >
                  {{ s }}
                  <a style="color:var(--danger,#e5484d);cursor:pointer;" @click="removeCustomSoftware(s)">×</a>
                </span>
              </div>
            </div>
            <div v-if="createTaskType === 'cmd_exec'" style="margin-bottom:12px;">
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-bottom:6px;">命令</label>
              <input v-model="cmdCommand" data-test="cmd-command" type="text" placeholder="如: ls -la /etc" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" />
              <div style="display:flex;gap:12px;margin-top:10px;">
                <label v-for="s in cmdSecurityOptions" :key="s.value" style="display:inline-flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
                  <input type="radio" :value="s.value" v-model="cmdSecurity" style="accent-color:var(--accent,#4096ff);">
                  <span>{{ s.label }}</span>
                </label>
              </div>
              <div v-if="cmdSecurity === 'whitelist'" style="margin-top:10px;">
                <div style="font-size:13px;color:var(--muted,#888);margin-bottom:6px;">白名单命令（内置只读命令 + 本次任务添加）</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                  <span
                    v-for="c in cmdBuiltinWhitelist"
                    :key="c"
                    style="font-size:12px;padding:3px 8px;border:1px solid var(--border,#e5e5e5);border-radius:12px;"
                  >{{ c }}</span>
                </div>
                <div v-if="cmdCustomWhitelist.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                  <span
                    v-for="c in cmdCustomWhitelist"
                    :key="c"
                    style="font-size:12px;padding:3px 8px;border:1px solid var(--border,#e5e5e5);border-radius:12px;background:var(--bg,#f8f8f8);"
                  >
                    {{ c }}
                    <a style="color:var(--danger,#e5484d);cursor:pointer;" @click="removeCmdWhitelist(c)">×</a>
                  </span>
                </div>
                <div style="display:flex;gap:6px;">
                  <input v-model="cmdWhitelistInput" data-test="cmd-whitelist-add" type="text" placeholder="输入命令名（如 mytool）" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" @keydown.enter.prevent="addCmdWhitelist">
                  <button class="btn btn-secondary btn-sm" @click="addCmdWhitelist">添加</button>
                </div>
              </div>
              <label style="font-size:13px;color:var(--muted,#888);display:block;margin-top:10px;margin-bottom:6px;">超时（秒）</label>
              <input v-model.number="cmdTimeout" data-test="cmd-timeout" type="number" min="1" max="600" style="width:120px;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#e5e5e5);" />
            </div>
            <div style="color:var(--muted,#999);font-size:12px;line-height:1.6;">
              任务参数将从节点记录自动读取（安装路径/管理端口等），无需手动填写。
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="createVisible = false">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!createClusterId || createNodeIds.length === 0 || !createTaskType || (createTaskType === 'install_openresty' && !createOpenrestyFile) || (createTaskType === 'edge_pack_add' && !selectedPackFile) || (createTaskType === 'edge_pack_rebase' && !selectedPackVersion) || (createTaskType === 'software_check' && softwareSelected.length === 0 && customSoftwareList.length === 0) || (createTaskType === 'cmd_exec' && !cmdCommand.trim())"
              @click="submitCreateTask"
            >创建</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, h, render } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeTaskLogViewer from '@/components/NodeTaskLogViewer.vue'
import { listNodeTasks, getNodeTask, cancelNodeTask, retryNodeTask, createNodeTask, fetchTaskItemLog, deleteNodeTask, batchDeleteNodeTasks, parseTaskEvent, type NodeTaskData, type NodeTaskItemData, type TaskStreamEvent } from '@/composables/useNodeTasks'
import { paginationProps } from '@/composables/usePagination'
import api from '@/api'

const tasks = ref<NodeTaskData[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterStatus = ref('')
const filterType = ref('')
const selectedRowKeys = ref<number[]>([])
const detailVisible = ref(false)
const detail = ref<NodeTaskData | null>(null)
const expandedIp = ref<string | null>(null)
const liveLogs = ref<Record<number, string[]>>({})
const liveDetail = ref<Record<number, NodeTaskItemData>>({})
let eventSource: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let streamTaskId = 0

const createVisible = ref(false)
const clusters = ref<Array<{ id: number; name: string; display_name?: string }>>([])
const createClusterId = ref(0)
const createNodes = ref<Array<{ id: number; ip: string; edge_path?: string }>>([])
const createNodeIds = ref<number[]>([])

function selectAllCreateNodes() {
  createNodeIds.value = createNodes.value.map((n: any) => n.id)
}

function clearAllCreateNodes() {
  createNodeIds.value = []
}
const createTaskType = ref('')
const createOpenrestyFile = ref('')
const openrestyFiles = ref<Array<{ name: string; size_display?: string }>>([])
const edgePackFiles = ref<Array<{ name: string; size_display?: string }>>([])
const selectedPackFile = ref('')
const edgePackVersions = ref<Array<{ name: string; current: boolean }>>([])
const selectedPackVersion = ref('')

// ── software_check ──
const softwareOptions = [
  { value: 'nc', label: 'nc' },
  { value: 'vim', label: 'vim' },
  { value: 'bc', label: 'bc' },
  { value: 'make', label: 'make' },
  { value: 'g++', label: 'gcc-c++' },
  { value: 'dig', label: 'bind-utils' },
  { value: 'tcpdump', label: 'tcpdump' },
  { value: 'git', label: 'git' },
  { value: 'lsof', label: 'lsof' },
  { value: 'dos2unix', label: 'dos2unix' },
]
const softwareSelected = ref<string[]>(softwareOptions.map(s => s.value))
const customSoftwareInput = ref('')
const customSoftwareList = ref<string[]>([])

function addCustomSoftware() {
  const name = customSoftwareInput.value.trim()
  if (!name) return
  if (!softwareSelected.value.includes(name) && !customSoftwareList.value.includes(name)) {
    customSoftwareList.value.push(name)
    softwareSelected.value.push(name)
  }
  customSoftwareInput.value = ''
}

function removeCustomSoftware(name: string) {
  customSoftwareList.value = customSoftwareList.value.filter(s => s !== name)
  softwareSelected.value = softwareSelected.value.filter(s => s !== name)
}

// ── cmd_exec ──
const cmdSecurityOptions = [
  { value: 'blacklist', label: '黑名单' },
  { value: 'whitelist', label: '白名单' },
  { value: 'none', label: '不限制' },
]
const cmdBuiltinWhitelist = ['ls', 'ps', 'df', 'free', 'top', 'cat', 'head', 'tail', 'grep', 'wc', 'du', 'stat', 'whoami', 'hostname', 'uptime', 'date', 'uname']
const cmdCommand = ref('')
const cmdSecurity = ref('blacklist')
const cmdTimeout = ref(30)
const cmdWhitelistInput = ref('')
const cmdCustomWhitelist = ref<string[]>([])

function addCmdWhitelist() {
  const name = cmdWhitelistInput.value.trim()
  if (!name) return
  if (!cmdBuiltinWhitelist.includes(name) && !cmdCustomWhitelist.value.includes(name)) {
    cmdCustomWhitelist.value.push(name)
  }
  cmdWhitelistInput.value = ''
}

function removeCmdWhitelist(name: string) {
  cmdCustomWhitelist.value = cmdCustomWhitelist.value.filter(c => c !== name)
}

function resetCmdExecForm() {
  cmdCommand.value = ''
  cmdSecurity.value = 'blacklist'
  cmdTimeout.value = 30
  cmdWhitelistInput.value = ''
  cmdCustomWhitelist.value = []
}

const taskTypes = [
  { value: 'install_openresty', label: '安装 OpenResty' },
  { value: 'install_edge', label: '安装 Edge' },
  { value: 'associate_new_openresty', label: '关联新 OpenResty' },
  { value: 'edge_pack_add', label: '升级 Edge(传包)' },
  { value: 'edge_pack_rebase', label: '升级 Edge(切版本)' },
  { value: 'start', label: '启动' },
  { value: 'stop', label: '停止' },
  { value: 'reload', label: 'Reload' },
  { value: 'statistic', label: '状态查询' },
  { value: 'software_check', label: '软件查询' },
  { value: 'cmd_exec', label: '命令执行' },
]

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
  { title: '任务类型', key: 'task_type' },
  { title: '状态', key: 'status' },
  { title: '节点', key: 'nodes' },
  { title: '进度', key: 'progress' },
  { title: '创建时间', key: 'created_at' },
  { title: '操作', key: 'actions', width: 180 },
]

function typeLabel(t: string): string {
  return taskTypes.find((x) => x.value === t)?.label || t
}

// ── software_check matrix ──

interface SoftwareCell { status: 'installed' | 'missing' | 'failed'; pkg: string; ver: string }

function softwareMatrixRows(): string[] {
  const items = detail.value?.items || []
  const rows = new Set<string>()
  for (const item of items) {
    try {
      const data = typeof item.stdout === 'string' ? JSON.parse(item.stdout) : (item.stdout || {})
      Object.keys(data).forEach(k => rows.add(k))
    } catch { /* ignore */ }
  }
  return Array.from(rows)
}

function softwareCell(item: NodeTaskItemData, soft: string): SoftwareCell | null {
  try {
    const data = typeof item.stdout === 'string' ? JSON.parse(item.stdout) : (item.stdout || {})
    const entry = data[soft]
    if (!entry) return null
    if (item.status !== 'success' && entry.installed === undefined) {
      return { status: 'failed', pkg: '', ver: '' }
    }
    return {
      status: entry.installed ? 'installed' : 'missing',
      pkg: entry.pkg || '',
      ver: entry.ver || '',
    }
  } catch {
    return null
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待执行', running: '执行中', success: '成功', partial: '部分成功',
    failed: '失败', cancelled: '已取消', skipped: '跳过',
  }
  return map[s] || s
}

function progressStatus(record: NodeTaskData): 'active' | 'success' | 'exception' {
  if (record.status === 'success') return 'success'
  if (record.status === 'running' || record.status === 'pending') return 'active'
  return 'exception'
}

function progressPercent(record: NodeTaskData): number {
  if (record.total_nodes === 0) return 0
  return Math.round((record.success_nodes / record.total_nodes) * 100)
}

function formatTime(t?: string | null): string {
  if (!t) return '-'
  return new Date(t).toLocaleString()
}

function durationText(item: NodeTaskItemData): string {
  if (!item.started_at || !item.finished_at) return '-'
  const ms = new Date(item.finished_at).getTime() - new Date(item.started_at).getTime()
  return `${Math.max(0, Math.round(ms / 1000))}s`
}

const expandedItem = computed(() => {
  if (!detail.value || !expandedIp.value) return null
  return detail.value.items?.find((i) => i.ip === expandedIp.value) || null
})

async function loadTasks(targetPage = 1) {
  loading.value = true
  page.value = targetPage
  try {
    const res = await listNodeTasks({
      status: filterStatus.value || undefined,
      task_type: filterType.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    tasks.value = res.items
    total.value = res.total
    const currentIds = new Set(tasks.value.map((t) => t.id))
    selectedRowKeys.value = selectedRowKeys.value.filter((id) => currentIds.has(id))
    syncListPolling()
  } finally {
    loading.value = false
  }
}

const LIST_POLL_MS = 3000
let listPollTimer: ReturnType<typeof setInterval> | null = null

function onSelectionChange(keys: number[]) {
  selectedRowKeys.value = keys.map(Number)
}

function syncListPolling() {
  const hasActive = tasks.value.some((t) => t.status === 'pending' || t.status === 'running')
  if (hasActive && !listPollTimer) {
    listPollTimer = setInterval(() => {
      void listPollRefresh()
    }, LIST_POLL_MS)
  } else if (!hasActive && listPollTimer) {
    clearInterval(listPollTimer)
    listPollTimer = null
  }
}

async function listPollRefresh() {
  if (loading.value || detailVisible.value) return
  try {
    const res = await listNodeTasks({
      status: filterStatus.value || undefined,
      task_type: filterType.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    tasks.value = res.items
    total.value = res.total
    const stillActive = tasks.value.some((t) => t.status === 'pending' || t.status === 'running')
    if (!stillActive && listPollTimer) {
      clearInterval(listPollTimer)
      listPollTimer = null
    }
  } catch {
    // transient network error: keep polling
  }
}

function onTableChange(pagination: { current?: number; pageSize?: number }) {
  if (pagination.pageSize && pagination.pageSize !== pageSize.value) {
    pageSize.value = pagination.pageSize
  }
  if (pagination.current) loadTasks(pagination.current)
}

async function openDetail(record: NodeTaskData) {
  detailVisible.value = true
  expandedIp.value = null
  stopStream()
  liveLogs.value = {}
  liveDetail.value = {}
  detail.value = await getNodeTask(record.id)
  if (detail.value && (detail.value.status === 'pending' || detail.value.status === 'running')) {
    startStream(detail.value.id)
  }
}

function stopStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  streamTaskId = 0
}

function applyStreamEvent(ev: TaskStreamEvent) {
  if (!detail.value || ev.task_id !== detail.value.id) return
  if (ev.type === 'log_line' && ev.node_id && ev.line) {
    if (!liveLogs.value[ev.node_id]) liveLogs.value[ev.node_id] = []
    liveLogs.value[ev.node_id] = [...liveLogs.value[ev.node_id], ev.line].slice(-2000)
  } else if (ev.type === 'node_update' && ev.node_id) {
    const item = detail.value.items?.find((i) => i.node_id === ev.node_id)
    if (item) {
      liveDetail.value = { ...liveDetail.value, [ev.node_id]: { ...item, status: ev.status || item.status, rc: ev.rc ?? item.rc } }
    }
  } else if (ev.type === 'task_update') {
    detail.value = {
      ...detail.value,
      status: ev.status || detail.value.status,
      success_nodes: ev.success_nodes ?? detail.value.success_nodes,
      failed_nodes: ev.failed_nodes ?? detail.value.failed_nodes,
      cancelled_nodes: ev.cancelled_nodes ?? detail.value.cancelled_nodes,
    }
  }
}

function startStream(taskId: number) {
  streamTaskId = taskId
  eventSource = new EventSource(`/api/v1/node-tasks/${taskId}/stream`)
  eventSource.onmessage = (msg) => {
    const ev = parseTaskEvent(msg.data)
    if (!ev) return
    applyStreamEvent(ev)
    if (ev.type === 'done') {
      stopStream()
      getNodeTask(taskId).then((fresh) => { detail.value = fresh })
    }
  }
  eventSource.onerror = () => {
    // Fallback to polling while disconnected; EventSource auto-reconnects.
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
      if (!streamTaskId) return
      const fresh = await getNodeTask(streamTaskId)
      detail.value = fresh
      if (!['pending', 'running'].includes(fresh.status)) {
        stopStream()
      }
    }, 2000)
  }
}

function streamItem(record: NodeTaskItemData): NodeTaskItemData {
  if (streamTaskId && liveDetail.value[record.node_id]) {
    return { ...record, ...liveDetail.value[record.node_id] }
  }
  return record
}

function streamLogLines(record: NodeTaskItemData): string[] {
  if (liveLogs.value[record.node_id] && liveLogs.value[record.node_id].length > 0) {
    return liveLogs.value[record.node_id]
  }
  return record.logs.map((l) => l.line)
}

async function loadFullLog(record: NodeTaskItemData) {
  if (!detail.value) return
  expandedIp.value = record.ip
  try {
    const content = await fetchTaskItemLog(detail.value.id, record.node_id)
    if (content) {
      const lines = content.split('\n')
      liveLogs.value = { ...liveLogs.value, [record.node_id]: lines }
    }
  } catch {
    message.warning('完整日志加载失败')
  }
}

function isLiveTask(): boolean {
  return !!detail.value && ['pending', 'running'].includes(detail.value.status)
}

onMounted(() => loadTasks(1))
onBeforeUnmount(() => {
  stopStream()
  if (listPollTimer) {
    clearInterval(listPollTimer)
    listPollTimer = null
  }
})

async function handleCancel(record: NodeTaskData) {
  await cancelNodeTask(record.id)
  message.success('任务取消已发起')
  if (detailVisible.value && detail.value?.id === record.id) {
    detail.value = await getNodeTask(record.id)
  }
  loadTasks(page.value)
}

function showRetryConfirm(record: NodeTaskData, onOk: () => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const close = () => {
    render(null, container)
    container.remove()
  }

  const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
    h('div', { class: 'modal', style: 'max-width:520px;' }, [
      h('div', { class: 'modal-header' }, [
        h('h2', '确认重试任务'),
        h('button', { class: 'modal-close', onClick: close }, '\u00D7'),
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { style: 'font-size:14px;color:var(--danger);margin-bottom:12px;font-weight:500;' },
          `任务 #${record.id}（${typeLabel(record.task_type)}）`),
        h('div', { style: 'font-size:13px;color:var(--fg);line-height:1.7;' }, [
          h('p', { style: 'margin:0 0 8px;' },
            `将重新执行该任务的失败/取消节点：失败 ${record.failed_nodes} 个、取消 ${record.cancelled_nodes} 个。`),
          h('p', { style: 'margin:0;color:var(--muted);' },
            '已成功的节点不会被重复执行。重试前请确认相关节点已恢复正常。'),
        ]),
      ]),
      h('div', { class: 'modal-footer' }, [
        h('button', { class: 'btn btn-secondary', onClick: close }, '取消'),
        h('button', {
          class: 'btn btn-danger',
          onClick: () => {
            close()
            onOk()
          },
        }, '确认重试'),
      ]),
    ]),
  ])

  render(vnode, container)
}

function handleRetry(record: NodeTaskData) {
  showRetryConfirm(record, async () => {
    await retryNodeTask(record.id)
    message.success('任务重试已发起')
    if (detailVisible.value && detail.value?.id === record.id) {
      detail.value = await getNodeTask(record.id)
      if (['pending', 'running'].includes(detail.value.status)) {
        startStream(detail.value.id)
      }
    }
    loadTasks(page.value)
  })
}

function showDeleteConfirm(titleLine: string, description: string, onOk: () => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const close = () => {
    render(null, container)
    container.remove()
  }

  const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
    h('div', { class: 'modal', style: 'max-width:520px;' }, [
      h('div', { class: 'modal-header' }, [
        h('h2', '确认删除任务'),
        h('button', { class: 'modal-close', onClick: close }, '\u00D7'),
      ]),
      h('div', { class: 'modal-body' }, [
        h('div', { style: 'font-size:14px;color:var(--danger);margin-bottom:12px;font-weight:500;' }, titleLine),
        h('div', { style: 'font-size:13px;color:var(--fg);line-height:1.7;' }, [
          h('p', { style: 'margin:0 0 8px;' }, description),
          h('p', { style: 'margin:0;color:var(--muted);' }, '删除后不可恢复，请谨慎操作。'),
        ]),
      ]),
      h('div', { class: 'modal-footer' }, [
        h('button', { class: 'btn btn-secondary', onClick: close }, '取消'),
        h('button', {
          class: 'btn btn-danger',
          onClick: () => {
            close()
            onOk()
          },
        }, '确认删除'),
      ]),
    ]),
  ])

  render(vnode, container)
}

async function handleDelete(record: NodeTaskData) {
  showDeleteConfirm(
    `任务 #${record.id}（${typeLabel(record.task_type)}）`,
    '将删除该任务的数据库记录及其日志文件。',
    async () => {
      try {
        await deleteNodeTask(record.id)
        message.success('任务已删除')
        if (detailVisible.value && detail.value?.id === record.id) {
          closeDetail()
        }
        loadTasks(page.value)
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '删除任务失败')
      }
    },
  )
}

async function handleBatchDelete() {
  const ids = [...selectedRowKeys.value]
  if (ids.length === 0) return
  showDeleteConfirm(
    `将删除 ${ids.length} 个任务`,
    '将删除所选任务的数据库记录及其日志文件；执行中/待执行任务会被跳过。',
    async () => {
      try {
        const res = await batchDeleteNodeTasks(ids)
        const deleted = res.deleted?.length || 0
        const skipped = res.skipped?.length || 0
        if (deleted > 0) message.success(`已删除 ${deleted} 个任务${skipped > 0 ? `，${skipped} 个跳过（执行中/不存在）` : ''}`)
        else if (skipped > 0) message.warning('所选任务均执行中或不存在，未删除')
        selectedRowKeys.value = []
        if (detailVisible.value && detail.value && ids.includes(detail.value.id)) {
          closeDetail()
        }
        loadTasks(page.value)
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '批量删除失败')
      }
    },
  )
}

function closeDetail() {
  stopStream()
  detailVisible.value = false
  detail.value = null
  liveLogs.value = {}
  liveDetail.value = {}
}

async function openCreateModal() {
  createVisible.value = true
  createClusterId.value = 0
  createNodeIds.value = []
  createTaskType.value = ''
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  edgePackFiles.value = []
  selectedPackFile.value = ''
  edgePackVersions.value = []
  selectedPackVersion.value = ''
  createNodes.value = []
  resetCmdExecForm()
  if (clusters.value.length === 0) {
    const res = await api.get('/clusters', { params: { page_size: 100 } })
    clusters.value = res.data.items || res.data || []
  }
}

async function loadEdgePackFiles() {
  if (!createClusterId.value) return
  const res = await api.get(`/clusters/${createClusterId.value}/nodes/edge-pack-files`)
  edgePackFiles.value = res.data?.files || []
}

async function loadEdgePackVersions() {
  const firstNode = createNodes.value[0]
  if (!createClusterId.value || !firstNode) return
  const res = await api.get(`/clusters/${createClusterId.value}/nodes/${firstNode.id}/edge-pack-list`)
  edgePackVersions.value = res.data?.versions || []
}

async function onTaskTypeChange() {
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  selectedPackFile.value = ''
  selectedPackVersion.value = ''
  if (createTaskType.value === 'install_openresty' && createClusterId.value) {
    const res = await api.get(`/clusters/${createClusterId.value}/nodes/openresty-files`)
    openrestyFiles.value = res.data?.files || res.data || []
  }
  if (createTaskType.value === 'edge_pack_add' && createClusterId.value) {
    loadEdgePackFiles()
  }
  if (createTaskType.value === 'edge_pack_rebase' && createNodeIds.value.length > 0) {
    loadEdgePackVersions()
  }
}

watch(createTaskType, () => onTaskTypeChange())
watch(createClusterId, () => {
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  selectedPackFile.value = ''
  edgePackVersions.value = []
  selectedPackVersion.value = ''
})

async function loadCreateNodes() {
  createNodeIds.value = []
  createNodes.value = []
  if (!createClusterId.value) return
  const res = await api.get(`/clusters/${createClusterId.value}/nodes`, { params: { page_size: 100 } })
  createNodes.value = res.data.items || []
}

watch(createNodeIds, () => {
  if (createTaskType.value === 'edge_pack_rebase' && createNodeIds.value.length > 0) {
    loadEdgePackVersions()
  }
})

async function submitCreateTask() {
  if (!createClusterId.value || createNodeIds.value.length === 0 || !createTaskType.value) {
    message.warning('请选择集群、节点和操作类型')
    return
  }
  if (createTaskType.value === 'install_openresty' && !createOpenrestyFile.value) {
    message.warning('请选择 OpenResty 安装包')
    return
  }
  if (createTaskType.value === 'edge_pack_add' && !selectedPackFile.value) {
    message.warning('请选择 Edge 版本包')
    return
  }
  if (createTaskType.value === 'edge_pack_rebase' && !selectedPackVersion.value) {
    message.warning('请选择目标版本')
    return
  }
  const params: Record<string, unknown> = {}
  if (createTaskType.value === 'install_openresty') {
    params.openresty_file = createOpenrestyFile.value
  }
  if (createTaskType.value === 'edge_pack_add') {
    params.pack_file = selectedPackFile.value
  }
  if (createTaskType.value === 'edge_pack_rebase') {
    params.version = selectedPackVersion.value
  }
  if (createTaskType.value === 'software_check') {
    params.software_list = softwareSelected.value
  }
  if (createTaskType.value === 'cmd_exec') {
    params.cmd = cmdCommand.value
    params.security = cmdSecurity.value
    params.timeout = cmdTimeout.value
    if (cmdSecurity.value === 'whitelist' && cmdCustomWhitelist.value.length > 0) {
      params.whitelist = [...cmdCustomWhitelist.value]
    }
  }
  try {
    await createNodeTask(createClusterId.value, createTaskType.value, createNodeIds.value, params)
    message.success('任务已创建')
    createVisible.value = false
    loadTasks(1)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '创建任务失败')
  }
}
</script>

<style scoped>
.node-task-list { padding: 20px 24px; }

.node-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}

/* ── 表格外框 ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-container :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
}

/* ── 表头 ── */
.node-task-table :deep(.ant-table-thead > tr > th) {
  background: oklch(97% 0.005 250);
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
  border-bottom: 1px solid var(--border) !important;
}
.node-task-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
.node-task-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px !important;
  font-size: 13px !important;
  white-space: nowrap !important;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.node-task-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
.node-task-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

.status-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
}
.status-success { background: oklch(70% 0.14 145 / 15%); color: var(--success, #16a34a); }
.status-failed { background: oklch(55% 0.18 28 / 12%); color: var(--danger, #dc2626); }
.status-running { background: oklch(56% 0.16 210 / 12%); color: var(--accent, #2563eb); }
.status-pending { background: oklch(55% 0.05 260 / 10%); color: var(--muted, #888); }
.status-partial { background: oklch(75% 0.14 85 / 15%); color: #b45309; }
.status-cancelled, .status-skipped { background: oklch(55% 0.05 260 / 10%); color: var(--muted, #888); }
.progress-bar-wrap {
  background: #f0f0f0;
  border-radius: 4px;
  height: 8px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.progress-active { background: var(--accent, #2563eb); }
.progress-success { background: var(--success, #16a34a); }
.progress-exception { background: var(--danger, #dc2626); }
</style>
