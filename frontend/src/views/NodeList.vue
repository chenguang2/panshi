<template>
  <!-- 单实现双形态（shared-core-plan A 试点）：
       缺省 = 独立列表页（PageHeader + 集群筛选 + 分组/平铺）；
       传 scopedClusterId = 统一管理最大化面板的「集群节点」Tab（隐藏页头/集群筛选/分组切换与集群列，
       页面级动作改由工具条左侧紧凑钮承载，其余（chips/批量条/表格/分页/列配置）与页面同一份实现）。 -->
  <div class="node-list" :class="{ 'node-list-scoped': isScoped }">
    <PageHeader v-if="!isScoped" title="节点管理" description="管理 Edge 网关节点，监控运行状态并执行操作">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-secondary" @click="openBatchImport">
          <StrokeIcon name="upload" :size="13" /> 批量导入
        </button>
        <button class="btn btn-primary" @click="openAddModal"><StrokeIcon name="plus" :size="13" /> 添加节点</button>
      </template>
    </PageHeader>

    <div ref="cardRef" class="table-container l5-card" :class="{ 'scope-card': isScoped }">
      <!-- 工具条（list-pages-console-restyle）：共享 TableToolbar，右端簇 = 计数 → 刷新 → 列配置 → 分组|平铺。
           scoped（面板 Tab）隐藏「分组|平铺」（单集群下无意义，恒平铺）。 -->
      <TableToolbar
        v-model:mode="viewMode"
        class="node-filter-bar nowrap"
        :count="totalCount"
        count-unit="个节点"
        :show-count="false"
        :show-mode="!isScoped"
        :refreshing="loading"
        @refresh="refreshList"
      >
        <template #filters>
          <!-- scoped：页面级动作（原本在 PageHeader）收敛为工具条左侧紧凑钮（#90 页头动作区规范的 scoped 替代） -->
          <template v-if="isScoped">
            <button class="btn btn-primary btn-sm" data-test="scope-add-node" @click="openAddModal">
              <StrokeIcon name="plus" :size="13" /> 添加节点
            </button>
            <button class="btn btn-secondary btn-sm" data-test="scope-batch-import" @click="openBatchImport">
              <StrokeIcon name="upload" :size="13" /> 批量导入
            </button>
          </template>
          <SearchInput
            v-if="nodeSearchVisible"
            v-model="searchText"
            placeholder="搜索 IP..."
            :width="150"
            @input="onSearchInput"
          />
          <!-- 分组/集群筛选仅页面形态（面板恒单集群、恒平铺） -->
          <select
            v-if="!isScoped"
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
            v-if="!isScoped"
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="onFilterChange"
          />
          <span v-if="statusFilter" class="text-muted text-sm">筛出 {{ displayedNodes.length }} 个</span>
        </template>
        <template #config>
          <a-popover v-model:open="nodeColumnPopoverVisible" trigger="click" placement="bottomLeft">
            <template #title>选择显示列</template>
            <template #content>
              <div style="min-width: 400px">
                <div style="font-weight: 500; margin-bottom: 8px">显示字段</div>
                <a-checkbox-group v-model:value="nodeColumnsSelected">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px">
                    <div v-for="col in popoverColumns" :key="col.key" style="margin-bottom: 4px">
                      <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                    </div>
                  </div>
                </a-checkbox-group>
                <a-divider style="margin: 12px 0" />
                <div style="font-weight: 500; margin-bottom: 8px">操作按钮</div>
                <a-checkbox-group v-model:value="nodeActionsSelected">
                  <div style="display: flex; flex-wrap: wrap; gap: 8px">
                    <div v-for="btn in inlineNodeActionOptions" :key="btn.key" style="margin-bottom: 4px">
                      <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                    </div>
                  </div>
                </a-checkbox-group>
                <a-divider style="margin: 12px 0" />
                <div style="font-weight: 500; margin-bottom: 8px">搜索</div>
                <a-checkbox v-model:checked="nodeSearchVisible">显示搜索框</a-checkbox>
                <a-divider style="margin: 12px 0" />
                <div class="pop-hint-line">
                  <StrokeIcon name="resizeH" :size="13" />
                  <span>拖动表头右缘可调整列宽，拖动表头整格可调整列序</span>
                </div>
                <button class="btn btn-primary btn-sm" @click="handleResetColumnWidths">重置列宽</button>
              </div>
            </template>
            <button class="btn btn-secondary btn-sm">
              <StrokeIcon name="sliders" :size="13" />
              列配置
              <CaretDownOutlined style="font-size: 10px" />
            </button>
          </a-popover>
        </template>
        <template #mode-extra>
          <button
            v-if="viewMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="toolbar-fold-all"
            :title="pageHasFolded ? '展开当页全部分组' : '收起当页全部分组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <!-- 状态 chips 行（filter-architecture 方案甲 / D1 / D5）：替代原状态下拉；
           「运行中/已停止/未检测」按 nginxState 互斥三分区，「已禁用」按管理开关 status===0
           过滤（跨维度，单选的第五条路径）——两者在行内是两枚并排徽章，语义不合并。 -->
      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips">
          <button
            v-for="c in statusChips"
            :key="c.value"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === c.value, empty: c.count === 0 }"
            :aria-pressed="statusFilter === c.value ? 'true' : 'false'"
            :title="c.value === 'disabled' ? '管理开关维度（status=0）：与运行态可重叠，可同时为运行中/已停止' : ''"
            @click="selectStatus(c.value)"
          >
            {{ c.label }}<span class="f-count">{{ c.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <!-- 批量工具栏（mockup .l5-batchbar：选中态 accent 强调 + 右端清除选择；batch3 2.1 动作集不变） -->
      <div class="l5-batchbar" :class="{ 'has-sel': selectedNodeKeys.length > 0 }">
        <span class="b-count">已选 {{ selectedNodeKeys.length }} 项</span>
        <span class="b-sep"></span>
        <button class="btn btn-ghost btn-sm need-sel" :disabled="!selectedNodeKeys.length" @click="handleBatchStart">
          <StrokeIcon name="play" /> 批量启动
        </button>
        <button class="btn btn-ghost btn-sm need-sel" :disabled="!selectedNodeKeys.length" @click="handleBatchStop">
          <StrokeIcon name="pause" /> 批量停止
        </button>
        <button class="btn btn-ghost btn-sm need-sel" :disabled="!selectedNodeKeys.length" @click="handleBatchReload">
          <StrokeIcon name="rotate" /> 批量重载
        </button>
        <button class="btn btn-ghost btn-sm need-sel" :disabled="!selectedNodeKeys.length" @click="handleBatchStatus">
          <StrokeIcon name="pulse" /> 批量状态查询
        </button>
        <span class="b-sep"></span>
        <!-- 危险动作独占一段（设计习惯：删除类靠右、与动作组用分隔线隔开）；
             计数口径 = 已勾选条数，与批量动作同源（未选禁用）。 -->
        <button
          class="btn btn-danger btn-sm need-sel"
          data-test="batch-delete"
          :disabled="!selectedNodeKeys.length"
          @click="handleBatchDelete"
        >
          <StrokeIcon name="trash" /> 批量删除<span v-if="selectedNodeKeys.length"
            >({{ selectedNodeKeys.length }})</span
          >
        </button>
        <span class="b-spacer"></span>
        <button class="btn btn-secondary btn-sm" :disabled="!selectedNodeKeys.length" @click="clearBatchSelection">
          清除选择
        </button>
      </div>

      <a-table
        :data-source="displayRows"
        :columns="visibleNodeColumns"
        :row-key="(record: any) => record.key ?? record.id"
        :row-selection="rowSelection"
        :custom-row="nodeCustomRow"
        :pagination="false"
        :loading="loading"
        :scroll="{ x: minTableWidth }"
        :table-layout="'fixed'"
        size="middle"
        class="node-table grid-table"
        @change="handleTableChange"
      >
        <template #headerCell="{ column, title }">
          <span class="th-resize-wrap" :class="nodeWrapClass(column)" @mousedown="startColumnMove($event, column)">
            <span>{{ title }}</span>
            <span
              v-if="String(column.key) !== 'index'"
              class="col-resize-handle"
              @mousedown="startColumnResize($event, column)"
            />
          </span>
        </template>
        <template #bodyCell="{ column, record }">
          <!-- 组标记行（list-page-cluster-grouping）：整行 colspan 由列 customCell 控制，此处只渲染内容 -->
          <template v-if="isGroupHeaderRow(record)">
            <ClusterGroupRow :row="record" @toggle="toggleFold(record.groupKey)">
              <template #note>勾选节点后可用上方批量操作</template>
            </ClusterGroupRow>
          </template>
          <template v-else-if="column.key === 'index'">
            <!-- 行号 = 跨页偏移 + 渲染序（组合式 sequenceOf：组标记行不占号，分组/平铺两模式 1 基连续）。
                 序号公式未换共享原语 IndexCell：面板用 IndexCell，页面因分组偏移保留 sequenceOf
                 （组标记行混在同一 tbody，a-table 的 index 会把组头计入，与原公式不等价）。 -->
            <span class="c-idx">{{ (page - 1) * pageSize + sequenceOf(record) }}</span>
          </template>
          <template v-else-if="column.key === 'ip'">
            <span class="text-mono c-strong">{{ record.ip }}</span>
          </template>

          <template v-else-if="column.key === 'cluster'">
            <span class="cl-cell" :class="clusterHueClass(record.cluster_id)">
              <i class="cl-dot"></i><span class="cl-name">{{ record.cluster_name || '-' }}</span>
            </span>
          </template>

          <template v-else-if="column.key === 'service_port'">
            <span class="text-mono text-sm">{{ record.service_port }}</span>
          </template>

          <template v-else-if="column.key === 'management_port'">
            <span class="text-mono text-sm">{{ record.management_port }}</span>
          </template>

          <!-- 安装路径合并列（node-management L2 / contract 10.1）：Edge / OR 两行堆叠，显隐由两个独立勾选键控制 -->
          <template v-else-if="column.key === 'edge_path'">
            <div class="path-stack">
              <div v-if="isPathSelected('edge_path')" class="path-line">
                <span class="path-k">Edge</span>
                <span class="text-mono path-v" :title="record.edge_path || '-'">{{ record.edge_path || '-' }}</span>
              </div>
              <div v-if="isPathSelected('openresty_path')" class="path-line">
                <span class="path-k">OR</span>
                <span class="text-mono path-v" :title="openrestyDisplay(record)">{{ openrestyDisplay(record) }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="column.key === 'status'">
            <!-- 状态格 = 共享原语（B4a）：BadgeStatus 两行封顶（胶囊横排一行 + 检测时间一行），
                 面板侧同一原语以 variant="panel" 渲染两枚 .ps-tag（差异只在 variant）。 -->
            <NodeStatusCell
              variant="page"
              :enabled="record.status !== 0"
              :runtime="nodeCellRuntime(record)"
              :exec-text="nodeCellExecText(record)"
            />
          </template>

          <template v-else-if="column.key === 'edge_version'">
            <span class="text-mono text-sm">{{ record.status_detail?.statistic?.edge_version || '-' }}</span>
          </template>

          <template v-else-if="column.key === 'actions'">
            <div class="node-actions-wrap">
              <!-- 动作钮集（batch3 4.1 / D8）：共享 allNodeActionButtons 配置化（行内勾选 start/stop/status） -->
              <template v-for="btnKey in rowActionKeys" :key="btnKey">
                <button
                  class="btn btn-ghost btn-sm"
                  :title="getActionButtonTitle(btnKey)"
                  @click="handleConfiguredAction(record, btnKey)"
                >
                  <!-- 行内动作图标 = 设计稿 stroke 线稿（mockup-parity-standard r2，StrokeIcon 单点） -->
                  <StrokeIcon v-if="btnKey === 'start'" name="play" />
                  <StrokeIcon v-else-if="btnKey === 'stop'" name="pause" />
                  <StrokeIcon v-else-if="btnKey === 'status'" name="pulse" />
                  {{ getActionButtonText(btnKey) }}
                </button>
              </template>
              <!-- 操作列组间分隔（mockup .v-sep：勾选动作组 | 重载/更多组） -->
              <span class="v-sep"></span>
              <button class="btn btn-ghost btn-sm" @click="handleReload(record)">
                <StrokeIcon name="rotate" /> 重载
              </button>
              <a-dropdown :trigger="['click']">
                <!-- 更多触发器（r5-①）：设计 .menu-anchor .op-btn = 无边框 26×24 锚点 + 12px 三圆横排 -->
                <a-button type="text" size="small" class="action-trigger-btn"><StrokeIcon name="dots" /></a-button>
                <template #overlay>
                  <a-menu class="l5-action-menu">
                    <a-menu-item @click="viewDetail(record)">详情</a-menu-item>
                    <a-menu-item
                      v-for="btn in menuSafeActions"
                      :key="btn.key"
                      @click="handleConfiguredAction(record, btn.key)"
                    >
                      {{ btn.title }}
                    </a-menu-item>
                    <!-- 危险操作独占一栏（设计：删除前后各一条分隔线 + 红色 + 常驻解释）-->
                    <a-menu-divider v-if="menuDangerActions.length" />
                    <a-menu-item
                      v-for="btn in menuDangerActions"
                      :key="btn.key"
                      danger
                      @click="handleConfiguredAction(record, btn.key)"
                    >
                      <div class="menu-item-stack">
                        <span>{{ btn.title }}</span>
                        <small v-if="btn.desc">{{ btn.desc }}</small>
                      </div>
                    </a-menu-item>
                    <a-menu-divider
                      v-if="featuresStore.has('install_openresty') || featuresStore.has('install_edge')"
                    />
                    <a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty(record)">
                      <div class="menu-item-stack">
                        <span>安装 OpenResty</span>
                        <small>选择安装包在节点上安装 OpenResty</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge(record)">
                      <div class="menu-item-stack">
                        <span>安装 Edge</span>
                        <small>在节点 edge_path 部署 Edge 程序</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleAssociateNewOpenresty(record)">
                      <div class="menu-item-stack">
                        <span>关联新 OpenResty</span>
                        <small>把本机 Edge 切换关联到新装的 OpenResty</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item v-if="featuresStore.has('install_edge')" @click="handleEdgePackManagement(record)">
                      <div class="menu-item-stack">
                        <span>升级 Edge 小版本</span>
                        <small>版本包管理与 Edge 小版本升级</small>
                      </div>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="empty5">
            <div class="e-icon">◎</div>
            <div class="e-title">暂无节点</div>
          </div>
        </template>
      </a-table>
      <ListPager :page="page" :page-size="pageSize" :total="totalCount" unit="个节点" @change="handlePagerChange" />
    </div>

    <!-- 单条新增/编辑：共享表单（B2b-1，面板 Tab 与本页同一组件；scoped 下预选并锁定当前集群） -->
    <NodeFormModal
      :visible="formModalVisible"
      :editing-node="editingNode"
      :copying-node="copyingNode"
      :clusters="formClusterOptions"
      :default-cluster-id="scopedClusterId"
      :lock-cluster="isScoped"
      @close="closeFormModal"
      @saved="onFormSaved"
    />

    <!-- Detail Modal -->
    <div class="modal-overlay" :style="{ display: detailModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ detailTitle }}</h2>
          <button class="modal-close" @click="detailModalVisible = false">&times;</button>
        </div>
        <div class="modal-body" v-if="detailNode">
          <div class="node-detail-grid">
            <div class="nd-label">IP 地址</div>
            <div class="nd-value">{{ detailNode.ip }}</div>
            <div class="nd-label">所属集群</div>
            <div class="nd-value">{{ detailNode.cluster_name || '-' }}</div>
            <div class="nd-label">服务端口</div>
            <div class="nd-value">{{ detailNode.service_port }}</div>
            <div class="nd-label">管理端口</div>
            <div class="nd-value">{{ detailNode.management_port }}</div>
            <div class="nd-label">Edge 安装路径</div>
            <div class="nd-value">{{ detailNode.edge_path }}</div>
            <div class="nd-label">OpenResty 安装路径</div>
            <div class="nd-value">{{ detailNode.openresty_path || '（同 Edge 安装路径）' }}</div>
            <div class="nd-label">节点状态</div>
            <div class="nd-value">
              <div class="status-cell">
                <div class="s-row">
                  <BadgeStatus
                    v-if="detailNode.status === 0"
                    text="已禁用"
                    status="disabled"
                    title="管理开关已禁用：不承载业务流量，仍可执行节点任务与状态查询"
                  />
                  <BadgeStatus v-if="nginxState(detailNode) === 'running'" text="运行中" status="online" />
                  <BadgeStatus v-else-if="nginxState(detailNode) === 'stopped'" text="已停止" status="offline" />
                  <BadgeStatus v-else text="未检测" status="neutral" />
                </div>
                <span v-if="detailNode.status_detail?.last_execution" class="exec-time"
                  >{{ formatRelativeTime(detailNode.status_detail.last_execution) }}检测</span
                >
              </div>
            </div>
            <div class="nd-label">管理开关</div>
            <div class="nd-value">{{ detailNode.status === 1 ? '启用' : '禁用' }}</div>
            <div class="nd-label">创建时间</div>
            <div class="nd-value">{{ formatDate(detailNode.created_at) }}</div>
          </div>
          <div v-if="clusterStats" class="node-stats">
            <div class="node-stats-label">所在集群统计（集群级）</div>
            <div class="node-stats-grid">
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.routes || 0 }}</div>
                <div class="ns-label">路由</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.upstreams || 0 }}</div>
                <div class="ns-label">上游</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.plugin_configs || 0 }}</div>
                <div class="ns-label">插件组</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.global_rules || 0 }}</div>
                <div class="ns-label">全局规则</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.plugin_metadata || 0 }}</div>
                <div class="ns-label">插件元数据</div>
              </div>
              <div class="node-stat-card">
                <div class="ns-value">{{ clusterStats.static_resources || 0 }}</div>
                <div class="ns-label">静态资源</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="detailModalVisible = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- Config Diff Drawer -->
    <ConfigDiff v-model:visible="diffDrawerVisible" :cluster-id="diffClusterId" :initial-node-id="diffNodeId" />

    <!-- Execution Result Drawer -->
    <NodeExecutionResultDrawer
      :visible="execDrawerVisible"
      :title="execDrawerTitle"
      :mode="execDrawerMode"
      :progress="execProgress"
      :logs="execLogs"
      :elapsed="execElapsed"
      :result="execResult"
      :highlights="execHighlights"
      :statistics="execStatistics"
      :installing="installInstalling"
      :stream-error="installError"
      :stream-status="installStatus"
      @update:visible="execDrawerVisible = $event"
      @cancel="handleCancelInstall"
    />

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

    <!-- 批量动作进度弹窗（batch3 1.4 / D4：与 Tab 渲染同一组件、状态来自共享工厂） -->
    <BatchActionProgressModal
      v-model:visible="batchProgressVisible"
      :title="batchProgressTitle"
      :items="batchProgressItems"
      :expanded-key="batchProgressExpandedKey"
      @toggle-expand="
        (label: string) => {
          batchProgressExpandedKey = batchProgressExpandedKey === label ? null : label
        }
      "
    />

    <!-- 批量导入：共享弹窗（B2b-2；页面形态在弹窗内选集群，scoped 形态由上下文锁定集群） -->
    <NodeBatchImportModal
      :visible="batchImportVisible"
      :clusters="isScoped ? [] : clusters"
      :cluster-id="scopedClusterId"
      :cluster-name="scopedClusterName"
      :lock-cluster="isScoped"
      @close="batchImportVisible = false"
      @saved="onBatchImported"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import type { Node } from '@/types'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatDateTime as formatDate, formatRelativeTime } from '@/utils/format'
