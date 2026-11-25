<template>
  <div class="autostart-page">
    <PageHeader
      title="自启动管理"
      description="管理 Edge 节点开机自启动（systemd）。启用：写入 /etc/systemd/system/edge.service 并 enable（覆盖同名文件）；禁用：取消防开机自启，服务文件保留可随时重新启用；root 凭据仅本次使用，不保存"
    >
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <router-link
          v-if="canViewAudit"
          :to="{ path: '/audit-log', query: { resource: 'autostart' } }"
          class="btn btn-secondary"
          >操作日志</router-link
        >
      </template>
    </PageHeader>

    <div ref="cardRef" class="table-container l5-card">
      <!-- 工具条（共享 TableToolbar，与节点管理同构）：「刷新」= 读库重载（真实状态同步走批量查询状态） -->
      <TableToolbar
        v-model:mode="viewMode"
        class="as-filter-bar nowrap"
        :count="filteredNodes.length"
        count-unit="个节点"
        :show-count="false"
        :show-mode="true"
        :refreshing="loading"
        @refresh="loadNodes"
      >
        <template #filters>
          <SearchInput v-if="autostartSearchVisible" v-model="ipSearch" :width="150" placeholder="搜索节点 IP" />
          <select
            v-model="groupFilter"
            :title="groupFilter.startsWith('__') ? '' : groupFilter"
            class="l5-select"
            style="width: 104px"
            @change="onGroupChange"
          >
            <option value="__all__">全部分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__ung__">未分组</option>
          </select>
          <ClusterSelect
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="loadNodes"
          />
        </template>
        <template #config>
          <a-popover v-model:open="autostartColumnPopoverVisible" trigger="click" placement="bottomLeft">
            <template #title>选择显示列</template>
            <template #content>
              <div style="min-width: 320px">
                <div style="font-weight: 500; margin-bottom: 8px">显示字段</div>
                <a-checkbox-group
                  v-model:value="autostartColumnsSelected"
                  style="display: flex; flex-wrap: wrap; gap: 8px"
                >
                  <div v-for="col in popoverColumns" :key="col.key" style="margin-bottom: 4px">
                    <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                  </div>
                </a-checkbox-group>
                <a-divider style="margin: 12px 0" />
                <div style="font-weight: 500; margin-bottom: 8px">搜索</div>
                <a-checkbox v-model:checked="autostartSearchVisible">显示搜索框</a-checkbox>
                <a-divider style="margin: 12px 0" />
                <div class="as-pop-hint">拖动表头右缘可调整列宽，拖动表头整格可调整列序</div>
                <div style="display: flex; justify-content: flex-end; margin-top: 12px">
                  <button class="btn btn-primary btn-sm" @click="handleResetColumnWidths">重置列宽</button>
                </div>
              </div>
            </template>
            <button class="btn btn-secondary btn-sm">
              <StrokeIcon name="sliders" :size="13" />
              列配置
              <StrokeIcon name="chevronDown" :size="10" />
            </button>
          </a-popover>
        </template>
        <template #mode-extra>
          <button
            v-if="viewMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            :title="pageHasFolded ? '展开当页全部分组' : '收起当页全部分组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <!-- 状态 chips 行（filter-architecture 单一形态；计数为前端聚合，点击与原下拉过滤同语义） -->
      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips">
          <button
            v-for="c in statusChips"
            :key="c.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: (statusFilter || '') === c.key, empty: !c.count }"
            @click="statusFilter = c.key || undefined"
          >
            {{ c.label }}<span class="f-count">{{ c.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量条（nodes 同构）：批量作用于「选中优先，否则当前筛选全量」（spec 契约，未选时按钮不禁用） -->
      <div class="l5-batchbar" :class="{ 'has-sel': selectedRowKeys.length > 0 }">
        <span class="b-count">已选 {{ selectedRowKeys.length }} 项</span>
        <span class="b-sep"></span>
        <button
          class="btn btn-ghost btn-sm batch-query"
          :disabled="!batchTargetNodes.length || batchState.running"
          @click="openBatchQuery"
        >
          <StrokeIcon name="pulse" /> 批量查询状态
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="!batchTargetNodes.length || batchState.running"
          @click="openBatchCredential('enable')"
        >
          <StrokeIcon name="play" /> 批量启用
        </button>
        <button
          class="btn btn-danger btn-sm"
          :disabled="!batchTargetNodes.length || batchState.running"
          @click="openBatchCredential('disable')"
        >
          <StrokeIcon name="pause" /> 批量禁用
        </button>
        <span class="b-spacer"></span>
        <button class="btn btn-secondary btn-sm" :disabled="!selectedRowKeys.length" @click="onSelectionChange([])">
          清除选择
        </button>
      </div>

      <a-table
        :data-source="displayRows"
        :columns="visibleAutostartColumns"
        :loading="loading"
        :pagination="false"
        :row-key="(record: any) => record.key ?? record.id"
        :row-selection="rowSelection"
        :custom-row="asCustomRow"
        :scroll="{ x: minTableWidth }"
        :table-layout="'fixed'"
        size="middle"
        class="autostart-table grid-table"
      >
        <template #headerCell="{ column, title }">
          <span class="th-resize-wrap" :class="asWrapClass(column)" @mousedown="startColumnMove($event, column)">
            <span>{{ title }}</span>
            <span
              v-if="String(column.key) !== 'index'"
              class="col-resize-handle"
              @mousedown="startColumnResize($event, column)"
            />
          </span>
        </template>
        <template #bodyCell="{ column, record }">
          <!-- 组标记行（list-page-cluster-grouping）：整行 colspan 由列 customCell 控制 -->
          <template v-if="isGroupHeaderRow(record)">
            <ClusterGroupRow :row="record" @toggle="toggleFold(record.groupKey)">
              <template #note>勾选节点后可用上方批量操作</template>
            </ClusterGroupRow>
          </template>
          <template v-else-if="column.key === 'index'">
            <span class="c-idx">{{ (page - 1) * pageSize + sequenceOf(record) }}</span>
          </template>
          <template v-else-if="column.key === 'ip'">
            <span class="text-mono c-strong">{{ record.ip }}</span>
          </template>
          <template v-else-if="column.key === 'cluster'">
            <span class="cl-cell" :class="clusterHueClass(record.cluster_id)"
              ><span class="cl-dot"></span><span class="cl-name">{{ record.cluster_name || '-' }}</span></span
            >
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tooltip :title="statusTagTooltip(record)">
              <span class="pill" :class="pillClass(record)"
                ><span class="dot"></span>{{ statusTag(record).label }}</span
              >
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
              <span class="edge-path-cell c-mono c-dim">{{ record.edge_path }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'actions'">
            <span class="ops">
              <button
                class="op-btn"
                :disabled="!!actionDisabledReason(record)"
                :title="actionDisabledReason(record) ?? '启用自启动'"
                @click="openAction(record, 'enable')"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M7 4l13 8-13 8z" /></svg
                >启用
              </button>
              <button
                class="op-btn op-danger"
                :disabled="!!actionDisabledReason(record)"
                :title="actionDisabledReason(record) ?? '禁用自启动（重启后 Edge 不再自动拉起）'"
                @click="openAction(record, 'disable')"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" /></svg
                >禁用
              </button>
              <button
                class="op-btn"
                :disabled="!!actionDisabledReason(record)"
                :title="actionDisabledReason(record) ?? '查询自启动状态'"
                @click="openAction(record, 'status')"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg
                >查询状态
              </button>
            </span>
          </template>
        </template>
      </a-table>

      <!-- 分页条（ListPager，#54）：表外独立分页，表格 `:pagination="false"`（组标记行不占页容量） -->
      <ListPager
        :page="page"
        :page-size="pageSize"
        :total="filteredNodes.length"
        unit="个节点"
        @change="handlePagerChange"
      />
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
import PageStatBadges from '@/components/PageStatBadges.vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { clusterHueClass } from '@/utils/clusterHue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { routeLabel } from '@/composables/useClusterUtils'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterGroupRow from '@/components/ClusterGroupRow.vue'
import ListPager from '@/components/ListPager.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useColumnConfig } from '@/composables/useColumnConfig'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import { useFitColumnWidths, toDesignWidths, SELECTION_COLUMN_WIDTH } from '@/composables/useFitColumnWidths'
import {
  useListClusterGrouping,
  isGroupHeaderRow,
  type ClusterGroupChip,
  type ListViewMode,
} from '@/composables/useListClusterGrouping'
import { compareNodeIp } from '@/utils/listGroupSorters'
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
import SearchInput from '@/components/SearchInput.vue'

const authStore = useAuthStore()

/** 「操作日志」入口仅对持 audit_logs 权限的用户可见（审计页路由同门控） */
const canViewAudit = computed(() => authStore.hasPermission('audit_logs'))

const clusters = ref<any[]>([])
const nodes = ref<any[]>([])
const loading = ref(false)
const clusterFilter = ref<number | string>('')
/** 分组筛选（与其余列表页同款：只收窄集群下拉候选，不参与数据查询参数） */
const groupFilter = ref('__all__')
const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c: any) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort() as string[]
})
const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c: any) => !c.group_name)
  return clusters.value.filter((c: any) => c.group_name === groupFilter.value)
})
/** 切分组后清空集群选择并重载（避免残留的集群不在新分组内） */
function onGroupChange() {
  clusterFilter.value = ''
  void loadNodes()
}
const ipSearch = ref('')
const statusFilter = ref<string | undefined>(undefined)
// 表格分页状态（#59：跨页序号公式 (page-1)*pageSize+index+1 依赖 page/pageSize）
const page = ref(1)
const pageSize = ref(20)
const defaultRunUser = ref('')

