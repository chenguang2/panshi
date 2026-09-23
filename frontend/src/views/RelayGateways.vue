<template>
  <div class="relay-gateways">
    <PageHeader
      title="中继区域管理"
      description="维护跨中心中继网关的区域注册表：每个路局一条区域记录（网关 HTTP 腿 + SSH 跳板）。区域路由为空的集群按直连执行；首次装机点「初始化网关」写入 8443 配置并启动服务，节点白名单变更点「下发配置」同步。"
    >
      <template #actions>
        <button class="btn btn-primary" @click="openCreate">+ 新建区域</button>
      </template>
    </PageHeader>

    <div class="card">
      <div class="card-header">
        <h3>区域列表</h3>
      </div>
      <div class="card-body table-body">
        <a-table
          :columns="columns"
          :data-source="regions"
          :loading="loading"
          row-key="id"
          :pagination="false"
          class="region-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'code'">
              <a-tag color="blue">{{ record.code }}</a-tag>
            </template>
            <template v-else-if="column.key === 'http_base_url'">
              <span class="mono">{{ record.http_base_url || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'ssh_jump'">
              <span class="mono">{{ record.ssh_jump || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'openresty_prefix'">
              <span class="mono">{{ record.openresty_prefix || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <span :class="record.status === 'enabled' ? 'badge badge-success' : 'badge badge-neutral'">
                {{ record.status === 'enabled' ? '启用' : '禁用（直连回退）' }}
              </span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <div class="table-actions">
                <button class="btn btn-secondary btn-sm" :disabled="busy" @click="openEdit(record)">编辑</button>
                <button class="btn btn-secondary btn-sm" :disabled="busy" @click="handleToggle(record)">
                  {{ record.status === 'enabled' ? '禁用' : '启用' }}
                </button>
                <button class="btn btn-secondary btn-sm" :disabled="busy || testing" @click="handleTest(record)">
                  {{ testingId === record.id ? '测试中…' : '连通性测试' }}
                </button>
                <button class="btn btn-secondary btn-sm" :disabled="busy" @click="handleInit(record)">
                  {{ activeId === record.id && activeKind === 'init' ? '初始化中…' : '初始化网关' }}
                </button>
                <button class="btn btn-primary btn-sm" :disabled="busy" @click="handlePush(record)">
                  {{ activeId === record.id && activeKind === 'push' ? '下发中…' : '下发配置' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="openConfigPreview(record)">查看配置</button>
                <button class="btn btn-secondary btn-sm" :disabled="busy" @click="openSshdSetup(record)">
                  {{ activeId === record.id && activeKind === 'sshd' ? '配置中…' : '配置跳板转发' }}
                </button>
                <button class="btn btn-danger btn-sm" :disabled="busy" @click="handleDelete(record)">删除</button>
              </div>
            </template>
          </template>
        </a-table>
        <div v-if="!loading && regions.length === 0" class="empty-hint">
          暂无区域。未配置任何区域时，全部集群按现状直连执行。
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗（视图级内联弹窗，约定 #25） -->
    <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ modal.editing ? '编辑区域' : '新建区域' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">区域码 <span class="required">*</span></label>
              <input
                type="text"
                class="form-input"
                :class="{ 'has-error': formErrors.code }"
                v-model="form.code"
                :disabled="modal.editing"
                placeholder="小写字母开头，小写字母/数字/中划线，如 luju"
              />
            </div>
            <span v-if="formErrors.code" class="form-error">{{ formErrors.code }}</span>
            <span v-else class="form-hint">创建后不可修改；用于集群挂接与网关配置渲染</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <div class="field-inline">
                <label class="form-label">展示名 <span class="required">*</span></label>
                <input type="text" class="form-input" v-model="form.name" placeholder="如：路局A" />
              </div>
            </div>
            <div class="form-group">
              <div class="field-inline">
                <label class="form-label">状态</label>
                <select class="form-input" v-model="form.status">
                  <option value="enabled">启用</option>
                  <option value="disabled">禁用（该区域回退直连）</option>
                </select>
              </div>
            </div>
          </div>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">网关 HTTP 腿</label>
              <input
                type="text"
                class="form-input"
                v-model="form.http_base_url"
                placeholder="如 http://10.10.1.1:8443（留空 = 直连）"
              />
            </div>
            <span class="form-hint">该局网关的 HTTP 反向代理地址；留空表示该区域直连</span>
          </div>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">SSH 跳板</label>
              <input
                type="text"
                class="form-input"
                v-model="form.ssh_jump"
                placeholder="如 tunnel@10.10.1.1:22（留空 = 直连）"
              />
            </div>
            <span class="form-hint">跳板专用账号与网关地址；留空表示该区域 SSH 直连</span>
          </div>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">OpenResty 前缀</label>
              <input
                type="text"
                class="form-input"
                v-model="form.openresty_prefix"
                placeholder="如 /work/jboss/tunnel/openresty-1.21.4.1/nginx"
              />
            </div>
            <span class="form-hint">网关机 OpenResty 安装前缀（含 conf/sbin/logs）；「初始化网关」必填</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 配置预览（只读）：展示将写入网关机的文件内容，可复制；ansible 不可用时据此手工配置 -->
    <div v-if="configModal.open" class="modal-overlay" @click.self="configModal.open = false">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>配置预览 · {{ configModal.regionName }}</h2>
          <button class="modal-close" @click="configModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="configModal.loading" class="config-hint">加载中…</div>
          <template v-else-if="configModal.data">
            <p class="config-hint">
              区域 <a-tag color="blue">{{ configModal.data.region_code }}</a-tag> OpenResty 前缀
              <code>{{ configModal.data.openresty_prefix }}</code> · 监听端口 {{ configModal.data.listen_port }}
            </p>
            <div v-for="f in configModal.data.files" :key="f.path" class="config-file">
              <div class="config-file-head">
                <div class="config-file-meta">
                  <div class="config-file-path">{{ f.path }}</div>
                  <div class="config-file-purpose">{{ f.purpose }}</div>
                </div>
                <button class="btn btn-secondary btn-sm" @click="copyText(f.content)">复制</button>
              </div>
              <pre class="config-pre">{{ f.content }}</pre>
            </div>
            <ul class="config-notes">
              <li v-for="(n, i) in configModal.data.notes" :key="i">{{ n }}</li>
            </ul>
          </template>
          <div v-else class="config-hint">加载失败，请重试</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="configModal.open = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 配置网关 sshd 跳板转发（需 root；凭据仅本次使用，不保存） -->
    <div v-if="sshdModal.open" class="modal-overlay" @click.self="closeSshdSetup">
      <div class="modal">
        <div class="modal-header">
          <h2>配置跳板转发 · {{ sshdModal.record?.name }}</h2>
          <button class="modal-close" @click="closeSshdSetup">&times;</button>
        </div>
        <div class="modal-body">
          <p class="config-hint">
            网关 sshd 默认禁止 TCP 转发（跳板查询会报 <code>administratively prohibited</code>）。此处以 root
            在网关机写入 <code>/etc/ssh/sshd_config.d/relay-tunnel.conf</code>
            （放行转发 + 仅允许连本局节点 SSH 端口）并重载 sshd；校验失败会自动回滚，不影响正在运行的 sshd。
          </p>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">root 账号</label>
              <input type="text" class="form-input" v-model="sshdModal.root_user" placeholder="root" />
            </div>
          </div>
          <div class="form-group">
            <div class="field-inline">
              <label class="form-label">root 密码</label>
              <input
                type="password"
                class="form-input"
                v-model="sshdModal.root_password"
                placeholder="请输入 root 密码（仅本次使用，不保存）"
              />
            </div>
            <span class="form-hint">仅本次注入网关清单用于连接，跑完立即还原；不落库、不打日志</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeSshdSetup">取消</button>
          <button class="btn btn-primary" :disabled="!sshdModal.root_password" @click="submitSshdSetup">
            开始配置
          </button>
        </div>
      </div>
    </div>

    <!-- 执行过程抽屉：复用节点管理同款（实时 stdout + 进度 + 终态） -->
    <NodeExecutionResultDrawer
      v-model:visible="execDrawerVisible"
      :title="execDrawerTitle"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="null"
      :installing="execInstalling"
      :stream-error="execError"
      :stream-status="execStreamStatus"
      @cancel="cancelExec"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { useInstallStream } from '@/composables/useInstallStream'
import {
  createRelayGateway,
  deleteRelayGateway,
  getRelayConfigPreview,
  listRelayGateways,
  relayHealthCheck,
  relayInitStreamUrl,
  relayPushStreamUrl,
  relaySshdSetupStreamUrl,
  updateRelayGateway,
  type RelayConfigPreview,
  type RelayGateway,
  type RelayHealthResult,
} from '@/api/relay'
import { getApiErrorMessage } from '@/utils/error'

const CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/

const regions = ref<RelayGateway[]>([])
const loading = ref(false)
const testing = ref(false)
const testingId = ref<number | null>(null)
const activeKind = ref<'init' | 'push' | 'sshd' | null>(null)
const activeId = ref<number | null>(null)

// 执行过程抽屉：复用节点管理同款 NodeExecutionResultDrawer + useInstallStream（SSE），
// 与「安装 OpenResty」一致，可实时看到 stdout 行、进度与终态。
const installStream = useInstallStream()
const { installing: execInstalling, error: execError, status: execStreamStatus } = installStream
const execDrawerVisible = ref(false)
const execDrawerTitle = ref('执行结果')

// 配置跳板转发（需 root）：root 凭据仅本次使用、提交后立即清空，不落库、不持久化
const sshdModal = reactive({
  open: false,
  record: null as RelayGateway | null,
  root_user: 'root',
  root_password: '',
})
const execProgress = reactive({ percent: 0, status: 'active' as 'active' | 'success' | 'exception' })
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
const execHighlights = ref<string[]>([])
let finalEvent: Record<string, unknown> | null = null
let elapsedTimer: number | undefined

const busy = computed(() => execInstalling.value)

const columns = [
  { title: '区域码', key: 'code' },
  { title: '展示名', dataIndex: 'name', key: 'name' },
  { title: '网关 HTTP 腿', key: 'http_base_url' },
  { title: 'SSH 跳板', key: 'ssh_jump' },
  { title: 'OpenResty 前缀', key: 'openresty_prefix' },
  { title: '状态', key: 'status' },
  { title: '操作', key: 'actions', width: 400 },
]

const modal = reactive({ open: false, editing: false })
const submitting = ref(false)
const form = reactive({
  id: 0,
  code: '',
  name: '',
  http_base_url: '',
  ssh_jump: '',
  openresty_prefix: '',
  status: 'enabled',
})
const formErrors = reactive({ code: '' })

// 配置预览弹窗（只读）：内容由后端用与下发相同的渲染函数产出
const configModal = reactive({
  open: false,
  loading: false,
  regionName: '',
  data: null as RelayConfigPreview | null,
})

async function openConfigPreview(record: RelayGateway) {
  configModal.open = true
  configModal.loading = true
  configModal.regionName = record.name
  configModal.data = null
  try {
    const res = await getRelayConfigPreview(record.id)
    configModal.data = res.data
  } catch (e) {
    message.error(getApiErrorMessage(e))
    configModal.open = false
  } finally {
    configModal.loading = false
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动选择文本复制')
  }
}

async function load() {
  loading.value = true
  try {
    const res = await listRelayGateways()
    regions.value = res.data
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  modal.editing = false
  modal.open = true
  form.id = 0
  form.code = ''
  form.name = ''
  form.http_base_url = ''
  form.ssh_jump = ''
  form.openresty_prefix = ''
  form.status = 'enabled'
  formErrors.code = ''
}

function openEdit(record: RelayGateway) {
  modal.editing = true
  modal.open = true
  form.id = record.id
  form.code = record.code
  form.name = record.name
  form.http_base_url = record.http_base_url || ''
  form.ssh_jump = record.ssh_jump || ''
  form.openresty_prefix = record.openresty_prefix || ''
  form.status = record.status
  formErrors.code = ''
}

function closeModal() {
  modal.open = false
}

function validateCode(): boolean {
  if (!CODE_PATTERN.test(form.code)) {
    formErrors.code = '区域码格式错误：小写字母开头，仅含小写字母/数字/中划线，长度 2-32'
    return false
  }
  formErrors.code = ''
  return true
}

async function handleSubmit() {
  if (!validateCode()) return
  if (!form.name) {
    message.error('请输入展示名')
    return
  }
  submitting.value = true
  try {
    if (modal.editing) {
      await updateRelayGateway(form.id, {
        name: form.name,
        http_base_url: form.http_base_url || null,
        ssh_jump: form.ssh_jump || null,
        openresty_prefix: form.openresty_prefix || null,
        status: form.status,
      })
      message.success('区域已更新')
    } else {
      await createRelayGateway({
        code: form.code,
        name: form.name,
        http_base_url: form.http_base_url || null,
        ssh_jump: form.ssh_jump || null,
        openresty_prefix: form.openresty_prefix || null,
        status: form.status,
      })
      message.success('区域已创建')
    }
    modal.open = false
    await load()
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    submitting.value = false
  }
}

function handleToggle(record: RelayGateway) {
  const next = record.status === 'enabled' ? 'disabled' : 'enabled'
  showOverlayModal({
    title: next === 'disabled' ? '禁用区域' : '启用区域',
    content: h(
      'p',
      null,
      next === 'disabled'
        ? `禁用后「${record.name}」的节点将回退直连执行（直连通常不可达，操作会失败并附提示）。确认禁用？`
        : `启用后「${record.name}」的节点将按网关路由执行。确认启用？`,
    ),
    okText: '确认',
    onOk: async () => {
      try {
        await updateRelayGateway(record.id, { status: next })
        message.success(next === 'disabled' ? '区域已禁用' : '区域已启用')
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

async function handleTest(record: RelayGateway) {
  testing.value = true
  testingId.value = record.id
  try {
    const res = await relayHealthCheck(record.code)
    const result = res.data as RelayHealthResult
    const lines = result.segments
      .map((s) => {
        const head = `${s.name}：${s.ok ? '✓ 可达' : `✗ ${s.error || '不可达'}`}`
        const notes = (s.nodes || []).filter((n) => n.ssh_skipped && n.note).map((n) => `\u3000└ ${n.node}：${n.note}`)
        return [head, ...notes].join('\n')
      })
      .join('\n')
    if (result.ok) {
      message.success(`「${record.name}」连通性测试通过\n${lines}`)
    } else {
      message.warning(`「${record.name}」连通性异常\n${lines}`)
    }
  } catch (e) {
    message.error(getApiErrorMessage(e))
  } finally {
    testing.value = false
    testingId.value = null
  }
}

function startElapsedTimer() {
  const startedAt = Date.now()
  execElapsed.value = 0
  elapsedTimer = window.setInterval(() => {
    execElapsed.value = Math.floor((Date.now() - startedAt) / 1000)
    // 无真实进度时按用时兜底推进进度条（同 NodeList.vue 的安装弹窗）
    const pct = Math.min(Math.round(((execElapsed.value ?? 0) / 200) * 100), 99)
    if (pct > execProgress.percent) execProgress.percent = pct
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer !== undefined) {
    window.clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }
}

/** 结束执行态：恢复行内按钮文案/禁用（activeKind/activeId 必须清空，否则按钮停留在「初始化中...」）。 */
function resetActiveState() {
  activeKind.value = null
  activeId.value = null
}

/** 打开执行过程抽屉并开始 SSE 流（复用节点安装的流式模型）。 */
function startExec(record: RelayGateway, kind: 'init' | 'push' | 'sshd', body: Record<string, unknown> = {}) {
  const isInit = kind === 'init'
  const label = { init: '初始化网关', push: '下发配置', sshd: '配置跳板转发' }[kind]
  const url =
    kind === 'init'
      ? relayInitStreamUrl(record.id)
      : kind === 'push'
        ? relayPushStreamUrl(record.id)
        : relaySshdSetupStreamUrl(record.id)
  activeKind.value = kind
  activeId.value = record.id
  finalEvent = null
  execDrawerTitle.value = `${label} - ${record.name}`
  execDrawerVisible.value = true
  execLogs.value = []
  execHighlights.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(url, body, {
    onLine: (line: string) => {
      // useInstallStream 对无 line 字段的结构化事件以 JSON 字符串转发；此处仅捕获终态
      // 事件（含 rc/status/hosts_pattern/listen_port），不混入日志。
      if (line.startsWith('{"')) {
        try {
          finalEvent = JSON.parse(line) as Record<string, unknown>
          return
        } catch {
          /* 非 JSON：按普通日志处理 */
        }
      }
      execLogs.value = [...execLogs.value, line]
    },
    onProgress: (percent: number) => {
      if (percent > execProgress.percent) execProgress.percent = percent
    },
    onComplete: (rc: number, status: string) => {
      // 收到终态事件即结束加载态/恢复按钮（不等底层流关闭，避免按钮卡在「初始化中...」）
      installStream.forceComplete()
      stopElapsedTimer()
      resetActiveState()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: '', rc }
      const hosts = (finalEvent?.hosts_pattern as string) || `gateways_${record.code}`
      const port = (finalEvent?.listen_port as number) || 8443
      execHighlights.value =
        rc === 0
          ? kind === 'init'
            ? [`初始化完成：${hosts}，监听 ${port}`]
            : kind === 'push'
              ? [`下发完成：${hosts}`]
              : [`sshd 跳板转发配置完成：${hosts}`]
          : [`执行失败（rc=${rc}，${status}）`]
      if (rc === 0) {
        message.success(isInit ? `初始化完成（${hosts}，监听 ${port}）` : `配置已下发（${hosts}）`)
      } else {
        message.error(`${isInit ? '初始化' : '下发'}失败（rc=${rc}），详见执行日志`)
      }
      load()
    },
    onError: (err: string) => {
      stopElapsedTimer()
      resetActiveState()
      execProgress.status = 'exception'
      execError.value = err
      execLogs.value = [...execLogs.value, `❌ ${err}`]
      message.error(err)
    },
  })
}

function cancelExec() {
  installStream.cancel()
  stopElapsedTimer()
  resetActiveState()
  execProgress.status = 'exception'
}

function handleInit(record: RelayGateway) {
  const modal = showOverlayModal({
    title: '初始化网关',
    content: h('div', null, [
      h(
        'p',
        null,
        `将 8443 监听 server 块与当前白名单写入「${record.name}」网关机（OpenResty 前缀：${record.openresty_prefix || '未配置'}），校验后启动/重载。`,
      ),
      h(
        'p',
        { style: 'color: var(--muted); font-size: 12px' },
        '幂等可重复执行；首次装机必做，后续白名单变更走「下发配置」。确认后打开执行日志，可实时查看过程。',
      ),
    ]),
    okText: '开始初始化',
    onOk: () => {
      if (!record.openresty_prefix) {
        message.error('区域未配置 OpenResty 前缀，请先编辑区域填写')
        return
      }
      startExec(record, 'init')
    },
  })
}

function openSshdSetup(record: RelayGateway) {
  sshdModal.record = record
  sshdModal.root_user = 'root'
  sshdModal.root_password = ''
  sshdModal.open = true
}

function closeSshdSetup() {
  sshdModal.open = false
  sshdModal.root_password = '' // 凭据不留存
  sshdModal.record = null
}

function submitSshdSetup() {
  const record = sshdModal.record
  if (!record) return
  if (!sshdModal.root_password) {
    message.warning('请输入 root 密码')
    return
  }
  const body = { root_user: sshdModal.root_user || 'root', root_password: sshdModal.root_password }
  closeSshdSetup()
  startExec(record, 'sshd', body)
}

function handlePush(record: RelayGateway) {
  showOverlayModal({
    title: '下发网关配置',
    content: h('div', null, [
      h('p', null, `将「${record.name}」的节点白名单（nginx map）推送到该局全部网关机。`),
      h(
        'p',
        { style: 'color: var(--muted); font-size: 12px' },
        '双机全部成功才算成功；sshd PermitOpen 腿暂缓（需特权，待部署方案确定后开启）。确认后打开执行日志，可实时查看过程。',
      ),
    ]),
    okText: '开始下发',
    onOk: () => startExec(record, 'push'),
  })
}

function handleDelete(record: RelayGateway) {
  showOverlayModal({
    title: '删除区域',
    content: h('p', null, `确认删除区域「${record.name}」（${record.code}）？仍被集群挂接时将拒绝删除。`),
    okText: '确认删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteRelayGateway(record.id)
        message.success('区域已删除')
        await load()
      } catch (e) {
        message.error(getApiErrorMessage(e))
      }
    },
  })
}

onMounted(load)

// 离开页面时停掉计时器并主动中止 SSE，避免后台残留定时器/连接
onUnmounted(() => {
  stopElapsedTimer()
  installStream.cancel()
})
</script>

<style scoped>
.relay-gateways {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 区域列表表格 ── */
.mono {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px;
}
.table-body {
  padding: 0;
}
.region-table :deep(.ant-table) {
  background: transparent;
}
.region-table :deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%);
  border-bottom: 2px solid var(--accent);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 8px;
  white-space: nowrap;
}
.region-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}
.region-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted);
  font-size: 13px;
  white-space: nowrap;
}
.region-table :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}
.region-table :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg);
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.empty-hint {
  padding: 14px 16px;
  font-size: 13px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}

/* ── 弹窗表单：标签与输入同行（同 ClickHouse 配置页） ── */
.field-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.field-inline .form-label {
  margin-bottom: 0;
  white-space: nowrap;
}
.field-inline .form-input {
  flex: 1 1 140px;
  min-width: 0;
}

/* ── 配置预览弹窗内容 ── */
.config-hint {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 12px;
}
.config-file {
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.config-file-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg);
}
.config-file-path {
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}
.config-file-purpose {
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.config-pre {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 240px;
  overflow: auto;
  white-space: pre;
}
.config-notes {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
  padding-left: 18px;
}
.config-notes li {
  margin-bottom: 4px;
}
</style>