import ClusterSelect from '@/components/ClusterSelect.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { message } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import api from '@/api'
import { showDangerConfirm } from '@/composables/useOverlayModal'
import { PAGE_SIZE_TABLE, PAGE_SIZE_DROPDOWN } from '@/constants'
import PageHeader from '@/components/PageHeader.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'
import NodeStatusCell from '@/components/resource-cells/NodeStatusCell.vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'
import NodeFormModal from '@/components/NodeFormModal.vue'
import NodeBatchImportModal from '@/components/NodeBatchImportModal.vue'
import BatchActionProgressModal from '@/components/BatchActionProgressModal.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import InstallOpenrestyDialog from '@/components/InstallOpenrestyDialog.vue'
import EdgePackManagementDialog from '@/components/EdgePackManagementDialog.vue'
import { useInstallStream } from '@/composables/useInstallStream'
import { useColumnConfig } from '@/composables/useColumnConfig'
import { useColumnDragColumns } from '@/composables/useColumnDragColumns'
import {
  useListClusterGrouping,
  isGroupHeaderRow,
  type ClusterGroupChip,
  type ListViewMode,
} from '@/composables/useListClusterGrouping'
import { compareNodeIp } from '@/utils/listGroupSorters'
import { clusterHueClass, CLUSTER_COLUMN_MIN_WIDTH, CLUSTER_COLUMN_WIDTH } from '@/utils/clusterHue'
import TableToolbar from '@/components/TableToolbar.vue'
import { useFitColumnWidths, toDesignWidths, SELECTION_COLUMN_WIDTH } from '@/composables/useFitColumnWidths'
import ClusterGroupRow from '@/components/ClusterGroupRow.vue'
import ListPager from '@/components/ListPager.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import { useFeaturesStore } from '@/stores/features'
import { listNodes } from '@/api/nodes'
import {
  nginxState,
  nodeCellRuntime,
  nodeCellExecText,
  createCancelNodeInstallHandler,
  allNodeActionButtons,
} from '@/composables/useClusterNodes'
import { showNodeDeleteConfirm, executeDeleteWithProgress, showBatchStatusModal } from '@/composables/useClusterUtils'
import {
  runClusterGroupedBatchAction,
  runClusterGroupedBatchDelete,
  runBatchNodeStatus,
  formatClusterBatchSummary,
  createBatchProgressState,
  warnNoNodesSelected,
  type BatchProgressState,
} from '@/composables/useBatchNodeAction'
import { getApiErrorMessage } from '@/utils/error'
import { buildNodeInstallCommand } from '@/utils/nodeInstallCommand'
import { isStructuredSseEvent } from '@/utils/sse'
import { CaretDownOutlined } from '@ant-design/icons-vue'