const columns = [
  { title: '#', key: 'index', width: 45 },
  { title: '集群', key: 'cluster', width: 124 },
  { title: '节点 IP', key: 'ip', width: 140 },
  { title: 'Edge 目录', key: 'edge_path' },
  { title: '自启动状态', key: 'status', width: 200 },
  { title: '操作', key: 'actions', width: 240 },
]
const ALL_COLUMN_KEYS = ['index', 'cluster', 'ip', 'edge_path', 'status', 'actions']

// ── 视图模式（nodes 同构）：分组默认 / 平铺切换；分组视图集群列隐藏（组头承担集群身份）──
const viewMode = ref<ListViewMode>('group')

// ── 列个性化（column-personalization 共享件）：显隐 + 拖宽 + 拖序，存储键独立 ──
const {
  popoverVisible: autostartColumnPopoverVisible,
  columnsSelected: autostartColumnsSelected,
  searchVisible: autostartSearchVisible,
  columnWidths: autostartColumnWidths,
  setColumnWidth: setAutostartColumnWidth,
  resetWidths: resetAutostartColumnWidths,
  columnOrder: autostartColumnOrder,
  setColumnOrder: setAutostartColumnOrder,
} = useColumnConfig({
  key: 'edge_autostart',
  defaultColumns: [...ALL_COLUMN_KEYS],
  allColumns: [...ALL_COLUMN_KEYS],
  defaultSearchVisible: true,
})

