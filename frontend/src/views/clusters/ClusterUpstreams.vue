<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddUpstreamModal(cluster)">添加上游</a-button>
      <a-button size="small" @click="editUpstream(cluster)" :disabled="!cluster.selectedUpstream">编辑上游</a-button>
      <a-button size="small" danger :disabled="!cluster.selectedUpstream" @click="deleteUpstream(cluster)">删除上游</a-button>
      <a-divider type="vertical" />
      <a-button size="small" @click="publishUpstream(cluster)" :disabled="!cluster.selectedUpstream">发布</a-button>
      <a-button size="small" @click="openUpstreamVersionManagement(cluster)" :disabled="!cluster.selectedUpstream">版本管理</a-button>
      <a-divider type="vertical" />
      <a-popover v-model:open="upstreamColumnPopoverVisible" trigger="click" placement="bottomRight">
        <template #title>选择显示列</template>
        <template #content>
          <div style="min-width: 400px;">
            <div style="font-weight: 500; margin-bottom: 8px;">列选择</div>
            <a-checkbox-group v-model:value="upstreamColumnsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <div v-for="col in allUpstreamColumns" :key="col.key" style="margin-bottom: 4px;">
                  <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0;" />
            <div style="font-weight: 500; margin-bottom: 8px;">操作按钮</div>
            <a-checkbox-group v-model:value="upstreamActionsSelected">
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <div v-for="btn in allUpstreamActionButtons" :key="btn.key" style="margin-bottom: 4px;">
                  <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
                </div>
              </div>
            </a-checkbox-group>
            <a-divider style="margin: 12px 0;" />
            <div style="font-weight: 500; margin-bottom: 8px;">搜索</div>
            <a-checkbox v-model:checked="upstreamSearchVisible">显示搜索框</a-checkbox>
          </div>
        </template>
        <a-button size="small">列配置</a-button>
      </a-popover>

      <div class="toolbar-right">
        <template v-if="upstreamSearchVisible">
          <a-input-search
            v-model:value="cluster.upstreamsSearch"
            placeholder="搜索上游"
            style="width: 150px;"
            @search="() => { cluster.upstreamsPagination!.page = 1; loadUpstreams(cluster) }"
            allow-clear
            size="small"
          />
          <a-select
            v-model:value="cluster.upstreamsSearchField"
            placeholder="字段"
            style="width: 90px;"
            allow-clear
            size="small"
          >
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="name">名称</a-select-option>
          </a-select>
        </template>
      </div>
    </div>
    <a-table
      :columns="visibleUpstreamColumns"
      :data-source="cluster.upstreams || []"
      :pagination="{
        current: cluster.upstreamsPagination?.page,
        pageSize: cluster.upstreamsPagination?.pageSize,
        total: cluster.upstreamsPagination?.total,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 条`,
        pageSizeOptions: ['10', '20', '50', '100'],
        showQuickJumper: true
      }"
      :loading="cluster.upstreamsLoading"
      :row-selection="{ selectedRowKeys: cluster.selectedUpstream ? [cluster.selectedUpstream.id] : [], onChange: (_keys: any, rows: any) => selectUpstream(cluster, rows[rows.length - 1]) }"
      :showSorterTooltip="false"
      size="small"
      row-key="id"
      class="node-table"
      @change="(pag: any, _filters: any, sorter: any) => handleUpstreamTableChange(cluster, pag, sorter)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'actions'">
          <template v-for="btnKey in upstreamActionsSelected" :key="btnKey">
            <a-divider type="vertical" v-if="btnKey === 'publish'" />
            <a-button size="small" @click="handleUpstreamAction(cluster, record, btnKey)">
              {{ getUpstreamActionButtonTitle(btnKey) }}
            </a-button>
          </template>
        </template>
      </template>
    </a-table>

    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: upstreamModalVisible ? 'flex' : 'none' }">
      <div class="modal" style="max-width:750px;">
        <div class="modal-header">
          <h2>{{ editingUpstream ? '编辑上游' : '添加上游' }}</h2>
          <button class="modal-close" @click="upstreamModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <a-tabs v-model:activeKey="upstreamModalActiveTab">
            <a-tab-pane key="basic" tab="基础配置">
              <a-form ref="upstreamFormRef" :model="upstreamForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
                <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入上游名称' }]">
                  <a-input v-model:value="upstreamForm.name" placeholder="请输入上游名称" />
                </a-form-item>
                <a-form-item label="负载均衡" name="load_balance" :rules="[{ required: true, message: '请选择负载均衡' }]">
                  <a-select v-model:value="upstreamForm.load_balance">
                    <a-select-option value="weighted_roundrobin">加权轮询</a-select-option>
                    <a-select-option value="chash">一致性哈希</a-select-option>
                    <a-select-option value="ewma">延迟最小</a-select-option>
                    <a-select-option value="least_conn">最少连接</a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item v-if="upstreamForm.load_balance === 'chash'" label="哈希位置" name="hash_on" :rules="[{ required: true, message: '请选择哈希位置' }]">
                  <a-select v-model:value="upstreamForm.hash_on">
                    <a-select-option value="header">HTTP请求头</a-select-option>
                    <a-select-option value="cookie">Cookie</a-select-option>
                    <a-select-option value="vars">内置变量</a-select-option>
                    <a-select-option value="vars_combinations">自定义变量</a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item v-if="upstreamForm.load_balance === 'chash'" label="Key" name="key" :rules="[{ required: true, message: '请输入哈希 Key' }]">
                  <a-input v-model:value="upstreamForm.key" placeholder="请输入哈希 Key" />
                </a-form-item>
                <a-form-item label="描述" name="description">
                  <a-textarea v-model:value="upstreamForm.description" :rows="2" />
                </a-form-item>
                <a-form-item label="节点列表" :rules="[{ required: true, message: '请至少添加一个节点' }]">
                  <a-table :columns="targetColumns" :data-source="upstreamForm.targets" :pagination="false" size="small" row-key="key">
                    <template #bodyCell="{ column, record, index }">
                      <template v-if="column.key === 'ip'">
                        <a-input v-model:value="record.ip" placeholder="IP地址" />
                        <div v-if="targetValidation[index]?.ip" class="ant-form-item-explain-error">{{ targetValidation[index].ip }}</div>
                      </template>
                      <template v-else-if="column.key === 'port'">
                        <a-input-number v-model:value="record.port" :min="1" :max="65535" style="width: 100%" placeholder="端口" />
                        <div v-if="targetValidation[index]?.port" class="ant-form-item-explain-error">{{ targetValidation[index].port }}</div>
                      </template>
                      <template v-else-if="column.key === 'weight'">
                        <a-input-number v-model:value="record.weight" :min="1" :max="100" style="width: 100%" placeholder="权重" />
                        <div v-if="targetValidation[index]?.weight" class="ant-form-item-explain-error">{{ targetValidation[index].weight }}</div>
                      </template>
                      <template v-else-if="column.key === 'action'">
                        <a-button size="small" danger @click="removeUpstreamTarget(index)">删除</a-button>
                      </template>
                    </template>
                  </a-table>
                  <a-button type="dashed" size="small" style="width: 100%; margin-top: 8px" @click="addUpstreamTarget">
                    <PlusOutlined /> 添加节点
                  </a-button>
                </a-form-item>
              </a-form>
            </a-tab-pane>

            <a-tab-pane key="advanced" tab="高级配置">
              <div class="advanced-sections">
                <!-- 健康检查 -->
                <div class="advanced-section">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleChecks">
                    <span>健康检查</span>
                  </label>
                  <a-textarea v-model:value="checksJson" :rows="6" placeholder="健康检查JSON配置" :disabled="!toggleChecks" />
                  <div v-if="formErrors.checks" style="color:var(--danger);font-size:12px;margin-top:6px;">{{ formErrors.checks }}</div>
                </div>

                <!-- 超时配置 -->
                <div class="advanced-section" @input.capture="onSectionInput">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleTimeout">
                    <span>超时配置（秒）</span>
                  </label>
                  <div style="display: flex; gap: 8px;">
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">连接</div><a-input-number v-model:value="upstreamForm.timeout.connect" :min="0" placeholder="connect" style="width:100%" :disabled="!toggleTimeout" /></div>
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">发送</div><a-input-number v-model:value="upstreamForm.timeout.send" :min="0" placeholder="send" style="width:100%" :disabled="!toggleTimeout" /></div>
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">读取</div><a-input-number v-model:value="upstreamForm.timeout.read" :min="0" placeholder="read" style="width:100%" :disabled="!toggleTimeout" /></div>
                  </div>
                  <div v-if="formErrors.timeout" style="color:var(--danger);font-size:12px;margin-top:6px;">{{ formErrors.timeout }}</div>
                </div>

                <!-- 连接池 -->
                <div class="advanced-section" @input.capture="onSectionInput">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="togglePool">
                    <span>连接池</span>
                  </label>
                  <div style="display: flex; gap: 8px;">
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">大小</div><a-input-number v-model:value="upstreamForm.keepalive_pool.size" :min="1" placeholder="size" style="width:100%" :disabled="!togglePool" /></div>
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">空闲超时(秒)</div><a-input-number v-model:value="upstreamForm.keepalive_pool.idle_timeout" :min="0" placeholder="idle_timeout" style="width:100%" :disabled="!togglePool" /></div>
                    <div style="flex:1"><div style="margin-bottom:2px;color:#666;font-size:12px">最大请求数</div><a-input-number v-model:value="upstreamForm.keepalive_pool.requests" :min="1" placeholder="requests" style="width:100%" :disabled="!togglePool" /></div>
                  </div>
                  <div v-if="formErrors.keepalive_pool" style="color:var(--danger);font-size:12px;margin-top:6px;">{{ formErrors.keepalive_pool }}</div>
                </div>

                <!-- 重试次数 -->
                <div class="advanced-section">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleRetries">
                    <span>重试次数</span>
                  </label>
                  <div :style="{ opacity: toggleRetries ? 1 : 0.45 }">
                    <div class="radio-group">
                      <label class="radio-label"><input type="radio" value="auto" v-model="retriesRadio" :disabled="!toggleRetries"><span>自动（使用可用节点数）</span></label>
                      <label class="radio-label"><input type="radio" value="custom" v-model="retriesRadio" :disabled="!toggleRetries"><span>指定重试次数</span></label>
                      <template v-if="retriesRadio === 'custom'">
                        <a-input-number v-model:value="upstreamForm.retriesInput" :min="0" placeholder="次数" style="width:120px;margin-left:24px" :disabled="!toggleRetries" />
                      </template>
                      <label class="radio-label"><input type="radio" value="disabled" v-model="retriesRadio" :disabled="!toggleRetries"><span>禁用重试</span></label>
                    </div>
                    <div v-if="formErrors.retries" style="color:var(--danger);font-size:12px;margin-top:4px;">{{ formErrors.retries }}</div>
                  </div>
                </div>

                <!-- 重试超时 -->
                <div class="advanced-section" @input.capture="onSectionInput">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleRetryTimeout">
                    <span>重试超时（秒）</span>
                  </label>
                  <a-input-number v-model:value="upstreamForm.retry_timeout" :min="0" placeholder="秒" style="width:200px" :disabled="!toggleRetryTimeout" />
                  <div v-if="formErrors.retry_timeout" style="color:var(--danger);font-size:12px;margin-top:4px;">{{ formErrors.retry_timeout }}</div>
                  <div style="color:#999;font-size:11px;margin-top:2px">0 = 不限制重试时间</div>
                </div>

                <!-- Host 策略 -->
                <div class="advanced-section">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleHost">
                    <span>Host 策略</span>
                  </label>
                  <div style="display:flex;gap:8px">
                    <div style="flex:1;max-width:260px">
                      <div style="margin-bottom:2px;color:#666;font-size:12px">Host 策略</div>
                      <a-select v-model:value="upstreamForm.pass_host" :disabled="!toggleHost">
                        <a-select-option value="pass">pass（透传客户端Host）</a-select-option>
                        <a-select-option value="node">node（使用节点Host）</a-select-option>
                        <a-select-option value="rewrite">rewrite（自定义Host）</a-select-option>
                      </a-select>
                    </div>
                    <div v-if="upstreamForm.pass_host === 'rewrite'" style="flex:1">
                      <div style="margin-bottom:2px;color:#666;font-size:12px">上游 Host</div>
                      <a-input v-model:value="upstreamForm.upstream_host" placeholder="指定上游请求的Host" :disabled="!toggleHost" />
                    </div>
                  </div>
                  <div v-if="formErrors.pass_host" style="color:var(--danger);font-size:12px;margin-top:6px;">{{ formErrors.pass_host }}</div>
                </div>

                <!-- 通信协议 -->
                <div class="advanced-section">
                  <label class="checkbox-label section-toggle">
                    <input type="checkbox" v-model="toggleScheme">
                    <span>通信协议</span>
                  </label>
                  <a-select v-model:value="upstreamForm.scheme" style="width:200px" :disabled="!toggleScheme">
                    <a-select-option value="http">http</a-select-option>
                    <a-select-option value="https">https</a-select-option>
                    <a-select-option value="tcp">tcp</a-select-option>
                    <a-select-option value="udp">udp</a-select-option>
                  </a-select>
                </div>
              </div>
            </a-tab-pane>
          </a-tabs>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="upstreamModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleUpstreamSubmit">{{ editingUpstream ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
    </Teleport>

    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      @published="versionModalOnPublished"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Cluster } from '@/types'
import { PlusOutlined, WarningOutlined } from '@ant-design/icons-vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}>()

// Version modal state — defined internally so the composable has full mutable access.
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const {
  upstreamModalVisible,
  upstreamModalActiveTab,
  editingUpstream,
  upstreamForm,
  upstreamFormRef,
  targetValidation,
  formErrors,
  checksJson,
  allUpstreamColumns,
  upstreamColumnPopoverVisible,
  upstreamColumnsSelected,
  upstreamSearchVisible,
  allUpstreamActionButtons,
  upstreamActionsSelected,
  visibleUpstreamColumns,
  loadUpstreams,
  handleUpstreamTableChange,
  selectUpstream,
  showAddUpstreamModal,
  editUpstream,
  handleUpstreamSubmit,
  deleteUpstream,
  publishUpstream,
  openUpstreamVersionManagement,
  addUpstreamTarget,
  removeUpstreamTarget,
  getUpstreamActionButtonTitle,
  handleUpstreamAction,
  toggleChecks,
  toggleTimeout,
  togglePool,
  toggleRetries,
  toggleRetryTimeout,
  toggleHost,
  toggleScheme,
  retriesRadio,
} = useClusterUpstreams({
  clusters: computed(() => props.clusters),
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal: props.openPublishModal,
})

// Catch native input events from antdv InputNumber to force model update on clear
const onSectionInput = (e: Event) => {
  const el = e.target as HTMLInputElement
  if (el.tagName !== 'INPUT' || el.value !== '') return
  switch (el.placeholder) {
    case 'connect': upstreamForm.timeout.connect = undefined; break
    case 'send': upstreamForm.timeout.send = undefined; break
    case 'read': upstreamForm.timeout.read = undefined; break
    case 'size': upstreamForm.keepalive_pool.size = undefined; break
    case 'idle_timeout': upstreamForm.keepalive_pool.idle_timeout = undefined; break
    case 'requests': upstreamForm.keepalive_pool.requests = undefined; break
    case '秒': upstreamForm.retry_timeout = undefined; break
    case '次数': upstreamForm.retriesInput = undefined; break
  }
}

const targetColumns = [
  { title: 'IP地址', key: 'ip', width: 200 },
  { title: '端口', key: 'port', width: 120 },
  { title: '权重', key: 'weight', width: 100 },
  { title: '操作', key: 'action', width: 80 },
]

const versionModalOnPublished = async () => {
  if (versionModalType.value === 'upstream') {
    await loadUpstreams(props.cluster)
  }
}
</script>

<style scoped>
.tab-content {
  min-height: 100px;
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

/* ── Advanced sections ── */
.advanced-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.advanced-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--surface);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.section-toggle {
  margin-bottom: 10px;
  font-weight: 600;
}
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.radio-label input[type="radio"] {
  accent-color: var(--accent);
}
</style>