import { useRoute } from 'vue-router'
import SearchInput from '@/components/SearchInput.vue'

const route = useRoute()
const featuresStore = useFeaturesStore()

/**
 * 单实现双形态（docs/refactoring/shared-core-plan-2026-11-21.md，A 试点）：
 * - 不传 `scopedClusterId`：独立列表页（现状——跨集群、分组/平铺、集群列）。
 * - 传 `scopedClusterId`：统一管理最大化面板的「集群节点」Tab——只承载该集群：
 *   隐藏 PageHeader / 集群与分组筛选 / 分组带 / 集群列，视图恒平铺；
 *   页面级动作（添加节点、批量导入）改由工具条左侧紧凑钮承载；
 *   列配置走独立存储键 `node_panel`，与页面 `node_standalone` 互不污染。
 */
const props = withDefaults(defineProps<{ scopedClusterId?: number | null }>(), { scopedClusterId: null })
const isScoped = computed(() => props.scopedClusterId != null)
/**
 * 写操作成功后的面板通知：统一管理面板以 `@refresh="loadClusters"` 挂载本组件，
 * 借此重载左侧集群卡片与 Tab 徽标计数（增/改/删/批量删/上传后立即生效）。
 * **只在写操作成功后 emit**——挂载、翻页、搜索、筛选、切 chip 一律不调，
 * 否则父级重载会经 prop/数据变化反馈回本组件，形成请求风暴。页面形态无监听者 = 零副作用。
 */
const emit = defineEmits<{ refresh: [] }>()
/** 表单/批量导入弹窗的集群清单：scoped 下只给当前集群（并锁定选择） */
const formClusterOptions = computed(() => {
  const id = props.scopedClusterId
  if (id == null) return clusters.value
  const c = clusters.value.find((x) => x.id === id)
  return [{ id, name: c?.name ?? '', display_name: c?.display_name }]
})
const scopedClusterName = computed(() => {
  const c = clusters.value.find((x) => x.id === props.scopedClusterId)
  return c ? c.display_name || c.name : ''
})
/** 列表/统计请求的集群过滤：scoped 恒取作用域集群，页面形态取筛选下拉 */
function effectiveClusterId(): number | undefined {
  if (props.scopedClusterId != null) return props.scopedClusterId
  return clusterFilter.value ? Number(clusterFilter.value) : undefined
}
/** 分组过滤仅页面形态生效（面板单集群下恒「全部分组」） */
function effectiveGroupName(): string {
  return isScoped.value ? '__all__' : groupFilter.value
}

// ── State ──
const loading = ref(false)
const nodes = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref<string | number>('')
const groupFilter = ref('__all__')
const statusFilter = ref('')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  onFilterChange()
}

let _elapsedTimer: ReturnType<typeof setInterval> | null = null

// Form modal（B2b-1：表单字段/校验/提交已迁至共享 components/NodeFormModal.vue，本页只持有开关与源记录）
const formModalVisible = ref(false)
const editingNode = ref<Node | null>(null)
/** 复制态：以 editingNode 为模板新建（组件内 IP 清空、标题「复制节点」、提交走 POST） */
const copyingNode = ref(false)

// Detail modal
const detailModalVisible = ref(false)
const detailNode = ref<any | null>(null)
const clusterStats = ref<any | null>(null)
const detailTitle = computed(() => (detailNode.value ? `节点详情 — ${detailNode.value.ip}` : '节点详情'))

// Execution drawer
const execDrawerVisible = ref(false)
const execDrawerTitle = ref('')
/** 结果抽屉摘要形态（batch1 3.2 / design D5）：install=安装摘要、action=动作摘要（无 nginx 进程卡）、
 *  auto=按标题回退（安装 → 安装摘要，其余 → nginx 操作摘要，兼容启动/停止/reload）。 */
const execDrawerMode = ref<'install' | 'action' | 'auto'>('auto')
// batch2 5.2 / D8：indeterminate 为动作流起始形态（首个服务端 percent 事件或终态自动退出）
const execProgress = reactive({
  percent: 0,
  status: 'active' as 'active' | 'success' | 'exception',
  indeterminate: false,
})
const execLogs = ref<string[]>([])
const execElapsed = ref<number | null>(null)
const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
const execHighlights = ref<string[]>([])
const execStatistics = ref<Record<string, string> | null>(null)
const execTargetNode = ref<any | null>(null)
const cancelling = ref(false)