const orderedColumns = computed(() => {
  const stored = autostartColumnOrder.value
  const seq = stored.length ? stored : columns.map((c) => String(c.key))
  const known = new Map(columns.map((c) => [String(c.key), c]))
  const out: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const k of seq) {
    const c = known.get(k)
    if (c && !seen.has(k)) {
      out.push(c as Record<string, unknown>)
      seen.add(k)
    }
  }
  for (const [k, c] of known) if (!seen.has(k)) out.push(c as Record<string, unknown>)
  return out
})

const popoverColumns = computed(() =>
  columns
    .filter((c) => c.key !== 'index' && c.key !== 'cluster')
    .map((c) => ({ key: String(c.key), title: String(c.title) })),
)

// 列宽自适应（r6 方案 A，与 nodes 同源）：容器宽 ≥ 设计总宽原样用设计值，窄时等比收缩
const cardRef = ref<HTMLElement | null>(null)
const designWidths = () => {
  const base = toDesignWidths(columns)
  // 集群列仅平铺视图参与（分组视图由组头承担集群身份）
  if (viewMode.value === 'flat') return base
  const { cluster: _cluster, ...rest } = base
  return rest
}
const { widths: fittedColumnWidths, minTableWidth } = useFitColumnWidths({
  designWidths,
  containerRef: cardRef,
  overrides: () => autostartColumnWidths.value,
  reserved: () => SELECTION_COLUMN_WIDTH,
  flexKey: 'edge_path',
  minWidths: () => ({
    ...(viewMode.value === 'flat' ? { cluster: 116 } : {}),
    index: 45,
    ip: 110,
    status: 150,
    actions: 220,
  }),
})

const visibleAutostartColumns = computed(() => {
  const selected = new Set(autostartColumnsSelected.value)
  const cols = orderedColumns.value.filter((c) => {
    const k = String(c.key)
    if (k === 'index') return true
    // 集群列仅平铺视图存在（分组视图由组头承担），不进列配置弹窗
    if (k === 'cluster') return viewMode.value === 'flat'
    return selected.has(k)
  })
  const groupMode = viewMode.value === 'group'
  return cols.map((c, i) => ({
    ...c,
    width: fittedColumnWidths.value[String(c.key)] ?? (c.width as number | undefined),
    fixed: groupMode ? undefined : c.fixed,
    customCell: (record: unknown) => groupHeaderCellProps(record, i === 0),
  }))
})

