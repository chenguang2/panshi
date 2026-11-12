<template>
  <div class="node-task-list">
    <PageHeader title="节点任务" description="跨集群查看和管理节点运维任务（安装/升级/启动/停止等），支持取消与重试">
      <template #actions>
        <!-- 页头只保留唯一主 CTA；低频文件维护入口降级到筛选条行尾（D11） -->
        <button class="btn btn-primary" data-test="create-task-entry" @click="openCreateModal">＋ 新建任务</button>
      </template>
    </PageHeader>

    <!-- 筛选条与表格同属一张卡片：筛选在上、表格在下，控件不再浮在页面空白里 -->
    <div class="table-container node-task-panel">
      <div class="node-filter-bar">
        <SearchInput
          v-model="filterKeyword"
          :width="240"
          data-test="task-search"
          placeholder="搜索任务号 / 节点 IP / 命令"
          @search="applyFilters"
        />
        <select
          v-model="filterGroup"
          class="form-input"
          data-test="filter-group"
          style="width: 130px"
          @change="onFilterGroupChange"
        >
          <option value="__all__">全部分组</option>
          <option v-for="g in filterGroupOptions" :key="g" :value="g">{{ g }}</option>
          <option value="__ung__">未分组</option>
        </select>
        <ClusterSelect
          v-model="filterClusterId"
          :clusters="filterClusters"
          allow-all
          style="width: 150px"
          data-test="filter-cluster"
          @change="onFilterChange"
        />
        <select
          v-model="filterStatus"
          class="form-input"
          data-test="filter-status"
          style="width: 130px"
          @change="onFilterChange"
        >
          <option value="">全部状态</option>
          <option value="pending">待执行</option>
          <option value="running">执行中</option>
          <option value="success">成功</option>
          <option value="partial">部分成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="skipped">跳过</option>
        </select>
        <select
          v-model="filterType"
          class="form-input"
          data-test="filter-type"
          style="width: 170px"
          @change="onFilterChange"
        >
          <option value="">全部类型</option>
          <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <select
          v-model="filterRange"
          class="form-input"
          data-test="filter-range"
          style="width: 130px"
          @change="onFilterChange"
        >
          <option value="">全部时间</option>
          <option value="24h">近 24 小时</option>
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
        </select>
        <div class="nt-bar-tail">
          <button
            type="button"
            class="link-action nt-file-entry"
            data-test="staged-files-entry"
            @click="openPendingFilesModal"
          >
            暂存文件
            <span class="nt-file-count">{{ uploadedFiles.length }}</span>
          </button>
          <button
            type="button"
            class="link-action nt-file-entry"
            data-test="task-files-entry"
            @click="openTaskFilesModal"
          >
            任务源文件
            <span class="nt-file-count">{{ taskFiles.length }}</span>
          </button>
          <span class="nt-bar-sep" aria-hidden="true"></span>
          <button class="btn btn-secondary nt-refresh" @click="loadTasks(1)">刷新</button>
        </div>
      </div>

      <!-- 批量工具条：只在有勾选时出现，与表格同卡片 -->
      <div v-if="selectedRowKeys.length > 0" class="nt-batch-bar">
        <span class="nt-batch-count">
          已选 <strong>{{ selectedRowKeys.length }}</strong> 项
        </span>
        <div class="nt-batch-actions">
          <button class="btn btn-danger" @click="handleBatchDelete">批量删除</button>
          <button class="btn btn-secondary" @click="clearSelection">取消选择</button>
        </div>
      </div>

      <a-table
        :data-source="tasks"
        :columns="columns"
        :loading="loading"
        row-key="id"
        :row-selection="rowSelection"
        :pagination="paginationProps({ page, pageSize, total }, '条')"
        size="middle"
        class="node-task-table"
        :custom-row="rowProps"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="nt-index">{{ (page - 1) * pageSize + index + 1 }}</span>
          </template>
          <template v-else-if="column.key === 'task_type'">
            <span class="nt-task-type" :title="taskTooltip(record)">{{ typeLabel(record.task_type) }}</span>
          </template>
          <template v-else-if="column.key === 'cluster'">
            <span class="nt-cluster" :title="clusterTooltip(record)">{{ record.cluster_name || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'result'">
            <div class="result-cell">
              <div class="result-head">
                <TaskStatusTag :status="record.status" :cancel-requested="record.cancel_requested === true" />
                <span class="result-counts">{{ resultCountText(record) }}</span>
              </div>
              <TaskProgressBar
                class="result-bar"
                :success="record.success_nodes"
                :failed="record.failed_nodes"
                :skipped="record.skipped_nodes"
                :cancelled="record.cancelled_nodes"
                :total="record.total_nodes"
                :running="record.status === 'running'"
                :show-text="false"
              />
              <div v-if="record.failure_summary" class="result-cause" :title="record.failure_summary">
                {{ record.failure_summary }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'time'">
            <div class="time-cell" :title="timeTooltip(record)">
              <span v-if="isLiveTaskRow(record)" class="time-live">进行中 · 已用时 {{ elapsedText(record) }}</span>
              <template v-else>
                <span class="time-main">{{ formatTime(record.finished_at) }}</span>
                <span class="time-duration">{{ durationText(record) }}</span>
              </template>
            </div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="action-cell">
              <!-- 文字链而非 a-button：全局 .ant-btn 主题会把任何非 primary 按钮画成白底描边，
                   两个等价白底按钮并排正是本轮要消灭的形态 -->
              <button type="button" class="link-action" @click="openDetail(record)">详情</button>
              <a-dropdown :trigger="['click']">
                <button type="button" class="action-trigger-btn" aria-label="更多操作">⋯</button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-if="record.status === 'running' || record.status === 'pending'"
                      @click="handleCancel(record)"
                    >
                      <div class="menu-item-stack">
                        <span>取消</span>
                        <small>终止进程链：已开始节点记已取消，未开始记跳过</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item
                      v-if="['failed', 'partial', 'cancelled'].includes(record.status)"
                      @click="handleRetry(record)"
                    >
                      <div class="menu-item-stack">
                        <span>重试</span>
                        <small>只重跑失败节点；上次日志归档保留</small>
                      </div>
                    </a-menu-item>
                    <a-menu-item
                      v-if="['success', 'failed', 'partial', 'cancelled'].includes(record.status)"
                      danger
                      @click="handleDelete(record)"
                    >
                      <div class="menu-item-stack">
                        <span>删除</span>
                        <small>删任务记录与日志，不影响节点已执行结果</small>
                      </div>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </template>

        <!-- 空态槽名是 #emptyText（不是 #empty）：写错时单测桩会绿、生产却永不渲染 -->
        <template #emptyText>
          <div class="nt-empty">
            <div class="nt-empty-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 9l3 3-3 3" />
                <path d="M13 15h4" />
              </svg>
            </div>
            <template v-if="hasActiveFilters">
              <div class="nt-empty-title">没有符合条件的任务</div>
              <div class="nt-empty-desc">当前筛选条件下没有任务。放宽条件，或清空筛选查看全部任务。</div>
              <button class="btn btn-secondary" @click="clearFilters">清空筛选</button>
            </template>
            <template v-else>
              <div class="nt-empty-title">还没有节点任务</div>
              <div class="nt-empty-desc">在集群节点上执行安装、启动、命令等运维操作后，任务会记录在这里。</div>
              <button class="btn btn-primary" @click="openCreateModal">新建任务</button>
            </template>
          </div>
        </template>
      </a-table>
    </div>

    <!-- Create task modal -->
    <Teleport to="body">
      <!-- 暂存文件（全局入口）：仅管理 temp/ 暂存文件 -->
      <div
        class="modal-overlay"
        :style="{
          display: pendingFilesModalVisible ? 'flex' : 'none',
          zIndex: pendingFilesSelectMode ? 1100 : undefined,
        }"
      >
        <div class="modal modal-wide" style="max-width: 680px">
          <div class="modal-header">
            <h2>{{ pendingFilesSelectMode ? '选择暂存文件' : '暂存文件' }}</h2>
            <button class="modal-close" @click="pendingFilesModalVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto">
            <div style="color: var(--muted, #999); font-size: 12px; margin-bottom: 10px">
              上传后尚未用于任务的临时文件。创建任务时会自动迁入该任务目录并从此处消失。
            </div>
            <div
              v-if="pendingFilesFiltered.length === 0"
              style="font-size: 13px; color: var(--muted, #999); padding: 4px 0"
            >
              <template v-if="pendingFilesSelectMode && createTaskType === 'cmd_exec'">
                暂无脚本类暂存文件，请先通过「选择脚本文件」上传 .sh 文件
              </template>
              <template v-else-if="pendingFilesSelectMode && createTaskType === 'distribute_file'">
                暂无分发类暂存文件，请先通过「选择文件」上传需要分发的文件
              </template>
              <template v-else>暂无暂存文件</template>
            </div>
            <div
              v-for="item in pendingFilesPageItems"
              :key="item.upload_id"
              style="
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 0;
                font-size: 13px;
                border-bottom: 1px dashed var(--border, #f0f0f0);
              "
            >
              <span
                style="
                  flex: none;
                  padding: 1px 8px;
                  border-radius: 4px;
                  font-size: 11px;
                  line-height: 20px;
                  background: var(--bg-secondary, #f5f5f5);
                  color: var(--muted, #888);
                "
                >{{ item.kind === 'script' ? '脚本' : '分发' }}</span
              >
              <span
                style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                :title="item.filename"
              >
                {{ item.filename }}
              </span>
              <span style="flex: none; color: var(--muted, #999)">{{ formatFileSize(item.size) }}</span>
              <span style="flex: none; color: var(--muted, #999)">{{ formatDateTime(item.uploaded_at) }}</span>
              <span
                v-if="pendingFilesSelectMode && isFileSelected(item)"
                style="
                  flex: none;
                  padding: 1px 8px;
                  border-radius: 4px;
                  font-size: 11px;
                  line-height: 20px;
                  background: var(--accent-soft, #e8f4fd);
                  color: var(--accent, #1677ff);
                  font-weight: 500;
                "
                >已选用</span
              >
              <a
                v-if="pendingFilesSelectMode"
                style="flex: none; color: var(--primary, #0099ff); cursor: pointer; font-weight: 500"
                @click="selectPendingFile(item)"
                >{{ isFileSelected(item) ? '切换' : '选用' }}</a
              >
              <a
                v-else
                style="flex: none; color: var(--danger, #e5484d); cursor: pointer"
                @click="removeUploadedFile(item)"
                >删除</a
              >
            </div>
            <div
              v-if="uploadedFiles.length > FILE_PAGE_SIZE"
              style="
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                font-size: 12px;
                color: var(--muted, #888);
              "
            >
              <button
                class="btn btn-secondary btn-sm"
                :disabled="pendingFilesPage <= 1"
                style="padding: 2px 10px"
                @click="setPendingFilesPage(pendingFilesPage - 1)"
              >
                上一页
              </button>
              <span>第 {{ pendingFilesPage }} / {{ pendingFilesTotalPages }} 页</span>
              <button
                class="btn btn-secondary btn-sm"
                :disabled="pendingFilesPage >= pendingFilesTotalPages"
                style="padding: 2px 10px"
                @click="setPendingFilesPage(pendingFilesPage + 1)"
              >
                下一页
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="pendingFilesSelectMode" class="btn btn-primary" @click="pendingFilesModalVisible = false">
              确定
            </button>
            <button class="btn btn-secondary" @click="pendingFilesModalVisible = false">关闭</button>
          </div>
        </div>
      </div>

      <!-- 任务源文件（全局入口）：各任务迁入任务目录的控制端源文件副本 -->
      <div class="modal-overlay" :style="{ display: taskFilesModalVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width: 680px">
          <div class="modal-header">
            <h2>任务源文件</h2>
            <button class="modal-close" @click="taskFilesModalVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto">
            <div style="color: var(--muted, #999); font-size: 12px; margin-bottom: 10px">
              各任务创建时迁入任务目录的源文件副本。删除只移除控制端副本，不影响已分发到节点的文件，也不删除任务本身。
            </div>
            <div v-if="taskFiles.length === 0" style="font-size: 13px; color: var(--muted, #999); padding: 4px 0">
              暂无任务源文件
            </div>
            <div
              v-for="item in taskFilesPageItems"
              :key="`${item.task_id}-${item.name}`"
              style="
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 0;
                font-size: 13px;
                border-bottom: 1px dashed var(--border, #f0f0f0);
              "
            >
              <span
                style="
                  flex: none;
                  padding: 1px 8px;
                  border-radius: 4px;
                  font-size: 11px;
                  line-height: 20px;
                  background: var(--bg-secondary, #f5f5f5);
                  color: var(--muted, #888);
                "
                >任务 #{{ item.task_id }} · {{ taskTypeLabel(item.task_type) }}</span
              >
              <span
                style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                :title="item.filename"
              >
                {{ item.filename }}
              </span>
              <span style="flex: none; color: var(--muted, #999)">{{ formatFileSize(item.size) }}</span>
              <span v-if="item.created_at" style="flex: none; color: var(--muted, #999)">{{
                formatDateTime(item.created_at)
              }}</span>
              <a style="flex: none; color: var(--danger, #e5484d); cursor: pointer" @click="removeTaskFile(item)"
                >删除</a
              >
            </div>
            <div
              v-if="taskFiles.length > FILE_PAGE_SIZE"
              style="
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                font-size: 12px;
                color: var(--muted, #888);
              "
            >
              <button
                class="btn btn-secondary btn-sm"
                :disabled="taskFilesPage <= 1"
                style="padding: 2px 10px"
                @click="setTaskFilesPage(taskFilesPage - 1)"
              >
                上一页
              </button>
              <span>第 {{ taskFilesPage }} / {{ taskFilesTotalPages }} 页</span>
              <button
                class="btn btn-secondary btn-sm"
                :disabled="taskFilesPage >= taskFilesTotalPages"
                style="padding: 2px 10px"
                @click="setTaskFilesPage(taskFilesPage + 1)"
              >
                下一页
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="taskFilesModalVisible = false">关闭</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" :style="{ display: createVisible ? 'flex' : 'none' }">
        <div class="modal modal-wide" style="max-width: 640px">
          <div class="modal-header">
            <h2>创建节点任务</h2>
            <button class="modal-close" @click="createVisible = false">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 80vh; overflow-y: auto">
            <div class="ntc-field">
              <label class="ntc-label" for="ntc-cluster">集群 <span class="ntc-req">*</span></label>
              <ClusterSelect
                id="ntc-cluster"
                :model-value="createClusterId || ''"
                :clusters="clusters"
                :class="{ 'is-error': showCreateError('cluster') }"
                data-test="create-cluster"
                @update:model-value="onCreateClusterFieldChange"
                @change="onCreateClusterChange"
                @blur="touchCreateField('cluster')"
              />
              <p v-if="showCreateError('cluster')" class="ntc-error">{{ showCreateError('cluster') }}</p>
            </div>
            <div class="ntc-field">
              <div class="ntc-label-row">
                <label class="ntc-label">节点 <span class="ntc-req">*</span></label>
                <span v-if="createClusterId" class="ntc-count"
                  >已选 {{ createNodeIds.length }} 个（共 {{ createNodes.length }}）</span
                >
              </div>
              <!-- 未选集群：虚线空态区，不要伪装成禁用输入框 -->
              <div v-if="!createClusterId" class="ntc-node-empty" data-test="node-empty">选择集群后加载节点列表</div>
              <template v-else>
                <SearchInput
                  v-model="nodeSearch"
                  width="100%"
                  class="ntc-node-search"
                  data-test="node-search"
                  placeholder="搜索节点 IP / 名称"
                />
                <div class="ntc-node-list">
                  <label
                    v-for="n in filteredCreateNodes"
                    :key="n.id"
                    class="ntc-node"
                    :class="{ 'is-offline': isNodeOffline(n) }"
                  >
                    <input
                      type="checkbox"
                      :value="n.id"
                      v-model="createNodeIds"
                      :disabled="isNodeOffline(n)"
                      :data-test="`node-check-${n.id}`"
                    />
                    <span class="ntc-node-ip">{{ n.ip }}</span>
                    <span v-if="n.edge_path" class="ntc-node-path">({{ n.edge_path }})</span>
                    <span v-if="isNodeOffline(n)" class="ntc-offline-tag">离线</span>
                  </label>
                  <div v-if="filteredCreateNodes.length === 0" class="ntc-node-none">
                    {{ createNodes.length === 0 ? '该集群暂无节点' : '没有匹配的节点' }}
                  </div>
                </div>
                <div class="ntc-node-actions">
                  <a @click="selectAllCreateNodes">全选</a>
                  <a @click="clearAllCreateNodes">取消全选</a>
                  <span class="ntc-node-hint">离线节点不可选</span>
                </div>
              </template>
              <p v-if="showCreateError('nodes')" class="ntc-error">{{ showCreateError('nodes') }}</p>
            </div>
            <div class="ntc-field">
              <label class="ntc-label" for="ntc-task-type">任务类型 <span class="ntc-req">*</span></label>
              <select
                id="ntc-task-type"
                v-model="createTaskType"
                class="form-input"
                :class="{ 'is-error': showCreateError('taskType') }"
                data-test="task-type"
                @change="onCreateTaskTypeChange"
                @blur="touchCreateField('taskType')"
              >
                <option value="" disabled>请选择操作类型</option>
                <option v-for="t in taskTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <p v-if="showCreateError('taskType')" class="ntc-error">{{ showCreateError('taskType') }}</p>
              <!-- 无专属字段的类型：帮助文案紧跟任务类型 -->
              <p v-if="isSimpleTaskType && helpText" class="ntc-help">{{ helpText }}</p>
            </div>
            <div v-if="createTaskType === 'install_openresty'" style="margin-bottom: 12px">
              <label class="ntc-label">安装包 <span class="ntc-req">*</span></label>
              <select
                v-model="createOpenrestyFile"
                data-test="openresty-file"
                style="width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
              >
                <option value="" disabled>请选择 OpenResty 安装包</option>
                <option v-for="f in openrestyFiles" :key="f.name" :value="f.name">
                  {{ f.name }} <template v-if="f.size_display">({{ f.size_display }})</template>
                </option>
              </select>
              <p v-if="showCreateError('file')" class="ntc-error">{{ showCreateError('file') }}</p>
              <p class="ntc-help">{{ helpText }}</p>
            </div>
            <div v-if="createTaskType === 'edge_pack_add'" style="margin-bottom: 12px">
              <label class="ntc-label">Edge 版本包 <span class="ntc-req">*</span></label>
              <select
                v-model="selectedPackFile"
                data-test="edge-pack-file"
                style="width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
              >
                <option value="" disabled>请选择 Edge 版本包</option>
                <option v-for="f in edgePackFiles" :key="f.name" :value="f.name">
                  {{ f.name }} <template v-if="f.size_display">({{ f.size_display }})</template>
                </option>
              </select>
              <p v-if="showCreateError('file')" class="ntc-error">{{ showCreateError('file') }}</p>
              <p class="ntc-help">{{ helpText }}</p>
            </div>
            <div v-if="createTaskType === 'edge_pack_rebase'" style="margin-bottom: 12px">
              <label class="ntc-label">目标版本{{ edgePackRouteText }} <span class="ntc-req">*</span></label>
              <select
                v-model="selectedPackVersion"
                data-test="edge-pack-version"
                style="width: 100%; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
              >
                <option value="" disabled>请选择目标版本</option>
                <option v-for="v in edgePackVersions" :key="v.name" :value="v.name" :disabled="v.current">
                  {{ v.name }} <template v-if="v.current">(当前)</template>
                </option>
              </select>
              <p v-if="showCreateError('file')" class="ntc-error">{{ showCreateError('file') }}</p>
              <p class="ntc-help">{{ helpText }}</p>
            </div>
            <div v-if="createTaskType === 'software_check'" style="margin-bottom: 12px">
              <label class="ntc-label">软件列表 <span class="ntc-req">*</span></label>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px">
                <label
                  v-for="s in softwareOptions"
                  :key="s.value"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    padding: 3px 8px;
                    border: 1px solid var(--border, #e5e5e5);
                    border-radius: 12px;
                    cursor: pointer;
                  "
                  :class="{ 'soft-opt-selected': softwareSelected.includes(s.value) }"
                >
                  <input
                    type="checkbox"
                    :value="s.value"
                    v-model="softwareSelected"
                    style="accent-color: var(--accent, #4096ff)"
                  />
                  <span>{{ s.label }}</span>
                </label>
              </div>
              <div style="display: flex; gap: 6px">
                <input
                  v-model="customSoftwareInput"
                  data-test="custom-software"
                  type="text"
                  placeholder="输入软件名（如 telnet）"
                  style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
                  @keydown.enter.prevent="addCustomSoftware"
                />
                <button class="btn btn-secondary btn-sm" @click="addCustomSoftware">添加</button>
              </div>
              <div v-if="customSoftwareList.length" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px">
                <span
                  v-for="s in customSoftwareList"
                  :key="s"
                  style="
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    padding: 3px 8px;
                    border: 1px solid var(--border, #e5e5e5);
                    border-radius: 12px;
                    background: var(--bg, #f8f8f8);
                  "
                >
                  {{ s }}
                  <a style="color: var(--danger, #e5484d); cursor: pointer" @click="removeCustomSoftware(s)">×</a>
                </span>
              </div>
              <p v-if="showCreateError('file')" class="ntc-error">{{ showCreateError('file') }}</p>
              <p class="ntc-help">{{ helpText }}</p>
            </div>
            <div v-if="createTaskType === 'cmd_exec'" style="margin-bottom: 12px">
              <!-- 分段选择：选中态用浅底 + 主色文字 + 细边，不抢主按钮的实心主色 -->
              <div class="ntc-seg">
                <button
                  type="button"
                  class="ntc-seg-btn"
                  :class="{ 'is-active': cmdExecMode === 'command' }"
                  data-test="cmd-mode-command"
                  @click="cmdExecMode = 'command'"
                >
                  命令
                </button>
                <button
                  type="button"
                  class="ntc-seg-btn"
                  :class="{ 'is-active': cmdExecMode === 'script' }"
                  data-test="cmd-mode-script"
                  @click="cmdExecMode = 'script'"
                >
                  脚本
                </button>
              </div>
              <template v-if="cmdExecMode === 'command'">
                <label class="ntc-label">命令 <span class="ntc-req">*</span></label>
                <div class="ntc-input-with-action">
                  <input
                    v-model="cmdCommand"
                    class="form-input"
                    :class="{ 'is-error': showCreateError('content') }"
                    data-test="cmd-command"
                    type="text"
                    placeholder="如: ls -la /etc"
                    @blur="touchCreateField('content')"
                  />
                  <button type="button" class="btn btn-secondary btn-sm" data-test="cmd-copy" @click="copyCommand">
                    复制命令
                  </button>
                </div>
                <p v-if="showCreateError('content')" class="ntc-error">{{ showCreateError('content') }}</p>
                <p class="ntc-help">{{ helpText }}</p>
                <div class="ntc-group">
                  <div class="ntc-group-label">执行策略</div>
                  <div class="ntc-group-desc">
                    黑名单：拦截危险命令；白名单：只允许预置与本任务添加的命令；不限制：不做校验
                  </div>
                  <div class="ntc-radios">
                    <label v-for="s in cmdSecurityOptions" :key="s.value" class="ntc-radio">
                      <input type="radio" :value="s.value" v-model="cmdSecurity" />
                      <span>{{ s.label }}</span>
                    </label>
                  </div>
                </div>
                <div v-if="cmdSecurity === 'whitelist'" style="margin-top: 10px">
                  <div style="font-size: 13px; color: var(--muted, #888); margin-bottom: 6px">
                    白名单命令（内置只读命令 + 本次任务添加）
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px">
                    <span
                      v-for="c in cmdBuiltinWhitelist"
                      :key="c"
                      style="
                        font-size: 12px;
                        padding: 3px 8px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 12px;
                      "
                      >{{ c }}</span
                    >
                  </div>
                  <div
                    v-if="cmdCustomWhitelist.length"
                    style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px"
                  >
                    <span
                      v-for="c in cmdCustomWhitelist"
                      :key="c"
                      style="
                        font-size: 12px;
                        padding: 3px 8px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 12px;
                        background: var(--bg, #f8f8f8);
                      "
                    >
                      {{ c }}
                      <a style="color: var(--danger, #e5484d); cursor: pointer" @click="removeCmdWhitelist(c)">×</a>
                    </span>
                  </div>
                  <div style="display: flex; gap: 6px">
                    <input
                      v-model="cmdWhitelistInput"
                      data-test="cmd-whitelist-add"
                      type="text"
                      placeholder="输入命令名（如 mytool）"
                      style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
                      @keydown.enter.prevent="addCmdWhitelist"
                    />
                    <button class="btn btn-secondary btn-sm" @click="addCmdWhitelist">添加</button>
                  </div>
                </div>
                <label class="ntc-label ntc-label-inline">超时</label>
                <div class="ntc-inline-field">
                  <input
                    v-model.number="cmdTimeout"
                    class="form-input ntc-number"
                    data-test="cmd-timeout"
                    type="number"
                    min="1"
                    max="600"
                  />
                  <span class="ntc-unit">秒</span>
                </div>
              </template>
              <template v-else>
                <div style="margin-bottom: 8px">
                  <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center">
                    <button class="btn btn-secondary btn-sm" @click="triggerScriptUpload">选择脚本文件</button>
                    <a
                      style="font-size: 12px; color: var(--primary, #0099ff); cursor: pointer"
                      @click="openPendingFilesSelect"
                      >从暂存文件中选择</a
                    >
                    <span v-if="scriptFile" style="font-size: 12px; color: var(--muted, #888); line-height: 28px">
                      {{ scriptFile.name }} ({{ formatFileSize(scriptFile.size) }})
                      <a
                        style="color: var(--danger, #e5484d); margin-left: 4px; cursor: pointer"
                        @click="clearScriptFile"
                        >×</a
                      >
                    </span>
                  </div>
                  <div
                    v-if="!scriptFile"
                    :class="{ 'upload-dragover': scriptDragOver }"
                    :style="
                      scriptDragOver
                        ? { borderColor: 'var(--accent,#4096ff)', background: 'var(--bg-secondary,#f5f5f5)' }
                        : undefined
                    "
                    style="
                      border: 2px dashed var(--border, #e5e5e5);
                      border-radius: 8px;
                      padding: 24px;
                      text-align: center;
                      color: var(--muted, #999);
                      font-size: 13px;
                      cursor: pointer;
                      transition: border-color 0.2s;
                    "
                    @click="triggerScriptUpload"
                    @dragover.prevent="scriptDragOver = true"
                    @dragleave="scriptDragOver = false"
                    @drop.prevent="onScriptDrop"
                  >
                    <div style="margin-bottom: 4px">点击或拖拽脚本文件到此处</div>
                    <div style="font-size: 11px">支持 .sh, .bash 文件，最大 512KB</div>
                  </div>
                  <div v-if="scriptFile" style="margin-top: 8px">
                    <button class="btn btn-secondary btn-sm" @click="previewUploadedScript">预览内容</button>
                  </div>
                </div>
                <div
                  v-if="scriptFile"
                  style="margin-top: 8px; border: 1px solid var(--border, #e5e5e5); border-radius: 6px"
                >
                  <div
                    style="
                      padding: 6px 8px;
                      background: var(--bg-secondary, #f5f5f5);
                      font-size: 11px;
                      color: var(--muted, #888);
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    "
                  >
                    <span>脚本内容（可编辑）</span>
                    <div style="display: flex; gap: 8px; align-items: center">
                      <a style="cursor: pointer; font-size: 12px" @click="convertScriptToCommand">转换为命令</a>
                      <a style="cursor: pointer" @click="scriptPreviewContent = null">关闭</a>
                    </div>
                  </div>
                  <textarea
                    v-model="scriptPreviewContent"
                    data-test="script-editor"
                    spellcheck="false"
                    style="
                      width: 100%;
                      min-height: 180px;
                      max-height: 400px;
                      resize: vertical;
                      padding: 8px;
                      font-size: 12px;
                      line-height: 1.5;
                      font-family: monospace;
                      border: none;
                      outline: none;
                      background: transparent;
                      box-sizing: border-box;
                    "
                  ></textarea>
                </div>
                <div class="ntc-group">
                  <div class="ntc-group-label">执行策略</div>
                  <div class="ntc-group-desc">
                    黑名单：拦截危险命令；白名单：只允许预置与本任务添加的命令；不限制：不做校验
                  </div>
                  <div class="ntc-radios">
                    <label v-for="s in cmdSecurityOptions" :key="s.value" class="ntc-radio">
                      <input type="radio" :value="s.value" v-model="cmdSecurity" />
                      <span>{{ s.label }}</span>
                    </label>
                  </div>
                </div>
                <div v-if="cmdSecurity === 'whitelist'" style="margin-top: 10px">
                  <div style="font-size: 13px; color: var(--muted, #888); margin-bottom: 6px">
                    白名单命令（内置只读命令 + 本次任务添加）
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px">
                    <span
                      v-for="c in cmdBuiltinWhitelist"
                      :key="c"
                      style="
                        font-size: 12px;
                        padding: 3px 8px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 12px;
                      "
                      >{{ c }}</span
                    >
                  </div>
                  <div
                    v-if="cmdCustomWhitelist.length"
                    style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px"
                  >
                    <span
                      v-for="c in cmdCustomWhitelist"
                      :key="c"
                      style="
                        font-size: 12px;
                        padding: 3px 8px;
                        border: 1px solid var(--border, #e5e5e5);
                        border-radius: 12px;
                        background: var(--bg, #f8f8f8);
                      "
                    >
                      {{ c }}
                      <a style="color: var(--danger, #e5484d); cursor: pointer" @click="removeCmdWhitelist(c)">×</a>
                    </span>
                  </div>
                  <div style="display: flex; gap: 6px">
                    <input
                      v-model="cmdWhitelistInput"
                      data-test="cmd-whitelist-add"
                      type="text"
                      placeholder="输入命令名（如 mytool）"
                      style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border, #e5e5e5)"
                      @keydown.enter.prevent="addCmdWhitelist"
                    />
                    <button class="btn btn-secondary btn-sm" @click="addCmdWhitelist">添加</button>
                  </div>
                </div>
                <label class="ntc-label ntc-label-inline">超时</label>
                <div class="ntc-inline-field">
                  <input
                    v-model.number="cmdTimeout"
                    class="form-input ntc-number"
                    data-test="cmd-timeout"
                    type="number"
                    min="1"
                    max="600"
                  />
                  <span class="ntc-unit">秒</span>
                </div>
                <p v-if="scriptUploadError" class="ntc-error">{{ scriptUploadError }}</p>
                <p v-if="showCreateError('content')" class="ntc-error">{{ showCreateError('content') }}</p>
                <p class="ntc-help">{{ helpText }}</p>
              </template>
            </div>
            <!-- 分发文件表单 -->
            <div v-if="createTaskType === 'distribute_file'" style="margin-bottom: 12px">
              <label class="ntc-label">选择文件 <span class="ntc-req">*</span></label>
              <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center">
                <button class="btn btn-secondary btn-sm" @click="triggerDistributeUpload">选择文件</button>
                <a
                  style="font-size: 12px; color: var(--primary, #0099ff); cursor: pointer"
                  @click="openPendingFilesSelect"
                  >从暂存文件中选择</a
                >
                <span v-if="distributeFile" style="font-size: 12px; color: var(--muted, #888); line-height: 28px">
                  {{ distributeFile.name }} ({{ formatFileSize(distributeFile.size) }})
                  <a
                    style="color: var(--danger, #e5484d); margin-left: 4px; cursor: pointer"
                    @click="clearDistributeFile"
                    >×</a
                  >
                </span>
              </div>
              <div
                v-if="!distributeFile"
                :class="{ 'upload-dragover': distributeDragOver }"
                :style="
                  distributeDragOver
                    ? { borderColor: 'var(--accent,#4096ff)', background: 'var(--bg-secondary,#f5f5f5)' }
                    : undefined
                "
                style="
                  border: 2px dashed var(--border, #e5e5e5);
                  border-radius: 8px;
                  padding: 24px;
                  text-align: center;
                  color: var(--muted, #999);
                  font-size: 13px;
                  cursor: pointer;
                  transition: border-color 0.2s;
                "
                @click="triggerDistributeUpload"
                @dragover.prevent="distributeDragOver = true"
                @dragleave="distributeDragOver = false"
                @drop.prevent="onDistributeDrop"
              >
                <div style="margin-bottom: 4px">点击或拖拽文件到此处</div>
                <div style="font-size: 11px">支持任意文件类型，最大 10MB</div>
              </div>
              <p v-if="distributeUploadError" class="ntc-error">{{ distributeUploadError }}</p>
              <p v-if="showCreateError('file')" class="ntc-error">{{ showCreateError('file') }}</p>
              <label class="ntc-label ntc-label-inline">目标目录路径 <span class="ntc-req">*</span></label>
              <input
                v-model="distributeDestpath"
                class="form-input"
                :class="{ 'is-error': showCreateError('destpath') }"
                type="text"
                data-test="distribute-destpath"
                placeholder="例如: /etc/nginx/conf.d/"
                @blur="touchCreateField('destpath')"
              />
              <p v-if="showCreateError('destpath')" class="ntc-error">{{ showCreateError('destpath') }}</p>
              <p class="ntc-help">{{ helpText }}</p>
              <label class="ntc-label ntc-label-inline">超时时间</label>
              <select v-model.number="distributeTimeout" class="form-input ntc-number" data-test="distribute-timeout">
                <option :value="60">60 秒</option>
                <option :value="300">5 分钟</option>
                <option :value="600">10 分钟（默认）</option>
                <option :value="1800">30 分钟</option>
                <option :value="3600">1 小时</option>
              </select>
            </div>
          </div>
          <div class="modal-footer ntc-footer">
            <!-- 禁用时说明「还差什么」，而不是只有一个灰按钮 -->
            <span v-if="!canCreate" class="ntc-footer-hint">{{ createMissingHint }}</span>
            <button class="btn btn-secondary" @click="createVisible = false">取消</button>
            <button
              class="btn btn-primary ntc-submit"
              :disabled="!canCreate"
              :title="canCreate ? '' : createMissingHint"
              data-test="create-submit"
              @click="submitCreateTask"
            >
              创建
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, h, render } from 'vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { message } from 'ant-design-vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import TaskStatusTag from '@/components/TaskStatusTag.vue'
import TaskProgressBar from '@/components/TaskProgressBar.vue'
import {
  listNodeTasks,
  cancelNodeTask,
  retryNodeTask,
  createNodeTask,
  deleteNodeTask,
  batchDeleteNodeTasks,
  type NodeTaskData,
} from '@/composables/useNodeTasks'
import { paginationProps } from '@/composables/usePagination'
import { formatFileSize, formatDateTime, formatDurationCompact, durationSeconds } from '@/utils/format'
import {
  listUploadedScripts,
  deleteUploadedScript,
  uploadScript,
  previewScript,
  uploadDistributeFile,
  listTaskFiles,
  deleteTaskFile,
  type UploadedScript,
  type TaskFile,
} from '@/api/scriptUpload'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { routeLabel } from '@/composables/useClusterUtils'
import api from '@/api'
import SearchInput from '@/components/SearchInput.vue'

const route = useRoute()
const router = useRouter()

const tasks = ref<NodeTaskData[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
/** 筛选条草稿与已生效值分开：搜索框回车才生效（避免每个字符触发一次请求） */
const filterKeyword = ref('')
const appliedKeyword = ref('')
const filterClusterId = ref<number | string>('')
/** 分组筛选（与其余列表页同款）：只收窄筛选条的集群下拉候选，不参与任务查询参数 */
const filterGroup = ref('__all__')
const filterGroupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort() as string[]
})
const filterClusters = computed(() => {
  if (filterGroup.value === '__all__') return clusters.value
  if (filterGroup.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === filterGroup.value)
})
/** 切分组后清空集群筛选并重载（避免残留集群不在新分组内） */
function onFilterGroupChange() {
  filterClusterId.value = ''
  void nextTick(() => loadTasks(1))
}
const filterStatus = ref('')
const filterType = ref('')
/** 时间范围快捷项：'' 全部 / 24h / 7d / 30d（映射为 created_from） */
const filterRange = ref('')
const selectedRowKeys = ref<number[]>([])

const createVisible = ref(false)
const clusters = ref<Array<{ id: number; name: string; display_name?: string; group_name?: string }>>([])
const createClusterId = ref(0)
const createNodes = ref<Array<{ id: number; ip: string; status?: number; edge_path?: string; name?: string | null }>>(
  [],
)
/** 节点搜索关键字（8.1：节点多时不再只能翻滚动条） */
const nodeSearch = ref('')
const createNodeIds = ref<number[]>([])

function selectAllCreateNodes() {
  createNodeIds.value = createNodes.value.filter((n) => !isNodeOffline(n)).map((n) => n.id)
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
const edgePackRoute = ref<{ route?: 'relay' | 'direct'; relay_via?: string }>({})
/** 目标版本标签旁的路径标注，如「（经中继）」；无 route 字段时不渲染 */
const edgePackRouteText = computed(() => {
  const label = routeLabel(edgePackRoute.value.route)
  return label ? `（${label}）` : ''
})

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
const softwareSelected = ref<string[]>(softwareOptions.map((s) => s.value))
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
  customSoftwareList.value = customSoftwareList.value.filter((s) => s !== name)
  softwareSelected.value = softwareSelected.value.filter((s) => s !== name)
}

// ── cmd_exec ──
const cmdSecurityOptions = [
  { value: 'blacklist', label: '黑名单' },
  { value: 'whitelist', label: '白名单' },
  { value: 'none', label: '不限制' },
]
const cmdBuiltinWhitelist = [
  'ls',
  'ps',
  'df',
  'free',
  'top',
  'cat',
  'head',
  'tail',
  'grep',
  'wc',
  'du',
  'stat',
  'whoami',
  'hostname',
  'uptime',
  'date',
  'uname',
]
const cmdCommand = ref('')
const cmdSecurity = ref('blacklist')
const cmdTimeout = ref(30)
const cmdWhitelistInput = ref('')
const cmdCustomWhitelist = ref<string[]>([])
const cmdExecMode = ref<'command' | 'script'>('command')
const scriptFile = ref<File | null>(null)
const scriptDragOver = ref(false)
const scriptUploadId = ref<string | null>(null)
const scriptFromPending = ref(false)
const scriptPreviewContent = ref<string | null>(null)
const scriptUploadError = ref<string | null>(null)

// ── distribute file state ──
const distributeFile = ref<File | null>(null)
const distributeUploadId = ref<string | null>(null)
const distributeFromPending = ref(false)
const distributeUploadError = ref<string | null>(null)
const distributeDestpath = ref('')
const distributeTimeout = ref(600)
const distributeDragOver = ref(false)

function addCmdWhitelist() {
  const name = cmdWhitelistInput.value.trim()
  if (!name) return
  if (!cmdBuiltinWhitelist.includes(name) && !cmdCustomWhitelist.value.includes(name)) {
    cmdCustomWhitelist.value.push(name)
  }
  cmdWhitelistInput.value = ''
}

function removeCmdWhitelist(name: string) {
  cmdCustomWhitelist.value = cmdCustomWhitelist.value.filter((c) => c !== name)
}

function triggerScriptUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sh,.bash'
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) await handleScriptFile(file)
  }
  input.click()
}

function onScriptDrop(e: DragEvent) {
  scriptDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleScriptFile(file)
}

async function handleScriptFile(file: File) {
  scriptUploadError.value = null
  scriptPreviewContent.value = null

  // 校验扩展名
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['sh', 'bash'].includes(ext)) {
    scriptUploadError.value = '仅支持 .sh, .bash 文件'
    return
  }
  // 校验大小（512KB）
  if (file.size > 512 * 1024) {
    scriptUploadError.value = '文件大小不能超过 512KB'
    return
  }

  scriptFile.value = file

  // 上传到服务端
  try {
    const result = await uploadScript(file)
    scriptUploadId.value = result.upload_id
    scriptFromPending.value = false
    void loadUploadedFiles()
    // 上传成功后自动加载内容
    try {
      const preview = await previewScript(result.upload_id)
      scriptPreviewContent.value = preview.content
    } catch {
      scriptPreviewContent.value = null
    }
  } catch (err: any) {
    scriptUploadError.value = err?.response?.data?.detail || '上传失败'
    scriptFile.value = null
  }
}

function clearScriptFile() {
  // 仅删除本次新上传的暂存文件；从暂存列表选用的文件不应删除（属于已有文件，非本次上传）
  if (scriptUploadId.value && !scriptFromPending.value) {
    deleteUploadedScript(scriptUploadId.value).catch(() => {})
  }
  scriptFile.value = null
  scriptUploadId.value = null
  scriptPreviewContent.value = null
  scriptFromPending.value = false
}

async function previewUploadedScript() {
  if (!scriptUploadId.value) return
  try {
    const result = await previewScript(scriptUploadId.value)
    scriptPreviewContent.value = result.content
  } catch {
    scriptUploadError.value = '预览失败'
  }
}

function resetCmdExecForm() {
  cmdExecMode.value = 'command'
  cmdCommand.value = ''
  cmdSecurity.value = 'blacklist'
  cmdTimeout.value = 30
  cmdWhitelistInput.value = ''
  cmdCustomWhitelist.value = []
  scriptPreviewContent.value = null
  clearScriptFile()
}

/** Convert script content to the SSH+base64 remote execution command for copy */
function convertScriptToCommand() {
  if (scriptPreviewContent.value == null) return
  const content = scriptPreviewContent.value
  if (!content.trim()) {
    message.warning('脚本内容为空')
    return
  }
  // Base64 encode the content
  const b64 = btoa(unescape(encodeURIComponent(content)))
  const sshCmd = `echo '${b64}' | base64 -d | bash`
  // Copy to clipboard
  navigator.clipboard.writeText(sshCmd).then(
    () => message.success('已复制到剪贴板：base64 远程执行命令'),
    () => {
      // Fallback: put in command input for manual copy
      cmdCommand.value = sshCmd
      cmdExecMode.value = 'command'
      message.info('已填入命令输入框，可手动复制')
    },
  )
}

// ── distribute file handlers ──

function triggerDistributeUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) await handleDistributeFile(file)
  }
  input.click()
}

function onDistributeDrop(e: DragEvent) {
  distributeDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleDistributeFile(file)
}

async function handleDistributeFile(file: File) {
  distributeUploadError.value = null

  // 校验大小（默认 10MB，可调整）
  if (file.size > 10 * 1024 * 1024) {
    distributeUploadError.value = '文件大小不能超过 10MB'
    return
  }

  distributeFile.value = file

  // 上传到服务端
  try {
    const result = await uploadDistributeFile(file)
    distributeUploadId.value = result.upload_id
    distributeFromPending.value = false
    void loadUploadedFiles()
  } catch (err: any) {
    distributeUploadError.value = err?.response?.data?.detail || '上传失败'
    distributeFile.value = null
  }
}

function clearDistributeFile() {
  // 仅删除本次新上传的暂存文件；从暂存列表选用的文件不应删除
  if (distributeUploadId.value && !distributeFromPending.value) {
    deleteUploadedScript(distributeUploadId.value).catch(() => {})
  }
  distributeFile.value = null
  distributeUploadId.value = null
  distributeFromPending.value = false
}

// ── 暂存文件 / 任务源文件管理（全局入口；脚本/分发共用，openspec node-task-distribute-file 5.7） ──

const uploadedFiles = ref<UploadedScript[]>([])
const taskFiles = ref<TaskFile[]>([])
const pendingFilesModalVisible = ref(false)
const pendingFilesSelectMode = ref(false)
const taskFilesModalVisible = ref(false)

// 文件列表客户端分页（量级到数千再考虑服务端分页）
const FILE_PAGE_SIZE = 10
const pendingFilesPage = ref(1)
const taskFilesPage = ref(1)

/** 选择模式下按当前任务类型过滤：cmd_exec 只显示脚本，distribute_file 只显示分发文件 */
const pendingFilesFiltered = computed(() => {
  if (!pendingFilesSelectMode.value) return uploadedFiles.value
  if (createTaskType.value === 'cmd_exec') return uploadedFiles.value.filter((f) => f.kind === 'script')
  if (createTaskType.value === 'distribute_file') return uploadedFiles.value.filter((f) => f.kind === 'distribute')
  return uploadedFiles.value
})

const pendingFilesTotalPages = computed(() =>
  Math.max(1, Math.ceil(pendingFilesFiltered.value.length / FILE_PAGE_SIZE)),
)
const taskFilesTotalPages = computed(() => Math.max(1, Math.ceil(taskFiles.value.length / FILE_PAGE_SIZE)))

const pendingFilesPageItems = computed(() => {
  const page = Math.min(pendingFilesPage.value, pendingFilesTotalPages.value)
  return pendingFilesFiltered.value.slice((page - 1) * FILE_PAGE_SIZE, page * FILE_PAGE_SIZE)
})
const taskFilesPageItems = computed(() => {
  const page = Math.min(taskFilesPage.value, taskFilesTotalPages.value)
  return taskFiles.value.slice((page - 1) * FILE_PAGE_SIZE, page * FILE_PAGE_SIZE)
})

function setPendingFilesPage(p: number) {
  pendingFilesPage.value = Math.min(Math.max(1, p), pendingFilesTotalPages.value)
}
function setTaskFilesPage(p: number) {
  taskFilesPage.value = Math.min(Math.max(1, p), taskFilesTotalPages.value)
}

async function loadUploadedFiles() {
  // 两个列表独立加载：listTaskFiles 需要数据库，失败不影响暂存文件展示
  const pendingResult = listUploadedScripts().catch(() => [])
  const archivedResult = listTaskFiles().catch(() => [])
  const [pending, archived] = await Promise.all([pendingResult, archivedResult])
  uploadedFiles.value = Array.isArray(pending) ? pending : []
  taskFiles.value = Array.isArray(archived) ? archived : []
}

function openPendingFilesModal() {
  pendingFilesSelectMode.value = false
  pendingFilesModalVisible.value = true
  pendingFilesPage.value = 1
  void loadUploadedFiles()
}

function openPendingFilesSelect() {
  pendingFilesSelectMode.value = true
  pendingFilesModalVisible.value = true
  pendingFilesPage.value = 1
  void loadUploadedFiles()
}

/** 判断暂存文件列表中的文件是否正被表单选中 */
function isFileSelected(item: UploadedScript): boolean {
  if (item.kind === 'script') return scriptUploadId.value === item.upload_id
  return distributeUploadId.value === item.upload_id
}

/** 从暂存文件弹窗选用一个文件，填入创建表单对应字段 */
async function selectPendingFile(item: UploadedScript) {
  if (item.kind === 'script') {
    // 填入脚本字段 + 自动加载内容到编辑区
    scriptFile.value = new File([''], item.filename)
    scriptUploadId.value = item.upload_id
    scriptFromPending.value = true
    try {
      const preview = await previewScript(item.upload_id)
      scriptPreviewContent.value = preview.content
    } catch {
      scriptPreviewContent.value = null
    }
  } else {
    // 填入分发文件字段
    distributeFile.value = new File([''], item.filename)
    distributeUploadId.value = item.upload_id
    distributeFromPending.value = true
  }
  // 留在选择模式让用户看到"已选用"标记；再次点击可切换选中文件
}

function openTaskFilesModal() {
  taskFilesModalVisible.value = true
  taskFilesPage.value = 1
  void loadUploadedFiles()
}

function removeUploadedFile(item: UploadedScript) {
  showOverlayModal({
    title: '删除暂存文件',
    content: `确定删除暂存文件「${item.filename}」？删除后无法再用于创建任务。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteUploadedScript(item.upload_id)
        // 若正被当前表单引用，同步清空选择
        if (scriptUploadId.value === item.upload_id) {
          scriptUploadId.value = null
          scriptFile.value = null
          scriptPreviewContent.value = null
        }
        if (distributeUploadId.value === item.upload_id) {
          distributeUploadId.value = null
          distributeFile.value = null
        }
        message.success('已删除')
        await loadUploadedFiles()
      } catch (err: any) {
        message.error(err?.response?.data?.detail || '删除失败')
      }
    },
  })
}

function removeTaskFile(item: TaskFile) {
  showOverlayModal({
    title: '删除任务源文件',
    content: `确定删除任务 #${item.task_id} 的源文件「${item.filename}」？仅删除控制端副本，不影响已分发到节点上的文件，也不删除任务本身。`,
    okText: '删除',
    okDanger: true,
    onOk: async () => {
      try {
        await deleteTaskFile(item.task_id, item.name)
        message.success('已删除')
        await loadUploadedFiles()
      } catch (err: any) {
        message.error(err?.response?.data?.detail || '删除失败')
      }
    },
  })
}

/** 节点是否离线（后端 status：1=运行中；缺字段的裁剪载荷按「未知但可选」处理，避免整批锁死） */
function isNodeOffline(n: { status?: number }): boolean {
  return n.status != null && n.status !== 1
}

/** 节点列表按 IP / 名称 / 路径搜索（8.1） */
const filteredCreateNodes = computed(() => {
  const q = nodeSearch.value.trim().toLowerCase()
  if (!q) return createNodes.value
  return createNodes.value.filter((n) => `${n.ip} ${n.name || ''} ${n.edge_path || ''}`.toLowerCase().includes(q))
})

// ── 创建表单校验（8.1）：问题清单实时算，展示由「失焦过 / 提交过」决定 ──
const createTouched = ref<Record<string, boolean>>({})
const createSubmitAttempted = ref(false)

const createProblems = computed<Record<string, string>>(() => {
  const problems: Record<string, string> = {}
  if (!createClusterId.value) problems.cluster = '请选择集群'
  else if (createNodeIds.value.length === 0) problems.nodes = '请至少选择一个节点'
  if (!createTaskType.value) {
    problems.taskType = '请选择任务类型'
    return problems
  }
  switch (createTaskType.value) {
    case 'install_openresty':
      if (!createOpenrestyFile.value) problems.file = '请选择 OpenResty 安装包'
      break
    case 'edge_pack_add':
      if (!selectedPackFile.value) problems.file = '请选择版本包'
      break
    case 'edge_pack_rebase':
      if (!selectedPackVersion.value) problems.file = '请选择目标版本'
      break
    case 'software_check':
      if (softwareSelected.value.length === 0 && customSoftwareList.value.length === 0)
        problems.file = '请至少选择一项软件'
      break
    case 'cmd_exec':
      if (cmdExecMode.value === 'command') {
        if (!cmdCommand.value.trim()) problems.content = '请输入命令'
      } else if (!scriptPreviewContent.value || !scriptPreviewContent.value.trim()) {
        problems.content = '脚本内容不能为空'
      }
      break
    case 'distribute_file':
      if (!distributeFile.value || !distributeUploadId.value) problems.file = '请选择要分发的文件'
      else if (!distributeDestpath.value.trim()) problems.destpath = '请输入目标目录路径'
      break
    default:
      break
  }
  return problems
})

/** 字段错误：未触碰且未提交时保持安静，避免空白表单满屏红字 */
function showCreateError(field: string): string {
  if (!createTouched.value[field] && !createSubmitAttempted.value) return ''
  return createProblems.value[field] || ''
}

function touchCreateField(field: string) {
  createTouched.value = { ...createTouched.value, [field]: true }
}

const canCreate = computed(() => Object.keys(createProblems.value).length === 0)

/** 缺什么（按钮禁用态的 title / 底部提示）：说人话，不要「表单不完整」 */
function missingLabel(field: string): string {
  switch (field) {
    case 'cluster':
      return '选择集群'
    case 'nodes':
      return '选择节点'
    case 'taskType':
      return '选择任务类型'
    case 'content':
      return cmdExecMode.value === 'script' ? '填写脚本内容' : '输入命令'
    case 'destpath':
      return '填写目标目录'
    case 'file':
      switch (createTaskType.value) {
        case 'install_openresty':
          return '选择安装包'
        case 'edge_pack_add':
          return '选择版本包'
        case 'edge_pack_rebase':
          return '选择目标版本'
        case 'software_check':
          return '选择软件'
        case 'distribute_file':
          return '选择要分发的文件'
        default:
          return '选择文件'
      }
    default:
      return field
  }
}

const createMissingHint = computed(() => {
  const keys = Object.keys(createProblems.value)
  if (keys.length === 0) return ''
  return `还需${keys.map((k) => missingLabel(k)).join('、')}`
})

/** 帮助文案按任务类型切换（8.3）：放在相关字段旁，不再统一沉在弹窗底部 */
const CREATE_HELP: Record<string, string> = {
  install_openresty: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  install_edge: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  associate_new_openresty: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  edge_pack_add: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  edge_pack_rebase: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  start: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  stop: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  reload: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  statistic: '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
  cmd_exec: '命令将以清单中的用户身份在各节点执行；执行明细见任务详情。',
  software_check: '将查询各节点已安装的软件包版本，结果在任务详情中按节点展示。',
  distribute_file: '文件将以原始文件名存入目标目录；分发进度与结果见任务详情。',
}
const helpText = computed(() => (createTaskType.value ? CREATE_HELP[createTaskType.value] || '' : ''))

/** 命令模式「复制命令」（8.1；脚本模式已有「转换为命令」） */
async function copyCommand() {
  const cmd = cmdCommand.value.trim()
  if (!cmd) {
    message.warning('请先输入命令')
    return
  }
  try {
    await navigator.clipboard.writeText(cmd)
    message.success('已复制命令')
  } catch {
    message.warning('复制失败：浏览器未授权剪贴板，请手动选择文本复制')
  }
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
  { value: 'distribute_file', label: '分发文件' },
]

const columns = [
  // 序号列全站统一解剖（AGENTS #59）：宽度 45、后端分页用跨页连续公式
  { title: '#', key: 'index', width: 45 },
  { title: '任务类型', key: 'task_type', width: 170 },
  { title: '集群', key: 'cluster', width: 150, ellipsis: true },
  // 状态 + 节点计数 + 进度条合并为一列（原三列表达同一件事，吃掉表中部 ~300px）
  { title: '结果', key: 'result' },
  { title: '时间', key: 'time', width: 210 },
  { title: '操作', key: 'actions', width: 110, align: 'right' as const },
]

/** 状态 + 计数（与分段条同源，统一取后端真实计数） */
function resultCountText(t: NodeTaskData): string {
  const parts = [`成功 ${t.success_nodes ?? 0}`, `失败 ${t.failed_nodes ?? 0}`]
  if ((t.skipped_nodes ?? 0) > 0) parts.push(`跳过 ${t.skipped_nodes}`)
  if ((t.cancelled_nodes ?? 0) > 0) parts.push(`取消 ${t.cancelled_nodes}`)
  return parts.join(' · ')
}

/** 行是否仍在进行（有 finished_at 视为已结束，即使状态还是 running——中止的旧任务） */
function isLiveTaskRow(t: NodeTaskData): boolean {
  return ['pending', 'running'].includes(t.status) && !t.finished_at
}

/** 进行中任务的已用时（从开始时间起算，未开始则从创建时间起算） */
function elapsedText(t: NodeTaskData): string {
  const seconds = durationSeconds(t.started_at || t.created_at, new Date().toISOString())
  return seconds == null ? '—' : formatDurationCompact(seconds)
}

/** 任务类型格 tooltip：任务号 + 发起人（ID/操作人不占列宽，D7） */
function taskTooltip(t: NodeTaskData): string {
  const parts = [`任务 #${t.id}`]
  if (t.created_by_name) parts.push(`${t.created_by_name} 创建`)
  return parts.join(' · ')
}

/** 集群格 tooltip：集群被删后仍保留任务历史，给出可读说明 */
function clusterTooltip(t: NodeTaskData): string {
  return t.cluster_name || `集群已删除（ID ${t.cluster_id}）`
}

/** 时间格 tooltip：创建时间降级为提示，避免两列 19 字符时间戳并排 */
function timeTooltip(t: NodeTaskData): string {
  const created = t.created_at ? `创建于 ${formatTime(t.created_at)}` : '创建时间未知'
  const by = t.created_by_name ? ` · ${t.created_by_name}` : ''
  return created + by
}

function typeLabel(t: string): string {
  return taskTypes.find((x) => x.value === t)?.label || t
}

function taskTypeLabel(t: string): string {
  return typeLabel(t)
}

function formatTime(t?: string | null): string {
  return formatDateTime(t)
}

function durationText(item: { started_at?: string | null; finished_at?: string | null }): string {
  const seconds = durationSeconds(item.started_at, item.finished_at)
  return seconds == null ? '—' : formatDurationCompact(seconds)
}

/** 时间范围快捷项 → 小时数（映射为 created_from 下界） */
const RANGE_HOURS: Record<string, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }

/**
 * 时间范围下界（后端 created_at 为 naive UTC，见 AGENTS #26）：
 * 用 UTC 墙钟的 ISO 串（不带时区后缀）与库内口径对齐。
 */
function rangeStartIso(range: string): string | undefined {
  const hours = RANGE_HOURS[range]
  if (!hours) return undefined
  return new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19)
}

/** 列表请求参数（列表与轮询共用，保证轮询不会把筛选条件丢掉） */
function listParams(): Parameters<typeof listNodeTasks>[0] {
  return {
    status: filterStatus.value || undefined,
    task_type: filterType.value || undefined,
    cluster_id: filterClusterId.value === '' ? undefined : Number(filterClusterId.value),
    q: appliedKeyword.value.trim() || undefined,
    created_from: rangeStartIso(filterRange.value),
    page: page.value,
    page_size: pageSize.value,
  }
}

/** 是否有任何生效中的筛选（决定空态文案：没有任务 vs 没有符合条件） */
const hasActiveFilters = computed(
  () =>
    !!appliedKeyword.value.trim() ||
    filterClusterId.value !== '' ||
    !!filterStatus.value ||
    !!filterType.value ||
    !!filterRange.value,
)

/** 搜索框回车生效 */
function applyFilters() {
  appliedKeyword.value = filterKeyword.value
  void loadTasks(1)
}

/** 下拉变更立即生效（v-model 先写入，再下一拍取数） */
function onFilterChange() {
  void nextTick(() => loadTasks(1))
}

/** 空态「清空筛选」 */
function clearFilters() {
  filterKeyword.value = ''
  appliedKeyword.value = ''
  filterClusterId.value = ''
  filterGroup.value = '__all__'
  filterStatus.value = ''
  filterType.value = ''
  filterRange.value = ''
  void loadTasks(1)
}

/** 批量工具条「取消选择」 */
function clearSelection() {
  selectedRowKeys.value = []
}

async function loadTasks(targetPage = 1) {
  loading.value = true
  page.value = targetPage
  try {
    const res = await listNodeTasks(listParams())
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

/**
 * 行勾选框：执行中/待执行的任务不允许勾选（后端也会 skip，界面先拦一层）。
 */
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: onSelectionChange,
  getCheckboxProps: (record: NodeTaskData) => ({
    disabled: ['running', 'pending'].includes(record.status),
  }),
}))

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
  if (loading.value) return
  try {
    const res = await listNodeTasks(listParams())
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

/**
 * 详情改为独立路由页（D8）：带上当前筛选与分页，详情页「返回列表」据此恢复现场。
 */
function openDetail(record: NodeTaskData) {
  void router.push({ name: 'NodeTaskDetail', params: { id: record.id }, query: currentListQuery() })
}

/**
 * 整行可点进详情（7.2）：行内按钮/勾选框/下拉的点击不劫持，
 * 否则「批量删除」「⋯ 菜单」会连带跳页。
 */
function rowProps(record: NodeTaskData) {
  return {
    style: { cursor: 'pointer' },
    onClick: (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('button, a, input, .ant-dropdown, .ant-checkbox-wrapper')) return
      openDetail(record)
    },
  }
}

/** 列表现场 → query（只写非默认值，URL 保持干净） */
function currentListQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.size = String(pageSize.value)
  if (appliedKeyword.value.trim()) query.q = appliedKeyword.value.trim()
  if (filterClusterId.value !== '') query.cluster = String(filterClusterId.value)
  if (filterStatus.value) query.status = filterStatus.value
  if (filterType.value) query.type = filterType.value
  if (filterRange.value) query.range = filterRange.value
  return query
}

/** 从详情页返回时按 query 回填筛选条（保持与跳转前一致） */
function restoreFiltersFromQuery() {
  const q = route.query
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const pageParam = Number(str(q.page))
  page.value = pageParam > 0 ? pageParam : 1
  const sizeParam = Number(str(q.size))
  if (sizeParam > 0) pageSize.value = sizeParam
  appliedKeyword.value = str(q.q)
  filterKeyword.value = appliedKeyword.value
  filterClusterId.value = str(q.cluster) ? Number(str(q.cluster)) : ''
  filterStatus.value = str(q.status)
  filterType.value = str(q.type)
  filterRange.value = str(q.range)
}

onMounted(() => {
  restoreFiltersFromQuery()
  loadTasks(page.value)
  void loadUploadedFiles()
  void loadClusters()
})
onBeforeUnmount(() => {
  if (listPollTimer) {
    clearInterval(listPollTimer)
    listPollTimer = null
  }
})

/**
 * 列表行「取消」先二次确认（与详情页 confirmCancel 同口径）。
 * 原实现点一下就直接取消：对改动型任务（安装/升级/启停）风险高，
 * 且取消**不可回滚已发生的改动**，必须让用户在选择前就看到这句。
 */
function handleCancel(record: NodeTaskData) {
  showOverlayModal({
    title: '确认取消任务',
    content:
      '取消会立即中断正在执行的节点进程，已成功的节点不受影响。\n' +
      '已产生的改动不会回滚——安装/升级/启停等改动型任务，请确认后续是否需要手工处理。',
    okText: '确认取消',
    okDanger: true,
    onOk: async () => {
      try {
        await cancelNodeTask(record.id)
        message.success('任务取消已发起')
        loadTasks(page.value)
      } catch {
        message.error('取消失败')
      }
    },
  })
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
        h(
          'div',
          { style: 'font-size:14px;color:var(--danger);margin-bottom:12px;font-weight:500;' },
          `任务 #${record.id}（${typeLabel(record.task_type)}）`,
        ),
        h('div', { style: 'font-size:13px;color:var(--fg);line-height:1.7;' }, [
          h(
            'p',
            { style: 'margin:0 0 8px;' },
            `将重新执行该任务的失败/取消节点：失败 ${record.failed_nodes} 个、取消 ${record.cancelled_nodes} 个。`,
          ),
          h(
            'p',
            { style: 'margin:0;color:var(--muted);' },
            '已成功的节点不会被重复执行。重试前请确认相关节点已恢复正常。',
          ),
        ]),
      ]),
      h('div', { class: 'modal-footer' }, [
        h('button', { class: 'btn btn-secondary', onClick: close }, '取消'),
        h(
          'button',
          {
            class: 'btn btn-danger',
            onClick: () => {
              close()
              onOk()
            },
          },
          '确认重试',
        ),
      ]),
    ]),
  ])

  render(vnode, container)
}

function handleRetry(record: NodeTaskData) {
  showRetryConfirm(record, async () => {
    await retryNodeTask(record.id)
    message.success('任务重试已发起')
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
        h(
          'button',
          {
            class: 'btn btn-danger',
            onClick: () => {
              close()
              onOk()
            },
          },
          '确认删除',
        ),
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
        if (deleted > 0)
          message.success(`已删除 ${deleted} 个任务${skipped > 0 ? `，${skipped} 个跳过（执行中/不存在）` : ''}`)
        else if (skipped > 0) message.warning('所选任务均执行中或不存在，未删除')
        selectedRowKeys.value = []
        loadTasks(page.value)
      } catch (e: any) {
        message.error(e?.response?.data?.detail || '批量删除失败')
      }
    },
  )
}

async function openCreateModal() {
  createVisible.value = true
  createTouched.value = {}
  createSubmitAttempted.value = false
  nodeSearch.value = ''
  createClusterId.value = 0
  createNodeIds.value = []
  createTaskType.value = ''
  resetTypeDependentOptions()
  createNodes.value = []
  resetCmdExecForm()
  distributeFile.value = null
  distributeUploadId.value = null
  distributeFromPending.value = false
  distributeUploadError.value = null
  distributeDestpath.value = ''
  distributeTimeout.value = 600
  if (clusters.value.length === 0) await loadClusters()
}

/** 集群下拉（筛选条与创建表单共用）：失败不影响列表，仅少一个筛选维度 */
async function loadClusters(): Promise<void> {
  try {
    const res = await api.get('/clusters', { params: { page_size: 100 } })
    clusters.value = res.data.items || res.data || []
  } catch {
    clusters.value = []
  }
}

async function loadEdgePackFiles(clusterId: number) {
  if (!clusterId) return
  const res = await api.get(`/clusters/${clusterId}/nodes/edge-pack-files`)
  edgePackFiles.value = res.data?.files || []
}

async function loadEdgePackVersions(clusterId: number) {
  // 取第一个"被勾选"的节点。此前误用 createNodes.value[0]（集群节点表首节点，
  // 恰好是网关机），导致无论用户勾选哪个节点，版本列表永远查的是网关机——
  // 它没传过升级包，下拉里自然只有它自己的当前版本。
  const firstNode = createNodes.value.find((n) => createNodeIds.value.includes(n.id))
  if (!clusterId || !firstNode) return
  const res = await api.get(`/clusters/${clusterId}/nodes/${firstNode.id}/edge-pack-list`)
  edgePackVersions.value = res.data?.versions || []
  edgePackRoute.value = { route: res.data.route, relay_via: res.data.relay_via }
}

/** 清空全部「随任务类型变化」的依赖选项及其选中值 */
function resetTypeDependentOptions() {
  createOpenrestyFile.value = ''
  openrestyFiles.value = []
  selectedPackFile.value = ''
  edgePackFiles.value = []
  edgePackVersions.value = []
  edgePackRoute.value = {}
  selectedPackVersion.value = ''
}

/**
 * 按「集群 + 任务类型」加载该类型所需的依赖选项（安装包 / Edge 版本包 / 目标版本）。
 * 切换任务类型与切换集群共用本实现，禁止两处各写一套请求。
 * 不需要依赖选项的类型（启动/停止/命令执行等）只清空，不发起任何请求。
 */
async function loadTypeDependentOptions(clusterId: number, taskType: string) {
  resetTypeDependentOptions()
  if (!clusterId) return
  if (taskType === 'install_openresty') {
    const res = await api.get(`/clusters/${clusterId}/nodes/openresty-files`)
    openrestyFiles.value = res.data?.files || res.data || []
    return
  }
  if (taskType === 'edge_pack_add') {
    await loadEdgePackFiles(clusterId)
    return
  }
  if (taskType === 'edge_pack_rebase') {
    await loadEdgePackVersions(clusterId)
  }
}

function onTaskTypeChange() {
  loadTypeDependentOptions(createClusterId.value, createTaskType.value)
}

watch(createTaskType, () => onTaskTypeChange())
watch(createClusterId, () => {
  // 切换集群后按当前任务类型重新加载：此前只清空不重载，下拉会恒为空
  loadTypeDependentOptions(createClusterId.value, createTaskType.value)
})

/** 无专属字段的任务类型：帮助文案挂在「任务类型」下方 */
const isSimpleTaskType = computed(() =>
  ['install_edge', 'associate_new_openresty', 'start', 'stop', 'reload', 'statistic'].includes(createTaskType.value),
)

function onCreateClusterChange() {
  touchCreateField('cluster')
  nodeSearch.value = ''
  void loadCreateNodes()
}

/** ClusterSelect emit number|string → 内部 number（0=未选；#56 占位语义迁移为 a-select placeholder） */
function onCreateClusterFieldChange(value: number | string) {
  createClusterId.value = value === '' ? 0 : Number(value)
}

function onCreateTaskTypeChange() {
  touchCreateField('taskType')
}

async function loadCreateNodes() {
  createNodeIds.value = []
  createNodes.value = []
  if (!createClusterId.value) return
  const res = await api.get(`/clusters/${createClusterId.value}/nodes`, { params: { page_size: 100 } })
  createNodes.value = res.data.items || []
}

watch(createNodeIds, () => {
  if (createTaskType.value === 'edge_pack_rebase' && createNodeIds.value.length > 0) {
    loadEdgePackVersions(createClusterId.value)
  }
})

/** 提交时把第一个错误字段滚到可见处（8.1：错误不藏在视口外） */
function scrollToFirstCreateError() {
  void nextTick(() => {
    const el = document.querySelector('.modal-overlay[style*="flex"] .is-error') as HTMLElement | null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

async function submitCreateTask() {
  createSubmitAttempted.value = true
  if (!canCreate.value) {
    scrollToFirstCreateError()
    return
  }
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
    if (cmdExecMode.value === 'script') {
      if (scriptPreviewContent.value == null || !scriptPreviewContent.value.trim()) {
        message.warning('脚本内容为空，请上传并编辑脚本')
        return
      }
      params.script_content = scriptPreviewContent.value
    } else {
      params.cmd = cmdCommand.value
    }
    // 安全参数对命令/脚本两种模式一致提交（后端按 params.security/whitelist 校验脚本内容，缺省 blacklist）
    params.security = cmdSecurity.value
    if (cmdSecurity.value === 'whitelist' && cmdCustomWhitelist.value.length > 0) {
      params.whitelist = [...cmdCustomWhitelist.value]
    }
    params.timeout = cmdTimeout.value
  }
  if (createTaskType.value === 'distribute_file') {
    if (!distributeUploadId.value || !distributeFile.value) {
      message.warning('请先上传要分发的文件')
      return
    }
    if (!distributeDestpath.value.trim()) {
      message.warning('请输入目标目录路径')
      return
    }
    params.srcpath = distributeUploadId.value
    params.destpath = distributeDestpath.value.trim()
    params.srcfilename = distributeFile.value.name
    params.timeout = distributeTimeout.value
  }
  // cmd_exec 脚本模式：传 script_filename 供详情展示
  if (createTaskType.value === 'cmd_exec' && cmdExecMode.value === 'script' && scriptFile.value) {
    params.script_filename = scriptFile.value.name
  }
  const archiveId =
    createTaskType.value === 'cmd_exec' && cmdExecMode.value === 'script' && scriptUploadId.value
      ? scriptUploadId.value
      : undefined
  try {
    const created = await createNodeTask(
      createClusterId.value,
      createTaskType.value,
      createNodeIds.value,
      params,
      archiveId,
    )
    message.success('任务已创建')
    createVisible.value = false
    void loadUploadedFiles()
    // 7.2：创建成功直接进入新任务详情页（替换「停在列表 + toast」）
    void router.push({ name: 'NodeTaskDetail', params: { id: created.id } })
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '创建任务失败')
  }
}
</script>

<style scoped>
/* ── 筛选条：与表格同卡片，作为表格上方的工具栏条 ── */
.node-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: nowrap;
}

/* 筛选条行尾：低频文件维护入口（文字链层级，与行内「详情」同款）+ 分隔线 + 刷新 */
.nt-bar-tail {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
  flex: 0 0 auto;
}

.nt-file-entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* 数量徽章恒定渲染（含 0），避免入口宽度随数量跳变 */
.nt-file-count {
  min-width: 18px;
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: var(--muted);
}

.nt-bar-sep {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.nt-refresh {
  flex: 0 0 auto;
}

/* ── 批量工具条：有勾选才出现，主色淡底与筛选条分层 ── */
.nt-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--accent-bg);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--fg);
}

.nt-batch-count strong {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

.nt-batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 序号列：等宽、弱色，翻页不跳字宽 ── */
.nt-index {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.nt-task-type,
.nt-cluster {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.nt-cluster {
  color: var(--muted);
}

/*
 * 结果列：状态 chip / 计数（第一行）+ 分段条（第二行）+ 失败归因（第三行）。
 * 归因缺失时不渲染占位行，靠固定最小高度保证同页行高一致（避免翻页时表格总高漂移）。
 */
.result-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  min-height: 58px;
  /* 分段条铺满单元格时不要贴到「时间」列文字上 */
  padding-right: 16px;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-counts {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  white-space: nowrap;
}

.result-bar :deep(.tpb) {
  min-width: 0;
  width: 100%;
}

.result-cause {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 时间列：结束时间 + 耗时并列，进行中换「已用时」 ── */
.time-cell {
  display: flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}

.time-main {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
}

.time-duration {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.time-live {
  font-size: 12px;
  color: var(--accent);
}

/* ── 操作列：文字链 + ⋯，整列右对齐 ── */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.link-action {
  padding: 2px 6px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}

.link-action:hover {
  color: var(--accent-hover);
  text-decoration: underline;
}

/* ── 空态（两态共用外壳，文案/主行动按有无筛选切换） ── */
.nt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 16px 44px;
}

.nt-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: var(--accent-bg);
  color: var(--accent);
}

.nt-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.nt-empty-desc {
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
  text-align: center;
}

.nt-empty .btn {
  margin-top: 10px;
}

.action-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.action-trigger-btn:hover {
  background: var(--accent-bg);
  color: var(--accent);
}
/* ── 创建任务表单（8.1 / 8.3）：字段节奏、必填星号、行内错误、帮助文案 ── */
.ntc-field {
  margin-bottom: 14px;
}

.ntc-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--fg);
}

.ntc-label-inline {
  margin-top: 12px;
}

.ntc-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.ntc-label-row .ntc-label {
  margin-bottom: 0;
}

.ntc-req {
  color: var(--danger);
  font-weight: 600;
}

.ntc-count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.ntc-error {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--danger);
}

.ntc-help {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.form-input.is-error {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px oklch(55% 0.18 28 / 12%);
}

/* 节点区：未选集群是虚线空态，不是伪输入框 */
.ntc-node-empty {
  padding: 20px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.ntc-node-search {
  margin-bottom: 8px;
}

.ntc-node-list {
  max-height: 180px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.ntc-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
}

.ntc-node:hover {
  background: var(--bg);
}

.ntc-node.is-offline {
  cursor: not-allowed;
  color: var(--muted);
}

.ntc-node-ip {
  font-family: var(--font-mono);
  font-size: 12px;
}

.ntc-node-path {
  font-size: 12px;
  color: var(--muted);
}

.ntc-offline-tag {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 11px;
  line-height: 16px;
  color: var(--muted);
}

.ntc-node-none {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--muted);
}

.ntc-node-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  font-size: 12px;
}

.ntc-node-actions a {
  color: var(--accent);
  cursor: pointer;
}

.ntc-node-hint {
  margin-left: auto;
  color: var(--muted);
}

/* 分段选择：浅底 + 主色文字 + 细边（不抢主按钮） */
.ntc-seg {
  display: flex;
  gap: 2px;
  margin-bottom: 12px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
}

.ntc-seg-btn {
  flex: 1;
  padding: 5px 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  transition:
    color 0.15s,
    background-color 0.15s;
}

.ntc-seg-btn.is-active {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}

.ntc-input-with-action {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ntc-input-with-action .form-input {
  flex: 1;
  min-width: 0;
}

/* 执行策略：组标签 + 说明 + 单选项一行 */
.ntc-group {
  margin-top: 12px;
}

.ntc-group-label {
  font-size: 13px;
  color: var(--fg);
  margin-bottom: 4px;
}

.ntc-group-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
  margin-bottom: 8px;
}

.ntc-radios {
  display: flex;
  gap: 16px;
}

.ntc-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.ntc-radio input {
  accent-color: var(--accent);
}

/* 数值输入统一宽度 + 单位后缀 */
.ntc-inline-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ntc-number {
  width: 160px;
}

.ntc-unit {
  font-size: 12px;
  color: var(--muted);
}

/* 底部：提示 + 按钮 */
.ntc-footer {
  align-items: center;
  gap: 8px;
}

.ntc-footer-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--muted);
}

.ntc-submit:disabled {
  background: var(--bg);
  color: var(--muted);
  border: 1px solid var(--border);
  cursor: not-allowed;
  opacity: 1;
}
</style>