// ── 批量动作（batch3 2.1-2.3 / D5：共享进度状态 + 集群分组执行）──
const batchProgress: BatchProgressState = createBatchProgressState()
const {
  visible: batchProgressVisible,
  title: batchProgressTitle,
  items: batchProgressItems,
  expandedKey: batchProgressExpandedKey,
} = batchProgress
const selectedNodeKeys = ref<number[]>([])
const rowSelection = computed(() => ({
  selectedRowKeys: selectedNodeKeys.value,
  onChange: (keys: number[]) => {
    selectedNodeKeys.value = keys
  },
  // 组标记行不可勾选（contract 10.6 / 规格 list-page-cluster-grouping）
  // antd 传给 getCheckboxProps 的是**记录本身**（不是 { record }）；旧实现取 rec.record 恒为
  // undefined → 判定恒可勾选，组头行只因 CSS 隐藏复选框才没暴露（2026-11-21 上游域同款 bug 顺带修正）
  getCheckboxProps: (rec: unknown) => ({ disabled: !isRowSelectable(rec) }),
}))
const batchSelectedNodes = computed(() => nodes.value.filter((n) => selectedNodeKeys.value.includes(n.id)))

function clearBatchSelection() {
  selectedNodeKeys.value = []
}

function groupNodesByCluster(list: Array<{ id: number; ip: string; cluster_id: number; cluster_name?: string }>) {
  const groups = new Map<number, { clusterId: number; clusterName: string; nodes: Array<{ id: number; ip: string }> }>()
  for (const n of list) {
    const g = groups.get(n.cluster_id)
    const node = { id: n.id, ip: n.ip }
    if (g) g.nodes.push(node)
    else
      groups.set(n.cluster_id, {
        clusterId: n.cluster_id,
        clusterName: n.cluster_name || `集群 ${n.cluster_id}`,
        nodes: [node],
      })
  }
  return Array.from(groups.values())
}

async function executeBatchAction(
  list: Array<{ id: number; ip: string; cluster_id: number; cluster_name?: string }>,
  action: 'start' | 'stop' | 'reload',
  label: string,
) {
  // F1：动作类按 cluster_id 分组逐集群调批量端点；集群级失败不中断整体（F4）
  const summary = await runClusterGroupedBatchAction(groupNodesByCluster(list), action, label, {
    progress: batchProgress,
  })
  message.info(formatClusterBatchSummary(summary))
  clearBatchSelection()
  await refreshAfterWrite()
}

function confirmBatchAction(action: 'start' | 'stop' | 'reload', label: string) {
  const list = batchSelectedNodes.value
  if (list.length === 0) {
    warnNoNodesSelected()
    return
  }
  showDangerConfirm(
    `确认批量${label}节点`,
    `将对 ${list.length} 个节点执行 ${label} 操作，涉及 ${groupNodesByCluster(list).length} 个集群。确认？`,
    `确认${label}`,
    () => executeBatchAction(list, action, label),
  )
}

function handleBatchStart() {
  confirmBatchAction('start', '启动')
}
function handleBatchStop() {
  confirmBatchAction('stop', '停止')
}
function handleBatchReload() {
  confirmBatchAction('reload', 'reload')
}

// F1：批量状态查询不走批量端点，逐节点 statistic（与 Tab batchNodeStatus 同款路径）
async function handleBatchStatus() {
  const list = batchSelectedNodes.value
  if (list.length === 0) {
    warnNoNodesSelected('查询')
    return
  }
  const rows = await runBatchNodeStatus(list, { progress: batchProgress })
  showBatchStatusModal('批量状态查询', rows)
  clearBatchSelection()
  await refreshList()
}

/**
 * 批量删除（节点批量条唯一入口，页面与统一管理面板 Tab 同一实现）。
 *
 * 确认复用节点专用变体 showNodeDeleteConfirm（单一告知：删平台记录、进程不受影响、
 * 退出发布与中继白名单），执行走 runClusterGroupedBatchDelete（后端只有集群作用域集合端点，
 * 跨集群勾选按 cluster_id 分组顺序请求，进度弹窗与其他批量动作同款组件）。
 */
async function handleBatchDelete() {
  const list = batchSelectedNodes.value
  if (list.length === 0) {
    warnNoNodesSelected()
    return
  }
  showNodeDeleteConfirm({
    ips: list.map((n) => n.ip),
    onOk: async () => {
      const summaries = await runClusterGroupedBatchDelete(groupNodesByCluster(list), {
        progress: batchProgress,
      })
      const total = summaries.reduce((acc, s) => acc + s.total, 0)
      const success = summaries.reduce((acc, s) => acc + s.success, 0)
      const failed = total - success
      clearBatchSelection()
      await refreshAfterWrite()
      if (failed === 0) {
        message.success(`已删除 ${success} 个节点（仅平台记录，节点机进程不受影响）`)
      } else {
        // 集群级失败原因（getApiErrorMessage 提取）并入同一条提示：用户不展开进度弹窗也能看到原因
        const clusterErrors = summaries
          .filter((s) => s.clusterError)
          .map((s) => `集群 ${s.clusterName}：${s.clusterError}`)
        message.warning(
          `已删除 ${success} 个节点，${failed} 个失败：${formatClusterBatchSummary(summaries)}${
            clusterErrors.length ? `（${clusterErrors.join('；')}）` : ''
          }`,
        )
      }
    },
  })
}

// ── 复制节点（batch3 3.1 / D6：预填行配置、IP 清空；预填与清空在共享 NodeFormModal 内，B2b-1）──
function handleCopy(record: Node) {
  editingNode.value = record
  copyingNode.value = true
  formModalVisible.value = true
}

// ── 批量导入弹窗（B2b-2：解析/默认值/预览/提交全在共享 NodeBatchImportModal）──
// 本页只持开关与刷新；集群在弹窗内选择（:clusters 注入，未选集群时提交禁用）
const batchImportVisible = ref(false)

function openBatchImport() {
  batchImportVisible.value = true
}

// batch3 1.3 / D3：危险红确认上移为 useOverlayModal 具名导出，本视图改直接引用（原本地包装已删）。
// 危险色语义：动作确认按钮一律危险红；onOk 为 Promise 期间由 okLoading 展示「处理中…」并禁用。

// Config diff drawer
const diffDrawerVisible = ref(false)
const diffClusterId = ref(0)
const diffNodeId = ref(0)

// batch2 3.2 / D6：移除全部列客户端排序——当前页字符串比较序是错的（IP 数值序被打乱），
// 后端 GET /nodes 已全量数值 IP 排序；≤100 节点规模下当前页排序无价值且误导。不做表头排序 UI 替代。
// 默认宽度档（node-list-column-resize D3 + list-pages-console-restyle L2）：安装路径合并列按 mockup
// 314px 档；「所属集群」列移除（list-page-cluster-grouping：集群归属由组头行表达）。
// Edge / OpenResty 安装路径合并为「安装路径」单列两行堆叠，列配置保持两独立键（contract 10.1，存储零迁移）。
const columns: TableColumnsType = [
  // 列宽 = 设计稿 colgroup 按容器 1310 等比放大后的实测值（r4-E2；#48/选择列 40 一并合计恰满宽，
  // 富余宽度给安装路径而不是端口/版本——设计里路径列占比最大，且它是唯一长文本列）
  { title: '#', key: 'index', width: 48, fixed: 'left' },
  { title: 'IP', dataIndex: 'ip', key: 'ip', width: 149, fixed: 'left' },
  { title: '集群', key: 'cluster', width: 116, sorter: true }, // 仅平铺可见；服务端 sort_by=cluster
  { title: '服务端口', key: 'service_port', width: 82 },
  { title: '管理端口', key: 'management_port', width: 82 },
  { title: '安装路径', key: 'edge_path', width: 377 },
  { title: '状态', key: 'status', width: 147 },
  { title: 'Edge 版本', key: 'edge_version', width: 87 },
  { title: '操作', key: 'actions', width: 298, fixed: 'right' },
]
// 全量列键（含被合并列吞并的 openresty_path——仅作列配置勾选/存储键，不单独成列，contract 10.1）
const ALL_COLUMN_KEYS: string[] = (() => {
  const keys = columns.map((c) => String(c.key))
  const at = keys.indexOf('edge_path') + 1
  return [...keys.slice(0, at), 'openresty_path', ...keys.slice(at)]
})()

// ── 集群分组 + 双模式（list-page-cluster-grouping，共享组合式单点）──
// scoped（面板 Tab）= 单集群，分组带无意义 → 恒平铺（切换器同时隐藏）
const viewMode = ref<ListViewMode>(isScoped.value ? 'flat' : 'group')
/** 运行态三元过滤（batch2 3.1 / D5）：按 nginxState 判定，不按管理开关字段。
 *  抽出纯函数：displayedNodes 与 loadNodes 的 loadAll 计数共用同一口径（规格要求
 *  「徽标/计数随筛选数据集更新」，loadAll 模式 totalCount 须为过滤后全量而非载入全量）。 */