// 列拖拽手势（调宽 + 移动）共享 composable，与三列表页同源
const {
  wrapClass: asWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => columns as never[],
  orderedKeys: () => orderedColumns.value.map((c) => String(c.key)),
  getWidth: (key) => autostartColumnWidths.value[key],
  setColumnWidth: setAutostartColumnWidth,
  setColumnOrder: setAutostartColumnOrder,
  tableSelector: '.autostart-table',
  fixedKeys: ['index', 'ip', 'actions'],
})

function handleResetColumnWidths(): void {
  resetAutostartColumnWidths()
  autostartColumnPopoverVisible.value = false
}

/** 组标记行单元格协议（contract 10.6）：首列整行 colSpan（+1 补选择列宽），其余列隐藏 */
function groupHeaderCellProps(record: unknown, isFirst: boolean): Record<string, unknown> {
  if (!isGroupHeaderRow(record)) return {}
  return isFirst ? { colSpan: visibleAutostartColumns.value.length + 1 } : { class: 'l5-group-cell-hidden' }
}
/** 组标记行整行类（样式见 style.css .l5-group-row 段） */
function asCustomRow(record: unknown): Record<string, unknown> {
  return isGroupHeaderRow(record) ? { class: 'l5-group-row' } : {}
}

/** 组头状态分布徽章（节点页 nodeGroupChips 同构）：真实态 ok/warn、失败态 bad */
function autostartGroupChips(rows: Array<Record<string, unknown>>): ClusterGroupChip[] {
  const count = (pred: (s: string) => boolean) =>
    rows.filter((r) => typeof r.autostart_status === 'string' && pred(r.autostart_status as string)).length
  const notQueried = rows.filter((r) => !r.autostart_status).length
  const chips: ClusterGroupChip[] = []
  const enabled = count((s) => s === 'enabled')
  const disabledCnt = count((s) => s === 'disabled')
  const notCfg = count((s) => s === 'not_configured')
  const denied = count((s) => s === 'permission_denied')
  const failed = count((s) => s === 'unknown')
  if (enabled) chips.push({ label: `${enabled} 已启用`, tone: 'ok' })
  if (disabledCnt) chips.push({ label: `${disabledCnt} 已禁用`, tone: 'warn' })
  if (notCfg) chips.push({ label: `${notCfg} 未配置`, tone: 'warn' })
  if (denied) chips.push({ label: `${denied} 查询受限`, tone: 'bad' })
  if (failed) chips.push({ label: `${failed} 查询失败`, tone: 'bad' })
  if (notQueried) chips.push({ label: `${notQueried} 未查询` })
  return chips
}

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

// ── 分组/平铺（list-page-cluster-grouping，与节点管理同源）：分组默认，组头带状态分布徽章；
//    组标记行混入 dataSource（表格 :pagination="false"，分页走外置 ListPager，#290 裁决）──
const { displayRows, sequenceOf, isRowSelectable, toggleFold, pageHasFolded, toggleFoldAll } = useListClusterGrouping({
  rows: () => pagedNodes.value,
  unit: '节点',
  mode: viewMode,
  // 组内固定序 = IP 数值序（与节点页同款）；仅分组模式生效
  sortWithinGroup: compareNodeIp as (a: Record<string, unknown>, b: Record<string, unknown>) => number,
  chips: autostartGroupChips,
})

