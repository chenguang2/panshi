<template>
  <div class="autostart-page">
    <PageHeader
      title="自启动管理"
      description="管理 Edge 节点开机自启动（systemd）。启用：写入 /etc/systemd/system/edge.service 并 enable（覆盖同名文件）；禁用：取消防开机自启，服务文件保留可随时重新启用；root 凭据仅本次使用，不保存"
    >
      <template #actions>
        <router-link
          v-if="canViewAudit"
          :to="{ path: '/audit-log', query: { resource: 'autostart' } }"
          class="btn btn-secondary"
          >操作日志</router-link
        >
      </template>
    </PageHeader>

    <div class="toolbar">
      <a-select
        v-model:value="clusterFilter"
        style="width: 200px"
        placeholder="全部集群"
        allow-clear
        @change="loadNodes"
      >
        <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{
          c.display_name || c.name
        }}</a-select-option>
      </a-select>
      <a-input-search
        v-model:value="ipSearch"
        style="width: 200px"
        placeholder="搜索节点 IP"
        allow-clear
      ></a-input-search>
      <a-select v-model:value="statusFilter" style="width: 140px" placeholder="全部状态" allow-clear>
        <a-select-option value="enabled">已启用</a-select-option>
        <a-select-option value="disabled">已禁用</a-select-option>
        <a-select-option value="not_configured">未配置</a-select-option>
        <a-select-option value="permission_denied">查询受限</a-select-option>
        <a-select-option value="unknown">查询失败</a-select-option>
        <a-select-option value="not_queried">未查询</a-select-option>
      </a-select>
      <a-button @click="loadNodes">
        <a-tooltip
          title="重新读取数据库中已记录的自启动状态（不触达节点）；要获取节点真实状态请使用「批量查询状态」"
          placement="top"
        >
          <span>重载</span>
        </a-tooltip>
      </a-button>
      <div class="toolbar-sep"></div>
      <a-button
        class="batch-query"
        size="small"
        :disabled="!batchTargetNodes.length || batchState.running"
        @click="openBatchQuery"
      >
        批量查询状态（{{ batchTargetNodes.length }} 台）
      </a-button>
      <a-button
        size="small"
        :disabled="!batchTargetNodes.length || batchState.running"
        @click="openBatchCredential('enable')"
      >
        批量启用（{{ batchTargetNodes.length }} 台）
      </a-button>
      <a-button
        size="small"
        danger
        :disabled="!batchTargetNodes.length || batchState.running"
        @click="openBatchCredential('disable')"
      >
        批量禁用（{{ batchTargetNodes.length }} 台）
      </a-button>
    </div>

    <div class="table-container">
      <a-table
        :data-source="pagedNodes"
        :columns="columns"
        :loading="loading"
        :pagination="paginationProps({ page, pageSize, total: filteredNodes.length }, '个节点')"
        :row-selection="{ selectedRowKeys, onChange: onSelectionChange }"
        row-key="id"
        size="middle"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            {{ (page - 1) * pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tooltip :title="statusTagTooltip(record)">
              <a-tag :color="statusTag(record).color" :class="{ 'autostart-tag-outline': statusTag(record).outline }">{{
                statusTag(record).label
              }}</a-tag>
            </a-tooltip>
            <!-- meta 行恒渲染（无记录显示 —）：行高全表一致，翻页表格总高不漂移、分页条不跳动
                 （对齐上游管理 `|| '-'` 模式；条件渲染会让每页行高混排不同 → 分页条弹开） -->
            <div class="status-meta">
              {{
                record.autostart_record && record.autostart_record.updated_at
                  ? `${formatDateTime(record.autostart_record.updated_at)} · ${autostartActionLabel(
                      record.autostart_record.action,
                    ).replace('最后操作：', '')}`
                  : '—'
              }}
            </div>
          </template>
          <template v-else-if="column.key === 'edge_path'">
            <a-tooltip :title="record.edge_path">
              <span class="edge-path-cell">{{ record.edge_path }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key !== 'action'">
            {{ record[column.key] }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-tooltip :title="actionDisabledReason(record)" placement="topLeft">
              <span class="op-wrap">
                <a-button size="small" :disabled="!!actionDisabledReason(record)" @click="openAction(record, 'enable')">
                  启用
                </a-button>
              </span>
            </a-tooltip>
            <a-tooltip :title="actionDisabledReason(record)" placement="topLeft">
              <span class="op-wrap">
                <a-button
                  size="small"
                  danger
                  style="margin-left: 6px"
                  :disabled="!!actionDisabledReason(record)"
                  @click="openAction(record, 'disable')"
                  >禁用</a-button
                >
              </span>
            </a-tooltip>
            <a-tooltip :title="actionDisabledReason(record)" placement="topLeft">
              <span class="op-wrap">
                <a-button
                  size="small"
                  style="margin-left: 6px"
                  :disabled="!!actionDisabledReason(record)"
                  @click="openAction(record, 'status')"
                  >查询状态</a-button
                >
              </span>
            </a-tooltip>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 高级参数 / root 凭据抽屉（启用/禁用，参考路由插件编辑抽屉风格） -->
    <a-drawer
      v-model:open="actionModalVisible"
      :title="action === 'enable' ? '启用自启动' : action === 'disable' ? '禁用自启动' : '查询自启动状态'"
      width="560"
      :closable="true"
      @close="actionModalVisible = false"
    >
      <a-form layout="vertical">
        <!-- 风险说明块（design D3）：禁用 = 重启不拉起；启用 = 写入并覆盖 service 文件 -->
        <a-alert
          v-if="action === 'disable'"
          type="warning"
          show-icon
          style="margin-bottom: 16px"
          message="禁用后，该节点下次重启时 Edge 将不会自动启动，需人工登录节点处理；服务文件保留，可随时重新启用"
        />
        <a-alert
          v-else-if="action === 'enable'"
          type="info"
          show-icon
          style="margin-bottom: 16px"
          message="将在节点写入 /etc/systemd/system/edge.service（覆盖同名文件），并执行 daemon-reload 与 enable"
        />

        <div class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">节点</span>
            <span class="field-block-desc">目标 Edge 节点</span>
          </div>
          <div class="field-value">{{ selectedNode?.ip }}（{{ selectedNode?.edge_path }}）</div>
        </div>

        <div v-if="action !== 'status'" class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">Edge 目录</span>
            <span class="field-block-desc">edge.service 的 WorkingDirectory 与 ExecStart 路径</span>
          </div>
          <a-input v-model:value="actionForm.edge_path" placeholder="默认取节点 Edge 目录" class="field-input" />
        </div>

        <div v-if="action !== 'status'" class="field-block">
          <div class="field-block-header">
            <span class="field-block-title">运行用户（edge.service 的 User=）</span>
            <span class="field-block-desc"
              >edge.service 将以该用户执行；默认已填节点配置用户，请确认是否为节点 Edge 实际运行用户</span
            >
          </div>
          <a-input v-model:value="actionForm.run_user" placeholder="默认取节点 inventory 用户" class="field-input" />
          <div v-if="runUserIsFallback" class="run-user-warning">
            未能从主机清单取得该节点的 SSH 用户，当前为平台进程用户（{{ actionForm.run_user }}）——若与 Edge
            实际运行用户不符，服务将无法正常启动
          </div>
        </div>

        <template v-if="action === 'enable' || action === 'disable' || action === 'status'">
          <!-- 查询状态支持两种凭据模式：当前用户直查 / root 查询 -->
          <div v-if="action === 'status'" class="field-block">
            <div class="field-block-header">
              <span class="field-block-title">查询方式</span>
              <span class="field-block-desc"
                >普通用户可能无权限读取 systemctl；root 查询需提供密码（仅本次使用，不保存）</span
              >
            </div>
            <a-radio-group v-model:value="statusQueryMode" button-style="solid" size="small">
              <a-radio-button value="direct">直接查询（当前用户）</a-radio-button>
              <a-radio-button value="root">使用 root 查询</a-radio-button>
            </a-radio-group>
          </div>

          <div v-if="action === 'enable' || action === 'disable' || statusQueryMode === 'root'" class="field-block">
            <div class="field-block-header">
              <span class="field-block-title">root 账号</span>
              <span class="field-block-desc">{{
                action === 'status' ? '以 root 查询自启动状态' : '启用/禁用自启动需 root 权限'
              }}</span>
            </div>
            <a-input v-model:value="actionForm.root_user" placeholder="root" class="field-input" />
          </div>

          <div v-if="action === 'enable' || action === 'disable' || statusQueryMode === 'root'" class="field-block">
            <div class="field-block-header">
              <span class="field-block-title">root 密码</span>
              <span class="field-block-desc">必填，仅本次操作使用，不保存</span>
            </div>
            <a-input-password
              v-model:value="actionForm.root_password"
              placeholder="必填，仅本次使用"
              class="field-input"
            />
          </div>
        </template>
      </a-form>

      <template #footer>
        <a-space>
          <a-button @click="actionModalVisible = false">取消</a-button>
          <a-button type="primary" :danger="action === 'disable'" :loading="actionSubmitting" @click="confirmAction">
            {{ action === 'enable' ? '确认启用' : action === 'disable' ? '确认禁用' : '查询' }}
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
      :show-nginx-status="false"
    />

    <!-- 批量启用/禁用/查询共享凭据抽屉（design D1：密码单次输入，仅本次批量流程内复用，不落库） -->
    <a-drawer
      v-model:open="batchCredVisible"
      :title="
        batchKind === 'query' ? '批量查询自启动状态' : batchKind === 'enable' ? '批量启用自启动' : '批量禁用自启动'
      "
      width="520"
      :closable="true"
    >
      <a-alert
        v-if="batchKind === 'disable'"
        type="warning"
        show-icon
        style="margin-bottom: 16px"
        :message="
          '将对 ' +
          batchTargetNodes.length +
          ' 台节点禁用自启动：节点重启时 Edge 不会自动启动，需人工登录节点处理；服务文件保留，可随时重新启用'
        "
      />
      <a-alert
        v-else-if="batchKind === 'enable'"
        type="info"
        show-icon
        style="margin-bottom: 16px"
        :message="
          '将对 ' +
          batchTargetNodes.length +
          ' 台节点启用自启动：写入并覆盖 /etc/systemd/system/edge.service，并执行 daemon-reload 与 enable'
        "
      />

      <!-- 查询双模式（与单节点查询抽屉同口径） -->
      <div v-if="batchKind === 'query'" class="field-block">
        <div class="field-block-header">
          <span class="field-block-title">查询方式</span>
          <span class="field-block-desc"
            >将对 {{ batchTargetNodes.length }} 台节点逐台查询；普通用户可能无权限读取 systemctl，root
            查询需提供密码（仅本次使用，不保存）</span
          >
        </div>
        <a-radio-group v-model:value="batchQueryMode" button-style="solid" size="small">
          <a-radio-button value="direct">直接查询（当前用户）</a-radio-button>
          <a-radio-button value="root">使用 root 查询</a-radio-button>
        </a-radio-group>
      </div>

      <div
        v-if="batchKind === 'enable' || batchKind === 'disable' || (batchKind === 'query' && batchQueryMode === 'root')"
        class="field-block"
      >
        <div class="field-block-header">
          <span class="field-block-title">root 账号</span>
          <span class="field-block-desc">
            {{ batchKind === 'query' ? '以 root 查询自启动状态' : '批量流程内所有节点使用同一 root 账号' }}
          </span>
        </div>
        <a-input v-model:value="batchForm.root_user" placeholder="root" class="field-input" />
      </div>
      <div
        v-if="batchKind === 'enable' || batchKind === 'disable' || (batchKind === 'query' && batchQueryMode === 'root')"
        class="field-block"
      >
        <div class="field-block-header">
          <span class="field-block-title">root 密码</span>
          <span class="field-block-desc">输入一次，仅用于本次批量操作并逐节点复用，不保存</span>
        </div>
        <a-input-password
          v-model:value="batchForm.root_password"
          placeholder="必填，仅本次批量操作使用"
          class="field-input"
        />
      </div>
      <template #footer>
        <a-space>
          <a-button @click="batchCredVisible = false">取消</a-button>
          <a-button type="primary" :danger="batchKind === 'disable'" @click="confirmBatchCredential">
            {{ batchKind === 'query' ? '开始批量查询' : batchKind === 'enable' ? '开始批量启用' : '开始批量禁用' }}
          </a-button>
        </a-space>
      </template>
    </a-drawer>

    <!-- 批量执行汇总面板（design D1：串行进度 n/N + 逐节点结果；关闭 = 停止发起剩余） -->
    <a-drawer
      v-model:open="batchVisible"
      :title="batchKindLabel + ' · 执行进度'"
      width="680"
      :closable="true"
      @close="closeBatchPanel"
    >
      <div class="batch-progress">
        <a-progress :percent="batchPercent" :status="batchProgressStatus" />
        <div class="batch-progress-text">
          已完成 {{ batchState.done }}/{{ batchState.total }}
          <template v-if="batchState.running"> · 正在处理 {{ batchCurrentIp }}</template>
        </div>
        <a-alert
          v-if="batchState.stopped"
          type="warning"
          show-icon
          style="margin-top: 12px"
          :message="'已停止：剩余 ' + batchRemaining + ' 台节点未执行（已完成节点结果保持，不回滚）'"
        />
      </div>
      <table class="batch-result-table">
        <thead>
          <tr>
            <th style="width: 40px">#</th>
            <th style="width: 140px">节点 IP</th>
            <th style="width: 80px">结果</th>
            <th>说明</th>
            <th style="width: 70px">耗时</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!batchState.results.length && batchState.running">
            <td colspan="5" class="batch-empty">正在执行第一个节点…</td>
          </tr>
          <tr v-for="(r, i) in batchState.results" :key="r.nodeId">
            <td>{{ i + 1 }}</td>
            <td>{{ r.ip }}</td>
            <td>
              <a-tag v-if="r.skipped" color="default">已跳过</a-tag>
              <a-tag v-else-if="r.ok === true" color="success">成功</a-tag>
              <a-tag v-else-if="r.running" color="processing">执行中</a-tag>
              <a-tag v-else color="error">失败</a-tag>
            </td>
            <td class="batch-detail">{{ r.detail }}</td>
            <td>{{ r.elapsed ? r.elapsed + ' 秒' : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <a-button type="primary" @click="closeBatchPanel">
          {{ batchState.running ? '停止并关闭（不再发起剩余节点）' : '关闭' }}
        </a-button>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { routeLabel } from '@/composables/useClusterUtils'
import { paginationProps } from '@/composables/usePagination'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import {
  mapAutostartStatus,
  autostartActionLabel,
  autostartRecordTooltip,
  type AutostartTagInfo,
} from '@/utils/autostartStatus'
import {
  autostartUrl,
  listAutostartRecords,
  listAutostartDefaults,
  getNodeAutostartDefaults,
  type AutostartStatus,
  type AutostartRecord,
} from '@/api/edgeAutostart'
import { listClusters } from '@/api/clusters'
import { listNodes } from '@/api/nodes'

const authStore = useAuthStore()

/** 「操作日志」入口仅对持 audit_logs 权限的用户可见（审计页路由同门控） */
const canViewAudit = computed(() => authStore.hasPermission('audit_logs'))

const clusters = ref<any[]>([])
const nodes = ref<any[]>([])
const loading = ref(false)
const clusterFilter = ref<number | undefined>(undefined)
const ipSearch = ref('')
const statusFilter = ref<string | undefined>(undefined)
// 表格分页状态（#59：跨页序号公式 (page-1)*pageSize+index+1 依赖 page/pageSize）
const page = ref(1)
const pageSize = ref(20)
const defaultRunUser = ref('')

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '集群', key: 'cluster_name', width: 140 },
  { title: '节点 IP', key: 'ip', width: 140 },
  { title: 'Edge 目录', key: 'edge_path', ellipsis: true },
  { title: '自启动状态', key: 'status', width: 220 },
  { title: '操作', key: 'action', width: 260 },
]

/** 前端内存过滤（IP 搜索 + 状态筛选 + 集群已由 loadNodes 过滤） */
const filteredNodes = computed(() => {
  const kw = ipSearch.value.trim()
  const sf = statusFilter.value
  return nodes.value.filter((n) => {
    if (kw && !String(n.ip).includes(kw)) return false
    if (!sf) return true
    // 「未查询」= 库中无记录（autostart_status 为 null），与其余状态值精确匹配
    return sf === 'not_queried' ? n.autostart_status === null : n.autostart_status === sf
  })
})

/**
 * 客户端分页切片：paginationProps 产出显式 total（服务端形态），a-table 不做本地切片，
 * 数据源必须由本页按 page/pageSize 切片——否则点击页码无反应（2026-10-27 用户实测）。
 */
const pagedNodes = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredNodes.value.slice(start, start + pageSize.value)
})

// 筛选收窄后页码越界 → 回夹到最后一页（避免空页）
watch(
  () => filteredNodes.value.length,
  (len) => {
    const maxPage = Math.max(1, Math.ceil(len / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  },
)

async function onTableChange(p: { current?: number; pageSize?: number }) {
  // 翻页前记录分页条视口位置：末页行数不满页时（如 39 节点 = 20+19）表格总高变化，
  // 分页条会位移/弹出视口——渲染后按位移补偿 scrollBy 钉位（2026-10-29 用户实测「点第一页页面跳了」）
  const rect = document.querySelector('.ant-pagination')?.getBoundingClientRect() ?? null
  const pagerVisible = rect != null && rect.top < window.innerHeight && rect.bottom > 0
  // antdv 的 change 事件恒带 pageSize：仅在 pageSize 实际变化（用户改每页条数）时才回第 1 页，
  // 否则翻页动作会被「pageSize 未变也重置」吞掉——点击页码永远无反应（2026-10-27 用户实测）
  if (p.pageSize && p.pageSize !== pageSize.value) {
    pageSize.value = p.pageSize
    page.value = 1
  } else if (p.current) {
    page.value = p.current
  }
  if (!pagerVisible || !rect) return
  await nextTick()
  const after = document.querySelector('.ant-pagination')?.getBoundingClientRect()
  if (!after) return
  const delta = after.top - rect.top
  if (delta !== 0) window.scrollBy(0, delta)
}

/**
 * 操作预检（design D4）：不在 ansible 主机清单 / Edge 目录为空的节点就地禁用三操作，
 * 不再等到填完 root 密码提交后才 400。
 */
function actionDisabledReason(record: any): string | null {
  if (record.in_inventory === false) return '节点不在 ansible 主机清单，无法下发（先在清单中收录该节点）'
  if (!record.edge_path) return '节点未配置 Edge 目录'
  return null
}

/** 运行用户回退为平台进程用户时警示（design D4） */
const runUserIsFallback = computed(
  () => !!actionForm.run_user && !!defaultRunUser.value && actionForm.run_user === defaultRunUser.value,
)

/** 执行计时（2.5：完成态「已完成，用时 N 秒」，replace 结果抽屉「等待中...」） */
let execStartedAt = 0
function markExecStarted() {
  execStartedAt = Date.now()
}
function markExecDone() {
  execElapsed.value = Math.max(1, Math.round((Date.now() - execStartedAt) / 1000))
}

/**
 * 错误归类（2.5 / design D6 / proposal P3-12）：
 * root 认证失败 / 无法连接节点 / 其他透出 detail + 指引。
 */
function classifyAutostartError(err: string): string {
  const e = err || ''
  if (/密码认证也失败|password|authentication|Authentication|认证|Permission denied|权限不够/i.test(e)) {
    return 'root 认证失败：请核对 root 账号密码'
  }
  if (/Failed to connect|Connection refused|timed out|timeout|unreachable|无法连接/i.test(e)) {
    return `无法连接节点 ${selectedNode.value?.ip || ''}：${e}，请确认网络与节点 SSH 服务`
  }
  return `操作失败: ${e}（可查看执行日志定位）`
}

/**
 * 终态失败按流日志归类（design D6）：后端终态事件只带 status:"failed" 字面量，
 * 真实原因在流日志里——归类必须读日志而非 status 字符串，否则永远落
 * 「操作失败: failed」（P3-12 原样复发）。认证失败的唯一可靠标记是
 * _run_ssh_with_fallback 的「密码认证也失败」（双腿俱败时才拼接；免密腿的
 * Permission denied 是密码回退的预期前奏，不算失败）。未命中标记返回
 * fallback（不含整段日志，toast/横幅只放固定指引）。
 */
function classifyFailure(logs: string[], fallback: string): string {
  const text = logs.join('\n')
  if (/密码认证也失败/i.test(text)) {
    return 'root 认证失败：请核对 root 账号密码'
  }
  if (/Failed to connect|Connection refused|timed out|timeout|unreachable/i.test(text)) {
    return `无法连接节点 ${selectedNode.value?.ip || ''}，请确认网络与节点 SSH 服务`
  }
  return fallback
}

/**
 * 状态列 tag：五态扩展为六态（未查询/查询受限/查询失败），「未知」已废除。
 * 7 天未更新的真实态附加「状态可能过期」tooltip（design D2）。
 */
function statusTag(record: any): AutostartTagInfo {
  return mapAutostartStatus(record.autostart_status, record.autostart_record?.updated_at)
}

/** 状态 tag tooltip：七日过期提示 + 状态 hint + 最近操作记录（action/rc/时间/脱敏命令） */
function statusTagTooltip(record: any): string | null {
  const t = statusTag(record)
  const lines: string[] = []
  if (t.stale) lines.push('状态可能过期（超过 7 天未查询），建议重新查询')
  if (t.hint) lines.push(t.hint)
  const recordTooltip = autostartRecordTooltip({
    ...record.autostart_record,
    status_label: t.label,
  })
  if (recordTooltip && recordTooltip !== (t.hint || '')) {
    lines.push('最近操作：')
    lines.push(recordTooltip)
  }
  return lines.join('\n') || null
}

const actionModalVisible = ref(false)
const actionSubmitting = ref(false)
const action = ref<'enable' | 'disable' | 'status'>('enable')
/** 查询状态时的凭据模式：direct=当前用户 / root=输入 root 密码 */
const statusQueryMode = ref<'direct' | 'root'>('direct')
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
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
const execHighlights = ref<string[]>([])
const execStatistics = ref<Record<string, string> | null>(null)
const streamStatus = ref<string>('')
const streamError = ref<string | null>(null)
const { start, installing } = useInstallStream()

async function loadClusters() {
  try {
    const res = await listClusters()
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
}

async function loadAutostartRecords() {
  try {
    const res = await listAutostartRecords()
    const records = (res.data?.items || []) as AutostartRecord[]
    const map = new Map<number, AutostartRecord>()
    for (const r of records) map.set(r.node_id, r)
    for (const n of nodes.value) {
      const r = map.get(n.id) || null
      // 全字段接入（autostart-ux-review-fixes 1.2）：时间/最后操作/脱敏命令进 tooltip
      n.autostart_record = r
      n.autostart_status = (r?.status as AutostartStatus) || null
      if (r) n.in_inventory = r.in_inventory !== false
      else n.in_inventory = (n as any).in_inventory ?? false
    }
  } catch {
    /* ignore */
  }
}

async function loadNodes() {
  loading.value = true
  try {
    const res = await listNodes({
      pageSize: 500,
      ...(clusterFilter.value ? { clusterId: clusterFilter.value } : {}),
    })
    const items = res.data?.items || []
    const clusterMap = new Map(clusters.value.map((c: any) => [c.id, c]))
    nodes.value = items.map((n: any) => ({
      ...n,
      cluster_name:
        clusterMap.get(n.cluster_id)?.display_name || clusterMap.get(n.cluster_id)?.name || String(n.cluster_id),
      autostart_status: null as AutostartStatus | null,
    }))
    await loadAutostartRecords()
  } catch (e: any) {
    message.error(e.response?.data?.detail || '加载节点失败')
  } finally {
    loading.value = false
  }
}

async function openAction(node: any, act: 'enable' | 'disable' | 'status') {
  action.value = act
  selectedNode.value = node
  actionForm.edge_path = node.edge_path || ''
  // 运行用户默认取节点 inventory 的 ansible_ssh_user（通常即 Edge 实际运行用户）
  actionForm.run_user = ''
  try {
    const res = await getNodeAutostartDefaults(node.id)
    actionForm.run_user = res.data?.run_user || defaultRunUser.value || ''
  } catch {
    actionForm.run_user = defaultRunUser.value || ''
  }
  actionForm.root_user = 'root'
  actionForm.root_password = ''
  statusQueryMode.value = 'direct'
  actionModalVisible.value = true
}

async function confirmAction() {
  if (!selectedNode.value) return
  if (action.value === 'status') {
    // 查询状态：direct（当前用户）无需密码；root 模式需 root 密码
    if (statusQueryMode.value === 'root' && !actionForm.root_password) {
      message.warning('请输入 root 密码')
      return
    }
    const useRoot = statusQueryMode.value === 'root'
    actionSubmitting.value = true
    actionModalVisible.value = false
    await queryStatus(selectedNode.value, useRoot)
    actionSubmitting.value = false
    return
  }
  if (!actionForm.root_password) {
    message.warning('请输入 root 密码')
    return
  }
  actionSubmitting.value = true
  actionModalVisible.value = false
  execTitle.value =
    action.value === 'enable' ? `启用自启动: ${selectedNode.value.ip}` : `禁用自启动: ${selectedNode.value.ip}`
  const baseTitle = execTitle.value
  resetExec()
  markExecStarted()
  execVisible.value = true

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  await start(
    autostartUrl(selectedNode.value.id),
    {
      action: action.value,
      edge_path: actionForm.edge_path || undefined,
      run_user: actionForm.run_user || undefined,
      root_user: actionForm.root_user || undefined,
      root_password: actionForm.root_password,
    },
    {
      onLine: (line) => {
        captureCommandLine(line)
        addLog(line)
      },
      onMeta: (m) => {
        const label = routeLabel(m.route)
        if (label) execTitle.value = `${baseTitle}（${label}）`
      },
      onComplete: (rc) => {
        execProgress.percent = 100
        execProgress.status = rc === 0 ? 'success' : 'exception'
        markExecDone()
        // 保留 captureCommandLine 捕获的真实 SSH 命令，避免被覆盖为描述字符串
        const realCommand = execResult.value?.command || `autostart ${action.value} ${selectedNode.value.ip}`
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: realCommand, rc }
        const appliedState: AutostartStatus = action.value === 'enable' ? 'enabled' : 'disabled'
        if (rc === 0) {
          // 同步更新表格状态列（不调用 loadNodes，避免其重置 autostart_status 为 null）
          selectedNode.value.autostart_status = appliedState
          execHighlights.value = [`${action.value === 'enable' ? '已启用' : '已禁用'}自启动`]
          addLog(`✅ ${action.value === 'enable' ? '启用' : '禁用'}自启动成功`)
          message.success(action.value === 'enable' ? '已启用自启动' : '已禁用自启动')
        } else {
          execHighlights.value = []
          const classified = classifyFailure(execLogs.value, '操作失败，可查看执行日志定位')
          streamError.value = classified
          addLog(`❌ ${classified}`)
          message.error(classified)
        }
      },
      onError: (e) => {
        execProgress.percent = 100
        execProgress.status = 'exception'
        markExecDone()
        streamError.value = classifyAutostartError(e)
        addLog(`❌ ${streamError.value}`)
        message.error(streamError.value)
      },
    },
  )
  actionSubmitting.value = false
}

async function queryStatus(node: any, useRoot = false) {
  execTitle.value = `查询自启动状态: ${node.ip}`
  const baseTitle = execTitle.value
  resetExec()
  markExecStarted()
  execVisible.value = true

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  await start(
    autostartUrl(node.id),
    useRoot
      ? { action: 'status', root_user: actionForm.root_user || 'root', root_password: actionForm.root_password }
      : { action: 'status' },
    {
      onLine: (line) => {
        captureCommandLine(line)
        addLog(line)
      },
      onMeta: (m) => {
        const label = routeLabel(m.route)
        if (label) execTitle.value = `${baseTitle}（${label}）`
      },
      onComplete: () => {
        // SSH 版 status：enabled rc=0，disabled/not_configured 时 is-enabled 返回 rc=1。
        // 查询是否成功取决于能否解析出状态，而非 rc。
        markExecDone()
        // root 模式查询认证失败（design D6 / 2.5）：日志含双腿俱败标记「密码认证也失败」→
        // 按认证失败归类。不能用 rc≠0 门控——is-enabled 对 disabled 合法 rc=1；
        // 免密腿 Permission denied 也是密码回退的预期前奏。查询未取得真实态时
        // 不得把节点状态改写为「查询受限」（那是无 systemctl 权限的语义）。
        const authFailed = useRoot && /密码认证也失败/i.test(execLogs.value.join('\n'))
        if (authFailed) {
          execProgress.percent = 100
          execProgress.status = 'exception'
          execHighlights.value = []
          execStatistics.value = null
          streamError.value = 'root 认证失败：请核对 root 账号密码'
          addLog(`❌ ${streamError.value}`)
          message.error(streamError.value)
          return
        }
        const state = parseAutostartState(execLogs.value)
        node.autostart_status = state
        const queryOk = state !== 'unknown'
        execProgress.percent = 100
        execProgress.status = queryOk ? 'success' : 'exception'
        const labels: Record<AutostartStatus, string> = {
          enabled: '已启用',
          disabled: '已禁用',
          not_configured: '未配置',
          permission_denied: '查询受限',
          unknown: '查询失败',
        }
        if (state === 'permission_denied') {
          const rcInfo = extractAutostartRc(execLogs.value)
          execStatistics.value = { 自启动状态: labels[state], 原因: rcInfo }
          execHighlights.value = [`无权限执行 systemctl（${rcInfo}），可用 root 查询或检查节点 sudo 配置`]
        } else {
          execStatistics.value = { 自启动状态: labels[state] }
          execHighlights.value = queryOk ? [`自启动状态: ${labels[state]}`] : []
        }
        addLog(queryOk ? `✅ 查询成功（${labels[state]}）` : `❌ 查询失败（${labels[state]}）`)
        if (queryOk && state === 'not_configured') message.info('该节点未配置自启动服务')
        if (state === 'permission_denied') message.warning('该节点普通用户无权限查询自启动状态')
      },
      onError: (e) => {
        execProgress.percent = 100
        execProgress.status = 'exception'
        markExecDone()
        const classified = classifyAutostartError(e)
        streamError.value = classified
        addLog(`❌ ${classified}`)
        message.error(classified)
      },
    },
  )
}

function parseAutostartState(logs: string[]): AutostartStatus {
  // SSH 版 status 的 stdout 直接输出 is-enabled 结果（enabled/disabled/
  // No such file...），从日志行中识别状态。
  // 注意1：'手工执行命令: ... systemctl is-enabled edge' 回显行含子串
  // "enabled"（is-enabled），必须跳过，否则命令回显会误报为"已启用"。
  // 注意2：权限错误行（如 fallback 重试前的一次 "Permission denied"）可能
  // 出现在真实结果之前——真实状态（enabled/disabled/not_configured）优先，
  // 权限错误仅在没有真实结果时作为兜底（与后端 _infer_status 语义一致）。
  let sawPermissionError = false
  for (const raw of logs) {
    // 前缀剥离须容忍任意括号内容：toLocaleTimeString() 在 12 小时制 locale 下产出
    // "[3:55:32 PM]"，按 [\d:]+ 匹配会剥离失败，命令回显行随即被 /enabled/ 误命中
    const line = raw.replace(/^\[[^\]]*\]\s*/, '')
    if (line.includes('手工执行命令')) continue
    if (/No such file or directory/.test(line)) return 'not_configured'
    if (/enabled/.test(line)) return 'enabled'
    if (/disabled/.test(line)) return 'disabled'
    if (/权限不够|Permission denied|permission denied/.test(line)) sawPermissionError = true
  }
  return sawPermissionError ? 'permission_denied' : 'unknown'
}

function captureCommandLine(line: string) {
  // 从 SSE 流中捕获"手工执行命令: xxx"，设置到 execResult.command 供命令 tab 展示
  const m = line.match(/手工执行命令:\s*(.+)/)
  if (m) {
    if (!execResult.value) execResult.value = { stdout: '', stderr: '', command: '', rc: null }
    execResult.value.command = m[1].trim()
    return true
  }
  return false
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

// ── 批量操作（design D1 / 决策点 1A·2A·4：选中优先否则筛选全量，串行逐节点 SSE，无新后端端点）──

interface BatchResultRow {
  nodeId: number
  ip: string
  /** true=成功 / false=失败 / null=跳过 */
  ok: boolean | null
  skipped: boolean
  running?: boolean
  detail: string
  elapsed: number
}

const selectedRowKeys = ref<Array<number>>([])
function onSelectionChange(keys: Array<number>) {
  selectedRowKeys.value = keys
}

/** 决策点 4：有勾选仅对选中节点执行，无勾选对当前筛选结果全量 */
const batchTargetNodes = computed<any[]>(() => {
  if (selectedRowKeys.value.length) return nodes.value.filter((n) => selectedRowKeys.value.includes(n.id))
  return filteredNodes.value
})

const batchVisible = ref(false)
const batchCredVisible = ref(false)
const batchKind = ref<'query' | 'enable' | 'disable'>('query')
/** 批量查询双模式（对齐单节点查询抽屉）：direct=免密直连，root=以 root 逐节点查询 */
const batchQueryMode = ref<'direct' | 'root'>('direct')
const batchForm = reactive({ root_user: 'root', root_password: '' })
const batchAbort = ref(false)
const batchCurrentIp = ref('')
const batchState = reactive({
  running: false,
  kind: 'query' as 'query' | 'enable' | 'disable',
  total: 0,
  done: 0,
  stopped: false,
  results: [] as BatchResultRow[],
})
const batchRemaining = computed(() => Math.max(0, batchState.total - batchState.done))
const batchPercent = computed(() => (batchState.total ? Math.round((batchState.done / batchState.total) * 100) : 0))
const batchProgressStatus = computed(() => {
  if (batchState.running) return 'active'
  return batchState.stopped ? 'normal' : 'success'
})
const batchKindLabel = computed(() =>
  batchState.kind === 'query' ? '批量查询状态' : batchState.kind === 'enable' ? '批量启用' : '批量禁用',
)

function openBatchQuery() {
  batchKind.value = 'query'
  batchQueryMode.value = 'direct'
  batchForm.root_user = 'root'
  batchForm.root_password = ''
  batchCredVisible.value = true
}

function openBatchCredential(kind: 'enable' | 'disable') {
  batchKind.value = kind
  batchForm.root_user = 'root'
  batchForm.root_password = ''
  batchCredVisible.value = true
}

function confirmBatchCredential() {
  // 批量查询默认直连免密（与单节点「直接查询（当前用户）」同口径）
  if (batchKind.value === 'query' && batchQueryMode.value === 'direct') {
    batchCredVisible.value = false
    void runBatch(null)
    return
  }
  if (!batchForm.root_password) {
    message.warning('请输入 root 密码')
    return
  }
  batchCredVisible.value = false
  void runBatch({ root_user: batchForm.root_user, root_password: batchForm.root_password })
}

/** 关闭面板 = 停止发起剩余节点（在途节点自然完成）；已完成节点结果保持 */
function closeBatchPanel() {
  if (batchState.running) batchAbort.value = true
  batchVisible.value = false
}

/** 单节点批量执行：包裹既有单节点 SSE，解析结果并归一化为汇总行 */
async function runBatchOne(
  node: any,
  creds: { root_user?: string; root_password?: string } | null,
): Promise<Omit<BatchResultRow, 'nodeId' | 'ip'>> {
  const t0 = Date.now()
  const kind = batchState.kind
  const logs: string[] = []

  // 启用/禁用需要 run_user（edge.service 的 User=）：串行执行下逐节点取 defaults 开销可忽略
  let runUser: string | undefined
  if (kind !== 'query') {
    try {
      const res = await getNodeAutostartDefaults(node.id)
      runUser = res.data?.run_user || defaultRunUser.value || undefined
    } catch {
      runUser = defaultRunUser.value || undefined
    }
  }

  const body: Record<string, unknown> =
    kind === 'query'
      ? {
          action: 'status',
          // root 模式带凭据（与单节点 root 查询同语义）；直连模式不带
          ...(creds?.root_password ? { root_user: creds.root_user || 'root', root_password: creds.root_password } : {}),
        }
      : {
          action: kind,
          edge_path: node.edge_path || undefined,
          run_user: runUser,
          root_user: creds?.root_user || 'root',
          root_password: creds?.root_password || '',
        }

  const outcome = await new Promise<{ rc: number | null; error: string | null }>((resolve) => {
    void start(autostartUrl(node.id), body, {
      onLine: (line) => logs.push(line),
      onComplete: (rc) => resolve({ rc, error: null }),
      onError: (e) => resolve({ rc: null, error: e }),
    })
  })
  const elapsed = Math.max(1, Math.round((Date.now() - t0) / 1000))

  if (kind === 'query') {
    const stateParsed = parseAutostartState(logs)
    node.autostart_status = stateParsed
    const realStates: Array<AutostartStatus> = ['enabled', 'disabled', 'not_configured']
    if (outcome.error) {
      return { ok: false, skipped: false, detail: classifyAutostartError(outcome.error), elapsed }
    }
    if (realStates.includes(stateParsed)) {
      return { ok: true, skipped: false, detail: `查询成功：${mapAutostartStatus(stateParsed).label}`, elapsed }
    }
    if (stateParsed === 'permission_denied') {
      return {
        ok: false,
        skipped: false,
        detail: '查询受限：普通用户无 systemctl 读取权限（可用 root 查询单节点）',
        elapsed,
      }
    }
    return { ok: false, skipped: false, detail: '查询失败：未能解析节点返回状态', elapsed }
  }

  const applied = kind === 'enable' ? 'enabled' : 'disabled'
  if (outcome.error) {
    return { ok: false, skipped: false, detail: classifyAutostartError(outcome.error), elapsed }
  }
  if (outcome.rc === 0) {
    node.autostart_status = applied
    return { ok: true, skipped: false, detail: kind === 'enable' ? '已启用自启动' : '已禁用自启动', elapsed }
  }
  return { ok: false, skipped: false, detail: classifyFailure(logs, '操作失败，可查看执行日志定位'), elapsed }
}

async function runBatch(creds: { root_user?: string; root_password?: string } | null) {
  const targets = [...batchTargetNodes.value]
  batchState.kind = batchKind.value
  batchState.total = targets.length
  batchState.done = 0
  batchState.results = []
  batchState.stopped = false
  batchState.running = true
  batchAbort.value = false
  batchVisible.value = true

  for (const node of targets) {
    if (batchAbort.value) break
    // 预检（design D4）：不可操作节点就地标注跳过原因，不发起 SSE
    const reason = actionDisabledReason(node)
    if (reason) {
      batchState.results.push({ nodeId: node.id, ip: node.ip, ok: null, skipped: true, detail: reason, elapsed: 0 })
      batchState.done++
      continue
    }
    batchCurrentIp.value = node.ip
    const row = await runBatchOne(node, creds)
    batchState.results.push({ nodeId: node.id, ip: node.ip, ...row })
    batchState.done++
  }
  if (batchAbort.value) batchState.stopped = true
  batchState.running = false
  batchCurrentIp.value = ''

  // 完成后重载记录（时间/最后操作小字同步；各节点状态已在流内回写，重载取库内一致真值）
  await loadAutostartRecords()
}

onMounted(async () => {
  try {
    const res = await listAutostartDefaults()
    defaultRunUser.value = res.data?.default_run_user || ''
  } catch {
    /* ignore */
  }
  await loadClusters()
  await loadNodes()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
}

/* 单节点操作与批量入口之间的分隔线 */
.toolbar-sep {
  width: 1px;
  height: 22px;
  background: var(--border);
}

/* 批量汇总面板 */
.batch-progress-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--fg);
}
.batch-result-table {
  margin-top: 16px;
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.batch-result-table th,
.batch-result-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  word-break: break-all;
}
.batch-result-table th {
  color: var(--muted);
  font-weight: 600;
  background: var(--bg);
}
.batch-detail {
  color: var(--fg);
}
.batch-empty {
  color: var(--muted);
  text-align: center;
}

/* 表格样式改由全局 .table-container 提供（见 src/style.css） */

/* 状态列：tag 下的弱色小字（最后查询时间 · 最后操作） */
.status-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

/* 失败态（查询受限/查询失败）：透明底描边，与填充色的真实态区分层级 */
.autostart-tag-outline {
  background: transparent !important;
  border-style: dashed !important;
}

/* Edge 目录列省略 */
.edge-path-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* 禁用按钮的 tooltip 感知包裹层（antdv 禁用按钮不接收鼠标事件） */
.op-wrap {
  display: inline-block;
}
.op-wrap .ant-btn-disabled {
  cursor: not-allowed;
}

/* 参考路由插件编辑抽屉（PluginEditorDrawer）的 field-block 风格 */
.field-block {
  margin-bottom: 20px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.field-block-header {
  margin-bottom: 8px;
}
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
.field-input {
  margin-bottom: 6px;
}
.field-value {
  font-size: 13px;
  color: var(--fg);
  word-break: break-all;
}
</style>