function applyStatusFilter<T extends Parameters<typeof nginxState>[0] & { status?: number }>(list: T[]): T[] {
  if (!statusFilter.value) return list
  // 「已禁用」是管理开关维度（status === 0），与运行态三态正交：单选的第五条路径
  if (statusFilter.value === 'disabled') return list.filter((n) => n.status === 0)
  return list.filter((n) => nginxState(n) === statusFilter.value)
}
const displayedNodes = computed(() => applyStatusFilter(nodes.value))
/** 本页渲染的数据行（r4-④）：常规模式 = 服务端已切页；loadAll（状态筛选）模式一次拉全量，
 *  必须在此自行切片再交给分组——否则 `:pagination="false"` 会把全量（≤500）一次渲染出来。 */
const pageRows = computed(() => {
  if (!statusFilter.value) return displayedNodes.value
  const from = (page.value - 1) * pageSize.value
  return displayedNodes.value.slice(from, from + pageSize.value)
})
/** 组头统计芯片（contract 10.3）：判定复用行内徽章同源的 nginxState，为 0 的项不渲染 */
function nodeGroupChips(rows: Array<Record<string, unknown>>): ClusterGroupChip[] {
  let running = 0
  let stopped = 0
  let unchecked = 0
  for (const n of rows) {
    const state = nginxState(n as Parameters<typeof nginxState>[0])
    if (state === 'running') running++
    else if (state === 'stopped') stopped++
    else unchecked++
  }
  const chips: ClusterGroupChip[] = []
  if (running) chips.push({ label: `${running} 运行中`, tone: 'ok' })
  if (stopped) chips.push({ label: `${stopped} 已停止`, tone: 'bad' })
  if (unchecked) chips.push({ label: `${unchecked} 未检测`, tone: 'warn' })
  return chips
}
const { displayRows, sequenceOf, isRowSelectable, toggleFold, pageHasFolded, toggleFoldAll } = useListClusterGrouping({
  rows: () => pageRows.value,
  unit: '节点',
  mode: viewMode,
  // 组内固定序 = IP 数值序（规格 list-page-cluster-grouping）；仅分组模式生效
  sortWithinGroup: compareNodeIp as (a: Record<string, unknown>, b: Record<string, unknown>) => number,
  chips: nodeGroupChips,
})

// ── 页头徽标 + 状态 chips 计数（filter-architecture D1/D3/D5）：同一份「全量节点」数据集，
//    页头只留总数（状态分布改由 chips 承担，避免同一组数字出现两次）。
//    节点运行态来自 status_detail.nginx.nginx_running（JSON），无法 SQL 聚合；部署规模
//    （≤18 集群 × ≤3 节点）下一次 pageSize=500 拉全量即精确。
const statsNodes = ref<any[]>([])
async function loadNodeStats() {
  try {
    const res = await listNodes({
      groupName: effectiveGroupName(),
      page: 1,
      pageSize: PAGE_SIZE_DROPDOWN, // MAX_PAGE_SIZE：全量一次取回（与节点规模匹配）
      search: searchText.value || undefined,
      // scoped（面板 Tab）= 当前集群：计数口径与列表同源（无 /nodes/stats 聚合端点，
      // 运行态来自 status_detail JSON 也无法 SQL 聚合，故沿用「全量拉取后前端计数」）
      clusterId: effectiveClusterId(),
      status: undefined,
    })
    statsNodes.value = res.data.items || []
  } catch {
    // 统计失败静默（保留上次计数）；列表加载失败由 loadNodes 自己提示
  }
}
/** chips 计数：运行态三分区 + 已禁用（管理开关 status===0，跨维度单选路径） */
const statusCounts = computed(() => {
  let running = 0
  let stopped = 0
  let unchecked = 0
  let disabled = 0
  for (const n of statsNodes.value) {
    const state = nginxState(n as Parameters<typeof nginxState>[0])
    if (state === 'running') running++
    else if (state === 'stopped') stopped++
    else unchecked++
    if (n.status === 0) disabled++
  }
  return { total: statsNodes.value.length, running, stopped, unchecked, disabled }
})
const statusChips = computed(() => [
  { value: '', label: '全部', count: statusCounts.value.total },
  { value: 'running', label: '运行中', count: statusCounts.value.running },
  { value: 'stopped', label: '已停止', count: statusCounts.value.stopped },
  { value: 'unchecked', label: '未检测', count: statusCounts.value.unchecked },
  { value: 'disabled', label: '已禁用', count: statusCounts.value.disabled },
])
/** 点状态 chip：设 statusFilter（'disabled' 走管理开关维度）并重查 */
function selectStatus(value: string): void {
  statusFilter.value = value
  page.value = 1
  refreshList()
}
// 页头徽标 = 补充维度「涉及 N 集群」（filter-architecture 决策 G3-甲）：
// 总数已在 chips「全部 N」与分页条各出现一次，页头改放 chips 表达不了的规模信息。
const headerStatItems = computed(() => [
  { value: new Set(statsNodes.value.map((n: Record<string, unknown>) => n.cluster_id)).size, label: '集群' },
])

/** 刷新语义（design D6）：重拉列表 + 徽标统计；不重置筛选/排序键/视图模式。
 *  顺序化执行（先列表后统计）：并发的两个同名端点请求会让「最后一次调用」类断言产生竞态，
 *  且等待方（refreshFn awaits）需要两者都完成。 */
async function refreshList(): Promise<void> {
  await loadNodes()
  await loadNodeStats()
}

/**
 * 「写操作成功后」的刷新：先通知面板重载集群卡片/徽标，再刷新本页列表。
 * 共享流程（executeDeleteWithProgress 等）的 `refreshFn` 只在请求成功后调用，
 * 故把它当作 refreshFn 传递即等价于「删除成功后 emit」，不必改共享 composable 语义（AGENTS #217）。
 */
async function refreshAfterWrite(): Promise<void> {
  emit('refresh')
  await refreshList()
}

// ── 列/按钮/搜索个性化（batch3 4.1 / D8）──
// 存储键：页面形态 = `node_standalone`，scoped（面板 Tab）= `node_panel`（两形态互不污染）。
// 行内可调动作 = start/stop/status（reload 为本页特有动作，固定展示）；
// 编辑/复制/删除/数据库对比 恒驻「更多」菜单（D6），不作为 popover 勾选项。
const NODE_ROW_ACTION_KEYS = ['start', 'stop', 'status']
const {
  popoverVisible: nodeColumnPopoverVisible,
  columnsSelected: nodeColumnsSelected,
  searchVisible: nodeSearchVisible,
  actionsSelected: nodeActionsSelected,
  columnWidths: nodeColumnWidths,
  setColumnWidth: setNodeColumnWidth,
  resetWidths: resetNodeColumnWidths,
  columnOrder: nodeColumnOrder,
  setColumnOrder: setNodeColumnOrder,
} = useColumnConfig({
  key: isScoped.value ? 'node_panel' : 'node_standalone',
  // 默认勾选/顺序清洗均按全量列键（含被合并的 openresty_path，#79 route-column-reorder-fix）
  defaultColumns: [...ALL_COLUMN_KEYS],
  allColumns: [...ALL_COLUMN_KEYS],
  defaultActions: [...NODE_ROW_ACTION_KEYS],
  defaultSearchVisible: true,
})
const inlineNodeActionOptions = allNodeActionButtons.filter((b) => NODE_ROW_ACTION_KEYS.includes(b.key))
// 列顺序（node-list-column-resize D7 方案 A）：用户顺序覆盖默认序，未知 key（含已移除的 cluster_name）剔除、新列补位
const orderedColumns = computed(() => {
  const stored = nodeColumnOrder.value
  const seq = stored.length ? stored : columns.map((c) => String(c.key))
  const known = new Map(columns.map((c) => [String(c.key), c]))
  const out: TableColumnsType = []
  const seen = new Set<string>()
  for (const k of seq) {
    const c = known.get(k)
    if (c && !seen.has(k)) {
      out.push(c)
      seen.add(k)
    }
  }
  for (const [k, c] of known) if (!seen.has(k)) out.push(c)
  return out
})
// 列配置勾选清单：合并列的「OpenResty 安装路径」为独立勾选键（contract 10.1），序号列恒不进勾选
const popoverColumns = computed(() => {
  const out: Array<{ key: string; title: string }> = []
  for (const c of columns) {
    const key = String(c.key)
    if (key === 'index' || key === 'cluster') continue
    out.push({ key, title: key === 'edge_path' ? 'Edge 安装路径' : String(c.title) })
    if (key === 'edge_path') out.push({ key: 'openresty_path', title: 'OpenResty 安装路径' })
  }
  return out
})
/** 合并列内部行显隐：两个独立勾选键分别控制 Edge 行 / OR 行（contract 10.1） */
function isPathSelected(key: string): boolean {
  return nodeColumnsSelected.value.includes(key)
}
function openrestyDisplay(record: { openresty_path?: string | null }): string {
  return record.openresty_path || '（同 Edge 安装路径）'
}
/** 组标记行单元格协议（contract 10.6）：首列整行 colSpan，其余列隐藏。
 *  colSpan 额外 +1：组头行的选择列 checkbox（纯视觉噪音，mockup-parity r2 第 6 项）经 CSS
 *  `.l5-group-row .ant-table-selection-column { display:none }` 隐藏，colSpan 补上该列宽度，
 *  通栏仍铺满整行；上游/路由无 row-selection 不受影响。 */