// 筛选收窄后页码越界 → 回夹到最后一页（避免空页）
watch(
  () => filteredNodes.value.length,
  (len) => {
    const maxPage = Math.max(1, Math.ceil(len / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  },
)

/** 分页条事件（ListPager）：表外独立分页，表格本身 `:pagination="false"`（组标记行不占页容量）。
 *  保留「分页条钉位」补偿（2026-10-29 用户实测「点第一页页面跳了」）：末页行数不满页时
 *  表格总高变化，渲染后按分页条位移 scrollBy 钉位（仅分页条在视口内时生效）。 */
async function handlePagerChange(nextPage: number, nextPageSize: number) {
  const rect = document.querySelector('.l5-pager')?.getBoundingClientRect() ?? null
  const pagerVisible = rect != null && rect.top < window.innerHeight && rect.bottom > 0
  page.value = nextPage
  if (nextPageSize && nextPageSize !== pageSize.value) pageSize.value = nextPageSize
  if (!pagerVisible || !rect) return
  await nextTick()
  const after = document.querySelector('.l5-pager')?.getBoundingClientRect()
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

/** 状态胶囊类（autostart-page-restyle 六态视觉：真实态实底 + 色点，失败态虚线描边，未查询灰实底） */
function pillClass(record: any): string {
  switch (record.autostart_status) {
    case 'enabled':
      return 'as-enabled'
    case 'disabled':
      return 'as-disabled'
    case 'not_configured':
      return 'as-notcfg'
    case 'permission_denied':
      return 'as-denied'
    case 'unknown':
      return 'as-failed'
    default:
      return 'as-unset'
  }
}

/** 页头统计徽标（补充维度）：去重集群数 + 未配置台数，均取当前已加载数据集 */
const headerStatItems = computed(() => {
  const clusterIds = new Set(nodes.value.map((n: any) => n.cluster_id))
  const notConfigured = nodes.value.filter((n: any) => n.autostart_status === 'not_configured').length
  return [
    { value: clusterIds.size, label: '个集群' },
    { value: notConfigured, label: '台未配置', tone: 'warn' as const },
  ]
})

/** 状态 chips（filter-architecture 单一形态）：计数基于集群/IP 过滤后的同一数据源（不含状态过滤自身） */
const STATUS_CHIP_DEFS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已禁用' },
  { key: 'not_configured', label: '未配置' },
  { key: 'permission_denied', label: '查询受限' },
  { key: 'unknown', label: '查询失败' },
  { key: 'not_queried', label: '未查询' },
]

const statusChips = computed(() => {
  const kw = ipSearch.value.trim()
  const base = nodes.value.filter((n: any) => !kw || String(n.ip).includes(kw))
  const counts: Record<string, number> = {
    '': base.length,
    enabled: 0,
    disabled: 0,
    not_configured: 0,
    permission_denied: 0,
    unknown: 0,
    not_queried: 0,
  }
  for (const n of base) {
    const s = n.autostart_status as string | null
    if (s === null || s === undefined) counts.not_queried++
    else if (s in counts) counts[s]++
    else counts.unknown++
  }
  return STATUS_CHIP_DEFS.map((d) => ({ ...d, count: counts[d.key] }))
})

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
      groupName: groupFilter.value,
      ...(clusterFilter.value ? { clusterId: Number(clusterFilter.value) } : {}),
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
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: onSelectionChange,
  // antd 传给 getCheckboxProps 的是**记录本身**（不是 { record }）；组标记行不可勾选（#93②）
  getCheckboxProps: (rec: unknown) => ({ disabled: !isRowSelectable(rec) }),
}))

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

// 视图模式供测试/调试显式钉位（nodes contract 10.2 同款：组件测试用 vm.viewMode='flat' 钉平铺场景）
defineExpose({ viewMode })
</script>

<style scoped>
/* 列配置弹层提示行（nodes pop-hint 同款语义） */
.as-pop-hint {
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 7px 10px;
}

/* 状态胶囊六态（autostart-page-restyle，基准 proposal-c/edge-autostart.html）：
   真实态实底 + 色点；失败态透明底虚线描边（与真实态分层）；未查询灰实底非失败语义 */
.pill.as-enabled {
  background: oklch(55% 0.15 145 / 12%);
  color: var(--success);
}
.pill.as-enabled .dot {
  background: var(--success);
}
.pill.as-disabled {
  background: oklch(65% 0.15 85 / 14%);
  color: oklch(57% 0.13 70);
}
.pill.as-disabled .dot {
  background: var(--warning);
}
.pill.as-notcfg,
.pill.as-unset {
  background: oklch(50% 0.018 240 / 8%);
  color: var(--muted);
}
.pill.as-notcfg .dot,
.pill.as-unset .dot {
  background: oklch(50% 0.018 240 / 55%);
}
.pill.as-denied {
  background: transparent;
  border: 1px dashed oklch(65% 0.15 85 / 45%);
  color: oklch(57% 0.13 70);
}
.pill.as-denied .dot {
  background: var(--warning);
}
.pill.as-failed {
  background: transparent;
  border: 1px dashed oklch(55% 0.18 28 / 40%);
  color: var(--danger);
}
.pill.as-failed .dot {
  background: var(--danger);
}

/* 操作列「禁用」为危险操作样式（spec：操作按钮层级；其余动作走全局 .op-btn ghost） */
.ops .op-btn.op-danger {
  color: var(--danger);
}
.ops .op-btn.op-danger:disabled:hover {
  color: var(--danger);
}

/* 单节点操作与批量入口之间的分隔线（语义已由共享 .v-sep 承担，此行保留占位说明） */

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

/* 失败态（查询受限/查询失败）虚线描边语义已并入 .pill.as-denied / .as-failed */

/* Edge 目录列省略 */
.edge-path-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* 禁用按钮的 tooltip 语义已由原生 title 承担（预检原因随按钮 title 显示） */

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
  font-size: 13px;
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
