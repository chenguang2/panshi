<template>
  <div class="tab-content node-tab">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddNodeModal(cluster)">添加节点</a-button>
      <a-button size="small" @click="editNode(cluster)" :disabled="!cluster.selectedNode">编辑节点</a-button>
      <a-button size="small" danger :disabled="!cluster.selectedNode" @click="deleteNode(cluster)">删除节点</a-button>
      <a-divider type="vertical" />
      <a-button size="small" @click="startNode(cluster.selectedNode!)" :disabled="!cluster.selectedNode">启动</a-button>
      <a-button size="small" @click="stopNode(cluster.selectedNode!)" :disabled="!cluster.selectedNode">停止</a-button>
      <a-button size="small" @click="queryNodeStatus(cluster.selectedNode!)" :disabled="!cluster.selectedNode">状态查询</a-button>
      <a-divider type="vertical" />
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
        <template v-if="column.key === 'status'">
          <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? '健康' : '离线'" />
        </template>
        <template v-if="column.key === 'actions'">
          <template v-for="btnKey in nodeActionsSelected" :key="btnKey">
            <a-button size="small" @click="handleNodeAction(cluster, record, btnKey)">
              {{ getNodeActionButtonTitle(btnKey) }}
            </a-button>
          </template>
          <a-dropdown v-if="moreNodeActions.length > 0">
            <a-button size="small">
              更多 <DownOutlined />
            </a-button>
            <template #overlay>
              <a-menu @click="(e: { key: string }) => handleNodeAction(cluster, record, e.key)">
                <a-menu-item v-for="btn in moreNodeActions" :key="btn.key">
                  {{ btn.title }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="nodeModalVisible" :title="editingNode ? '编辑节点' : '添加节点'" width="500px" @ok="handleNodeSubmit">
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
        <a-form-item label="Edge路径" name="edge_path" :rules="[{ required: true, message: '请输入Edge路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { max: 255, message: '最多255个字符' }]">
          <a-input v-model:value="nodeForm.edge_path" placeholder="请输入Edge路径，如 /edge/node1" />
        </a-form-item>
        <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
          <a-select v-model:value="nodeForm.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DownOutlined } from '@ant-design/icons-vue'
import type { Cluster } from '@/types'
import ConfigDiff from '@/views/ConfigDiff.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterNodes, allNodeColumns, allNodeActionButtons } from '@/composables/useClusterNodes'

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
} = useClusterNodes({
  clusters,
  onRefresh,
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