function groupHeaderCellProps(record: unknown, isFirst: boolean): Record<string, unknown> {
  if (!isGroupHeaderRow(record)) return {}
  return isFirst ? { colSpan: visibleNodeColumns.value.length + 1 } : { class: 'l5-group-cell-hidden' }
}
/** 组标记行整行类（样式见 style.css .l5-group-row 段） */
function nodeCustomRow(record: unknown): Record<string, unknown> {
  return isGroupHeaderRow(record) ? { class: 'l5-group-row' } : {}
}
// 列宽自适应（r6-② 方案 A）：容器宽 ≥ 设计总宽时原样用设计值（1600 验收视口逐值一致），
// 窄于设计总宽时等比收缩（下限 = 设计最小总宽 1086，含选择列 40 → 列部分 1046），
// 用户拖拽过的列保持像素值、差额由安装路径列吸收 —— 因此「重置列宽」后不会再横向溢出。
const cardRef = ref<HTMLElement | null>(null)
// 集群列已在 columns 定义里（仅平铺可见）；分组态不参与列宽缩放
const designWidths = () => {
  const base = toDesignWidths(columns)
  // 集群列只在「页面形态 + 平铺」参与缩放（分组视图由组头承担；scoped 单集群无此列）
  if (!isScoped.value && viewMode.value === 'flat') return base
  const { cluster: _cluster, ...rest } = base
  return rest
}
const { widths: fittedColumnWidths, minTableWidth } = useFitColumnWidths({
  designWidths,
  containerRef: cardRef,
  overrides: () => nodeColumnWidths.value,
  reserved: () => SELECTION_COLUMN_WIDTH,
  flexKey: 'edge_path',
  // 列内容下限（r7-B4）：安装路径为弹性列不设下限（吸收余量，压到 32 才允许滚动）；
  // 操作列按钮组实测 ≥285px（2026-11-22：更多触发器加 6px 间距后内容 = 启动/停止/状态/重载
  // 4×53 + v-sep 7 + 触发器 26 + gap 10 + 6 = 261，加单元格内距 24 = 285；原 268 在 ≤1440 视口
  // 会让触发器溢出单元格并把表格撑出 3px 横向滚动条）；
  // 状态列 140px（两枚胶囊并排需 115.6 + 内距 24）。
  // scroll.x = 下限之和 757 + 选择列 40 = 797 → 窗口 ≥ ~1200 时永不出现横向滚动。
  minWidths: () => ({
    ...(!isScoped.value && viewMode.value === 'flat' ? { cluster: CLUSTER_COLUMN_MIN_WIDTH } : {}),
    index: 40,
    ip: 90,
    service_port: 60,
    management_port: 60,
    status: 140,
    edge_version: 50,
    actions: 285,
  }),
})

// 可见列 = 显隐勾选（合并列两键任一勾选即整列出现）+ 用户拖宽覆盖；
// 分组模式剥离 fixed（colSpan 通栏与 sticky 冲突，contract 10.6），平铺保留原状
const visibleNodeColumns = computed(() => {
  const selected = new Set(nodeColumnsSelected.value)
  const cols = orderedColumns.value.filter((c) => {
    const k = String(c.key)
    if (k === 'index') return true
    // 集群列仅「页面形态 + 平铺」存在（分组视图由组头承担；scoped 面板单集群下无意义），不进列配置弹窗
    if (k === 'cluster') return !isScoped.value && viewMode.value === 'flat'
    if (k === 'edge_path') return selected.has('edge_path') || selected.has('openresty_path')
    return selected.has(k)
  })
  const groupMode = viewMode.value === 'group'
  return cols.map((c, i) => ({
    ...c,
    width: fittedColumnWidths.value[String(c.key)] ?? c.width,
    fixed: groupMode ? undefined : c.fixed,
    customCell: (record: unknown) => groupHeaderCellProps(record, i === 0),
  }))
})

// ── 列拖拽手势（调宽 + 移动）共享 composable（column-personalization-rollout D1）：三页同源 ──
const {
  wrapClass: nodeWrapClass,
  startColumnResize,
  startColumnMove,
} = useColumnDragColumns({
  columns: () => columns,
  orderedKeys: () => orderedColumns.value.map((c) => String(c.key)),
  getWidth: (key) => nodeColumnWidths.value[key],
  setColumnWidth: setNodeColumnWidth,
  setColumnOrder: setNodeColumnOrder,
  tableSelector: '.node-table',
  fixedKeys: ['index', 'ip', 'actions'],
})

function handleResetColumnWidths(): void {
  resetNodeColumnWidths()
  nodeColumnPopoverVisible.value = false
  message.success('已恢复默认列宽')
}
// 行内常驻动作 = 勾选的 start/stop/status 子集
const rowActionKeys = computed(() => NODE_ROW_ACTION_KEYS.filter((k) => nodeActionsSelected.value.includes(k)))
// 更多菜单 = 恒驻四钮 + 未勾选的行内动作（非行内钮不受勾选态影响，防止残留配置吞菜单项）
const unselectedSharedActions = computed(() =>
  allNodeActionButtons.filter(
    (b) => !NODE_ROW_ACTION_KEYS.includes(b.key) || !nodeActionsSelected.value.includes(b.key),
  ),
)
/** 菜单分组（r5-② / 设计 .l5-menu）：常规项（详情/编辑/复制/数据库对比）与危险项（删除）分栏，
 *  危险项独占一栏并携带常驻解释 + 红色主文案。 */
const menuSafeActions = computed(() => unselectedSharedActions.value.filter((b) => !b.danger))
const menuDangerActions = computed(() => unselectedSharedActions.value.filter((b) => b.danger))
function getActionButtonTitle(key: string) {
  return allNodeActionButtons.find((b) => b.key === key)?.title ?? key
}
/** 行内按钮文案（设计稿行内「状态」、tooltip/菜单「状态查询」）：shortTitle 缺省回落 title */
function getActionButtonText(key: string) {
  const btn = allNodeActionButtons.find((b) => b.key === key)
  return btn?.shortTitle ?? btn?.title ?? key
}
function handleConfiguredAction(record: any, key: string) {
  switch (key) {
    case 'edit':
      handleEdit(record)
      break
    case 'copy':
      handleCopy(record)
      break
    case 'delete':
      handleDelete(record)
      break
    case 'start':
      handleStart(record)
      break
    case 'stop':
      handleStop(record)
      break
    case 'status':
      handleStatus(record)
      break
    case 'diff':
      handleDiff(record)
      break
  }
}

// ── Data Loading ──

// ── 服务端排序（参考 RouteList 优先级实现）：仅「集群」列可排，且仅平铺视图有效 ──
const SORTABLE_COLUMNS = ['cluster']
const sortBy = ref('')
const sortOrder = ref('')

interface SorterEvent {
  order?: string | null
  field?: unknown
  column?: { key?: unknown }
}

function handleTableChange(
  pagination: { current?: number; pageSize?: number },
  _filters: Record<string, unknown>,
  sorter: SorterEvent | SorterEvent[],
) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  const s = Array.isArray(sorter) ? sorter[0] : sorter
  const field = s && !Array.isArray(s.field) ? String(s.field || s.column?.key || '') : ''
  if (s?.order && SORTABLE_COLUMNS.includes(field)) {
    sortBy.value = field
    sortOrder.value = s.order === 'descend' ? 'desc' : 'asc'
  } else {
    sortBy.value = ''
    sortOrder.value = ''
  }
  loadNodes()
}

async function loadNodes() {
  loading.value = true
  try {
    const hasStatus = !!statusFilter.value
    const loadAll = hasStatus // 仅 statusFilter 触发客户端过滤，group 过滤走服务端
    const res = await listNodes({
      groupName: effectiveGroupName(),
      page: loadAll ? 1 : page.value,
      pageSize: loadAll ? PAGE_SIZE_DROPDOWN : pageSize.value,
      search: searchText.value || undefined,
      // scoped（面板 Tab）恒带当前集群；页面形态取筛选下拉
      clusterId: effectiveClusterId(),
      status: undefined, // 全部通过 nginxRunning() 客户端过滤
      // 分组视图按组内固定序（IP），不参与服务端排序；scoped 恒平铺
      sortBy: sortBy.value && viewMode.value === 'flat' ? sortBy.value : undefined,
      sortOrder: sortBy.value && viewMode.value === 'flat' ? ((sortOrder.value || 'asc') as 'asc' | 'desc') : undefined,
    })
    nodes.value = res.data.items || []
    // loadAll（状态筛选）模式：计数 = 过滤后全量（与「筛出 X 个」/页头徽标同口径，规格一致性）
    totalCount.value = loadAll ? applyStatusFilter(nodes.value).length : res.data.total || 0
  } catch (error: unknown) {
    message.error('加载节点列表失败: ' + getApiErrorMessage(error))
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || []
  } catch {
    // 筛选下拉静默为空会误导用户以为没有集群，至少给出一次提示
    message.warning('集群列表加载失败')
  }
}

async function loadClusterStats(clusterId: number) {
  try {
    const res = await api.get(`/clusters/${clusterId}/stats`)
    clusterStats.value = res.data
  } catch {
    clusterStats.value = null
  }
}

// ── Filter / Search / Pagination ──

/** 分页条事件（ListPager）：表外独立分页，表格本身 `:pagination="false"`（组标记行不占页容量） */
function handlePagerChange(nextPage: number, nextPageSize: number) {
  page.value = nextPage
  if (nextPageSize) pageSize.value = nextPageSize
  loadNodes()
}

function onFilterChange() {
  page.value = 1
  refreshList()
}

function onSearchInput() {
  onDebouncedSearch(() => {
    page.value = 1
    refreshList()
  })
}

// ── Form Modal（B2b-1：表单在共享 components/NodeFormModal.vue，本页只做开关 + 刷新）──

function openAddModal() {
  editingNode.value = null
  copyingNode.value = false
  formModalVisible.value = true
}

function handleEdit(record: Node) {
  editingNode.value = record
  copyingNode.value = false
  formModalVisible.value = true
}

function closeFormModal() {
  formModalVisible.value = false
  editingNode.value = null
  copyingNode.value = false
}

/** 保存成功（组件已内部提交并 emit saved）：刷新列表并收起弹窗 */
function onFormSaved() {
  closeFormModal()
  void refreshAfterWrite()
}

/** 批量导入成功（共享弹窗已提交）：刷新列表 + 通知面板重载徽标 */
function onBatchImported() {
  void refreshAfterWrite()
}

// ── Detail ──

function viewDetail(record: any) {
  detailNode.value = record
  detailModalVisible.value = true
  clusterStats.value = null
  if (record.cluster_id) {
    loadClusterStats(record.cluster_id)
  }
}

// ── Node Actions ──

// batch2 5.2 / D8：计时器只负责已耗时展示，不再外推假百分比（不确定态由 Drawer 渲染）
function startElapsedTimer() {
  execElapsed.value = 0
  if (_elapsedTimer) clearInterval(_elapsedTimer)
  _elapsedTimer = setInterval(() => {
    execElapsed.value = (execElapsed.value ?? 0) + 1
  }, 1000)
}

function stopElapsedTimer() {
  if (_elapsedTimer) {
    clearInterval(_elapsedTimer)
    _elapsedTimer = null
  }
}

async function executeAction(record: any, action: string, actionLabel: string) {
  execDrawerTitle.value = `节点 ${actionLabel}`
  execDrawerMode.value = 'auto'
  execProgress.percent = 0
  execProgress.status = 'active'
  execProgress.indeterminate = true
  execLogs.value = []
  stopElapsedTimer()
  execElapsed.value = null
  execResult.value = null
  execHighlights.value = []
  execStatistics.value = null
  execDrawerVisible.value = true

  // Build pending command for display even on failure
  const nginxCmdMap: Record<string, string> = {
    start: 'nginx_start',
    stop: 'nginx_stop',
    reload: 'nginx_reload',
    status: 'edge_statistic',
  }
  const nginxCmd = nginxCmdMap[action] || action
  const tag = nginxCmd === 'edge_statistic' ? 'edge_statistic' : 'nginx_cmd_run'
  const ev = JSON.stringify({ prefix: record.edge_path || '', ports: String(record.management_port), ips: record.ip })
  const pendingCommand = `ansible-playbook -i inventory -e @env/extravars -e '${ev}' --tags ${tag} edge.yml`

  const addLog = (text: string) => {
    execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  // Set command immediately so command tab shows it from the start
  execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
  addLog(`开始对节点 ${record.ip} 执行 ${actionLabel} 操作...`)
  startElapsedTimer()

  try {
    let res
    if (action === 'start') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/start`)
    } else if (action === 'stop') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/stop`)
    } else if (action === 'reload') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/reload`)
    } else if (action === 'status') {
      res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/statistic`, {
        ports: String(record.management_port),
      })
    }

    const data = res?.data || {}
    stopElapsedTimer()
    execProgress.percent = 100
    execProgress.indeterminate = false
    const finalCommand = data.command || pendingCommand

    addLog(`返回码 (rc): ${data.rc}`)
    if (finalCommand) {
      addLog('')
      addLog(`--- 执行命令 ---`)
      addLog(finalCommand)
    }
    if (data.stdout) {
      addLog('')
      addLog('--- 输出 (stdout) ---')
      addLog(data.stdout)
    }
    if (data.stderr) {
      addLog('')
      addLog('--- 错误输出 (stderr) ---')
      addLog(data.stderr)
    }
    addLog('')
    if (data.rc === 0) {
      execProgress.status = 'success'
      addLog(`✅ 节点 ${actionLabel} 成功`)
    } else {
      execProgress.status = 'exception'
      addLog(`❌ 节点 ${actionLabel} 失败`)
    }

    execHighlights.value = []
    execStatistics.value = data.statistic ? { ...data.statistic } : null
    execResult.value = { stdout: data.stdout || '', stderr: data.stderr || '', command: finalCommand, rc: data.rc }
    // 启/停/reload 成功会改节点状态（面板卡片「健康节点 N/M」随之变化）；「状态查询」是只读操作，不通知
    if (action !== 'status' && data.rc === 0) emit('refresh')
    refreshList()
  } catch (error: unknown) {
    stopElapsedTimer()
    execProgress.status = 'exception'
    execProgress.percent = 100
    execProgress.indeterminate = false
    const errMsg = getApiErrorMessage(error)
    addLog(`❌ 操作失败: ${errMsg}`)
    execHighlights.value = []
    execStatistics.value = null
    execResult.value = { stdout: '', stderr: errMsg, command: pendingCommand, rc: -1 }
  }
}

function handleStart(record: any) {
  showDangerConfirm(
    '确认启动节点',
    `即将对节点 ${record.ip} 执行"启动"操作，确认无误后继续。`,
    '确认启动',
    async () => {
      await executeAction(record, 'start', '启动')
    },
  )
}

function handleStop(record: any) {
  showDangerConfirm(
    '确认停止节点',
    `即将对节点 ${record.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
    '确认停止',
    async () => {
      await executeAction(record, 'stop', '停止')
    },
  )
}

function handleReload(record: any) {
  showDangerConfirm(
    '确认重新加载节点',
    `即将对节点 ${record.ip} 执行"重载"操作，重新加载配置，确认继续？`,
    '确认重载',
    async () => {
      await executeAction(record, 'reload', 'reload')
    },
  )
}

function handleStatus(record: any) {
  executeAction(record, 'status', '状态查询')
}

// ── Install OpenResty Dialog ─────────────────────────────────────
const installDialogVisible = ref(false)
const installTargetNode = ref<any>(null)

// ── Install OpenResty / Edge (streaming) ──────────────────────────
const installStream = useInstallStream()
const { installing: installInstalling, error: installError, status: installStatus } = installStream

/** 消费侧过滤（batch1 3.1 / design D4）：结构化 SSE 事件（可 JSON.parse 且含 type 字段）
 *  不再以裸 JSON 行混入执行日志展示，业务分支（onProgress/onComplete）照常处理；
 *  useInstallStream 转发契约不动。 */
function appendStreamLine(line: string) {
  if (isStructuredSseEvent(line)) return
  execLogs.value = [...execLogs.value, line]
}

// batch3 1.1 / D1：命令构建收敛到 utils/nodeInstallCommand 共享纯函数（本视图原实现即基线形态），
// 调用点直引 buildNodeInstallCommand，不再保留本地包装。

function handleInstallOpenresty(record: any) {
  installTargetNode.value = record
  installDialogVisible.value = true
}

function closeInstallDialog() {
  installDialogVisible.value = false
}

function onInstallConfirm(payload: { node: any; clusterId: number; openrestyFile: string }) {
  installDialogVisible.value = false
  const record = payload.node
  execTargetNode.value = record
  execDrawerTitle.value = `安装 OpenResty - ${record.ip}`
  execDrawerMode.value = 'install'
  execDrawerVisible.value = true
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'

  const prefix = record.openresty_path
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(
    `/clusters/${record.cluster_id}/nodes/${record.id}/install-openresty`,
    { prefix, openresty_file: payload.openrestyFile },
    {
      onLine: (line: string) => {
        appendStreamLine(line)
      },
      onProgress: (percent: number) => {
        if (percent > execProgress.percent) execProgress.percent = percent
      },
      onComplete: (rc: number, _status: string) => {
        stopElapsedTimer()
        execProgress.status = rc === 0 ? 'success' : 'exception'
        execProgress.percent = 100
        const prevCmd = execResult.value?.command || ''
        execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
      },
      onError: (err: string) => {
        execLogs.value = [...execLogs.value, `❌ ${err}`]
      },
    },
  )
}

function handleInstallEdge(record: any) {
  showDangerConfirm(
    '\u786e\u8ba4\u5b89\u88c5 Edge',
    `\u5373\u5c06\u5728\u8282\u70b9 ${record.ip} \u4e0a\u5b89\u88c5 Edge\uff08${record.edge_path}\uff09\uff0c\u786e\u8ba4\u5f00\u59cb\uff1f`,
    '\u786e\u8ba4\u5b89\u88c5',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `\u5b89\u88c5 Edge - ${record.ip}`
      execDrawerMode.value = 'install'
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      const prefix = record.openresty_path || record.edge_path
      const pendingCommand = buildNodeInstallCommand(record, 'install_edge', { prefix })
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/install-edge`,
        { prefix },
        {
          onLine: (line: string) => {
            appendStreamLine(line)
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

function handleAssociateNewOpenresty(record: any) {
  const prefix = record.openresty_path || ''
  showDangerConfirm(
    '关联新 OpenResty',
    `即将把节点 ${record.ip} 的 Edge（${record.edge_path}）关联到新 OpenResty（${prefix}），确认开始？`,
    '确认关联',
    async () => {
      execTargetNode.value = record
      execDrawerTitle.value = `关联新 OpenResty - ${record.ip}`
      execDrawerMode.value = 'action'
      execDrawerVisible.value = true
      execLogs.value = []
      execProgress.percent = 0
      execProgress.status = 'active'
      execProgress.indeterminate = true
      const pendingCommand = `manager upgrade ${record.edge_path}`
      execResult.value = { stdout: '', stderr: '', command: pendingCommand, rc: null }
      startElapsedTimer()

      installStream.start(
        `/clusters/${record.cluster_id}/nodes/${record.id}/associate-new-openresty`,
        {},
        {
          onLine: (line: string) => {
            appendStreamLine(line)
          },
          onProgress: (percent: number) => {
            if (percent > execProgress.percent) execProgress.percent = percent
          },
          onComplete: (rc: number, _status: string) => {
            stopElapsedTimer()
            execProgress.status = rc === 0 ? 'success' : 'exception'
            execProgress.percent = 100
            execProgress.indeterminate = false
            const prevCmd = execResult.value?.command || ''
            execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
          },
          onError: (err: string) => {
            execLogs.value = [...execLogs.value, `\u274c ${err}`]
          },
        },
      )
    },
  )
}

const edgePackDialogVisible = ref(false)
const edgePackDialogNode = ref<any>(null)

function handleEdgePackManagement(record: any) {
  edgePackDialogNode.value = record
  edgePackDialogVisible.value = true
}

// batch3 1.2 / D2：取消安装收敛到共享工厂（确认机制 showDangerConfirm、失败提取 getApiErrorMessage）
const handleCancelInstall = createCancelNodeInstallHandler({
  execTargetNode,
  cancelling,
  execLogs,
  execProgress,
  execResult,
  installStream,
})

// ── Delete ──

function handleDelete(record: any) {
  // 删除流程统一（batch1 1.3 / 约定 #25 三层制）：节点专用确认变体 + 共享进度删除。
  // 固定语义 delete_db=true / delete_edge=false（D2：节点机上的进程不联动删除，
  // 后端 delete_edge skipped 语义保留）。
  showNodeDeleteConfirm({
    ip: record.ip,
    onOk: async (_deleteDb: boolean, _deleteEdge: boolean, _nodeIds: number[]) => {
      await executeDeleteWithProgress({
        title: `删除节点: ${record.ip}`,
        apiEndpoint: `/clusters/${record.cluster_id}/nodes/${record.id}`,
        cluster: { id: record.cluster_id },
        deleteDb: true,
        deleteEdge: false,
        nodeIds: [],
        refreshFn: refreshAfterWrite,
      })
    },
  })
}

// ── Diff ──

function handleDiff(record: any) {
  diffClusterId.value = record.cluster_id
  diffNodeId.value = record.id
  diffDrawerVisible.value = true
}

// ── Utils ──

// 运行态判定已收敛到 useClusterNodes.nginxState（batch2 1.1 / D1：三元、不假绿）

// ── Lifecycle ──

onMounted(() => {
  // 深链集群筛选仅页面形态；scoped（面板 Tab）集群由 props 决定
  if (!isScoped.value) {
    const clusterId = route.query.cluster_id as string | undefined
    const numeric = Number(clusterId)
    if (Number.isFinite(numeric)) clusterFilter.value = numeric
  }
  loadClusters()
  refreshList()

  window.addEventListener('edge-pack-add', onEdgePackAdd)
  window.addEventListener('edge-pack-rebase', onEdgePackRebase)
})

onUnmounted(() => {
  cancelSearch()
  // 离开页面时停掉执行耗时定时器（范式：RelayGateways.vue），避免后台残留
  stopElapsedTimer()
  window.removeEventListener('edge-pack-add', onEdgePackAdd)
  window.removeEventListener('edge-pack-rebase', onEdgePackRebase)
})

function streamEdgeAction(record: any, title: string, url: string, body: Record<string, any>) {
  execTargetNode.value = record
  execDrawerTitle.value = title
  execDrawerMode.value = 'action'
  execDrawerVisible.value = true
  execLogs.value = []
  execProgress.percent = 0
  execProgress.status = 'active'
  execProgress.indeterminate = true
  execResult.value = { stdout: '', stderr: '', command: '', rc: null }
  startElapsedTimer()

  installStream.start(url, body, {
    onLine: (line: string) => {
      appendStreamLine(line)
    },
    onProgress: (percent: number) => {
      if (percent > execProgress.percent) execProgress.percent = percent
    },
    onComplete: (rc: number, _status: string) => {
      stopElapsedTimer()
      execProgress.status = rc === 0 ? 'success' : 'exception'
      execProgress.percent = 100
      execProgress.indeterminate = false
      const prevCmd = execResult.value?.command || ''
      execResult.value = { stdout: execLogs.value.join('\n'), stderr: '', command: prevCmd, rc }
    },
    onError: (err: string) => {
      execLogs.value = [...execLogs.value, `\u274c ${err}`]
      stopElapsedTimer()
      execProgress.percent = 100
      execProgress.status = 'exception'
      execProgress.indeterminate = false
    },
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

// 视图模式供测试/调试显式钉位（contract 10.2：组件测试用 vm.viewMode='flat' 钉平铺场景）
defineExpose({ viewMode })
</script>

<style scoped>
/* scoped 形态（统一管理最大化面板「集群节点」Tab）：外层沿用页面卡片类，
   保证 `.table-container.l5-card .c-idx` / 行内动作钮等全站解剖规则命中，
   只压掉卡片自身的边框/底色/内距/圆角，使其融入面板 .dbody（不出现卡中卡）。 */
.scope-card {
  border: none;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
  overflow: visible;
}

/* 批量条解剖移交共享 .l5-batchbar（mockup-parity-standard）；页面仅保留批量导入弹窗自有样式 */
/* 工具条（list-pages-console-restyle）：结构移交共享 TableToolbar（.l5-toolbar 单点），
   本类仅承载卡内贴合与源码守卫依赖的换行语义（NodeList.source.test.ts 断言 flex-wrap: wrap） */
.node-filter-bar {
  flex-wrap: wrap;
}

/* 安装路径合并列的值省略（contract 10.1：完整值悬浮可见，title 已挂） */
.path-line .path-v {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  /* 设计 .path-line .c-mono.c-dim：路径值为次要信息（muted），非正文黑（r5-④-4.2） */
  color: var(--muted);
}

.text-mono {
  font-family: var(--font-mono);
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
}

.node-actions-wrap {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: nowrap;
}

.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-wide {
  max-width: 700px;
}

.form-row {
  display: flex;
  gap: 16px;
}
.form-group {
  flex: 1;
  margin-bottom: 16px;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}
.required {
  color: var(--danger);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

/* 详情弹窗内同构状态格（弹窗在 .l5-card 作用域之外——仅补布局，类名与 L5 一致） */
.node-detail-grid .status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.node-detail-grid .s-row {
  display: inline-flex;
  gap: 4px;
}
.node-detail-grid .exec-time {
  font-size: 11px;
  color: var(--muted);
}

/* Detail */
.node-detail-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 6px 16px;
  font-size: 13px;
  margin-bottom: 16px;
}
.node-detail-grid .nd-label {
  color: var(--muted);
  font-weight: 500;
}
.node-detail-grid .nd-value {
  font-family: var(--font-mono);
  word-break: break-all;
}
.node-stats {
  margin-bottom: 8px;
}
.node-stats-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.node-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.node-stat-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
  text-align: center;
}
.node-stat-card .ns-value {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 700;
}
.node-stat-card .ns-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}
/* 列个性化表头手势/竖线样式已上移全局 .grid-table（column-personalization-rollout D5），本页仅保留页面自有样式 */
</style>
