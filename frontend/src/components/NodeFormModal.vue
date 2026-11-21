<template>
  <div class="modal-overlay node-form-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 720px">
      <div class="modal-header">
        <h2>{{ title }}</h2>
        <button class="modal-close" @click="emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <a-form ref="formRef" :model="form" :rules="rules" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item label="所属集群" name="cluster_id">
            <ClusterSelect v-model="form.cluster_id" :clusters="clusters" :disabled="clusterLocked" />
          </a-form-item>
          <a-form-item label="IP 地址" name="ip">
            <a-input v-model:value="form.ip" class="node-form-ip" placeholder="10.0.0.1" />
          </a-form-item>
          <a-form-item label="服务端口" name="service_port">
            <a-input-number
              v-model:value="form.service_port"
              class="node-form-service-port"
              :min="1"
              :max="65535"
              style="width: 100%"
            />
          </a-form-item>
          <a-form-item label="管理端口" name="management_port">
            <a-input-number
              v-model:value="form.management_port"
              class="node-form-management-port"
              :min="1"
              :max="65535"
              style="width: 100%"
            />
          </a-form-item>
          <a-form-item label="SSH端口" name="ssh_port">
            <a-input-number
              v-model:value="form.ssh_port"
              class="node-form-ssh-port"
              :min="1"
              :max="65535"
              style="width: 100%"
              placeholder="默认 22"
            />
          </a-form-item>
          <a-form-item label="OpenResty 安装路径" name="openresty_path">
            <a-input
              v-model:value="form.openresty_path"
              class="node-form-openresty-path"
              placeholder="/usr/local/nginx"
            />
          </a-form-item>
          <a-form-item label="Edge 安装路径" name="edge_path">
            <a-input
              v-model:value="form.edge_path"
              class="node-form-edge-path"
              placeholder="运行时路径，如 /edge/node1"
            />
          </a-form-item>
          <a-form-item label="状态" name="status">
            <a-select v-model:value="form.status" class="node-form-status">
              <a-select-option :value="1">启用</a-select-option>
              <a-select-option :value="0">禁用</a-select-option>
            </a-select>
            <div class="form-hint">
              禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询
            </div>
          </a-form-item>
        </a-form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="emit('close')">取消</button>
        <button class="btn btn-primary node-form-submit" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : isEdit ? '保存' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 节点单条新增/编辑共享表单（B2b-1，对齐 B1 的 UpstreamFormModal/RouteFormModal 先例）。
 *
 * 取代两处内联实现：统一管理面板节点 Tab（原 ClusterNodes，现为 NodeList 的 scoped 形态）、
 * 节点管理页 NodeList 的旧内联表单。
 * 字段 = 两侧并集（页面多「所属集群」），校验取两侧更严格者（AntDV rules 统一）：
 * - IP：必填 + IPv4 正则
 * - 服务端口 / 管理端口：必填 + 1-65535；SSH 端口可选（同样 1-65535）
 * - OpenResty 安装路径 / Edge 安装路径：必填 + `/` 开头 + 末尾非 `/` + 最多 255 字符
 * 提交（POST/PUT /clusters/{id}/nodes）与成功后反馈收进组件，宿主只负责刷新列表。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import api from '@/api'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { getApiErrorMessage } from '@/utils/error'

interface NodeLike {
  id?: number
  cluster_id?: number
  ip?: string
  service_port?: number
  management_port?: number
  ssh_port?: number
  edge_path?: string
  openresty_path?: string
  status?: number
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    /** 编辑源记录；复制态下作为预填源（配合 copyingNode） */
    editingNode?: NodeLike | null
    /** 复制态：以 editingNode 为模板新建（IP 清空、标题「复制节点」、提交走 POST） */
    copyingNode?: boolean
    clusters: { id: number; name: string; display_name?: string }[]
    /** 新增态预选集群（面板场景：当前集群） */
    defaultClusterId?: number | null
    /** 锁定集群选择（面板场景：集群由上下文决定；编辑态本来已禁用） */
    lockCluster?: boolean
  }>(),
  {
    editingNode: null,
    copyingNode: false,
    defaultClusterId: null,
    lockCluster: false,
  },
)

const emit = defineEmits<{
  close: []
  saved: []
}>()

/** IPv4 校验与服务端同口径（与 utils/nodeImport 一致） */
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

const formRef = ref()
const submitting = ref(false)

const form = reactive({
  cluster_id: '' as number | string,
  ip: '',
  service_port: 80 as number | null,
  management_port: 9180 as number | null,
  ssh_port: 22 as number | null,
  edge_path: '',
  openresty_path: '',
  status: 1,
})

const isEdit = computed(() => !!props.editingNode && !props.copyingNode)
const title = computed(() => (props.copyingNode ? '复制节点' : isEdit.value ? '编辑节点' : '添加节点'))
/** 集群锁定：面板恒锁定；页面仅编辑态禁用（新增/复制可改） */
const clusterLocked = computed(() => props.lockCluster || isEdit.value)

function requiredPort(label: string, optional = false) {
  return (_rule: Rule, value: number | string | null | undefined): Promise<void> => {
    if (value === null || value === undefined || value === '') {
      return optional ? Promise.resolve() : Promise.reject(`请输入${label}`)
    }
    const num = Number(value)
    if (!Number.isInteger(num) || num < 1 || num > 65535) {
      return Promise.reject('请输入有效的端口号 (1-65535)')
    }
    return Promise.resolve()
  }
}

function validatePath(label: string) {
  return (_rule: Rule, value: string | undefined): Promise<void> => {
    const v = (value || '').trim()
    if (!v) return Promise.reject(`请输入 ${label}`)
    if (!v.startsWith('/')) return Promise.reject('路径必须以 / 开头')
    if (v.endsWith('/')) return Promise.reject('路径末尾不能为 /')
    if (v.length > 255) return Promise.reject('最多255个字符')
    return Promise.resolve()
  }
}

const rules: Record<string, Rule[]> = {
  cluster_id: [
    {
      required: true,
      validator: (_rule: Rule, value: number | string | null | undefined): Promise<void> =>
        value === '' || value === null || value === undefined ? Promise.reject('请选择所属集群') : Promise.resolve(),
    },
  ],
  ip: [
    {
      validator: (_rule: Rule, value: string | undefined): Promise<void> => {
        const v = (value || '').trim()
        if (!v) return Promise.reject('请输入 IP 地址')
        if (!IP_PATTERN.test(v)) return Promise.reject('IP 地址格式不正确')
        return Promise.resolve()
      },
    },
  ],
  service_port: [{ required: true, validator: requiredPort('服务端口') }],
  management_port: [{ required: true, validator: requiredPort('管理端口') }],
  ssh_port: [{ validator: requiredPort('SSH端口', true) }],
  openresty_path: [{ required: true, validator: validatePath('OpenResty 安装路径') }],
  edge_path: [{ required: true, validator: validatePath('Edge 安装路径') }],
  status: [{ required: true, message: '请选择状态' }],
}

function resetForm() {
  const source = props.editingNode
  form.cluster_id =
    props.defaultClusterId ?? (source?.cluster_id !== undefined && source?.cluster_id !== null ? source.cluster_id : '')
  form.ip = props.copyingNode ? '' : source?.ip || ''
  form.service_port = source?.service_port ?? 80
  form.management_port = source?.management_port ?? 9180
  form.ssh_port = source?.ssh_port ?? 22
  form.edge_path = source?.edge_path || ''
  form.openresty_path = source?.openresty_path || ''
  form.status = source?.status ?? 1
}

watch(
  [() => props.visible, () => props.editingNode, () => props.copyingNode],
  () => {
    if (!props.visible) return
    resetForm()
    nextTick(() => formRef.value?.clearValidate())
  },
  { immediate: true },
)

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      ip: form.ip.trim(),
      service_port: Number(form.service_port),
      management_port: Number(form.management_port),
      ssh_port: form.ssh_port === null || form.ssh_port === undefined ? undefined : Number(form.ssh_port),
      edge_path: form.edge_path.trim(),
      openresty_path: form.openresty_path.trim(),
      status: form.status,
    }
    if (isEdit.value && props.editingNode?.id !== undefined) {
      const clusterId = props.editingNode.cluster_id ?? Number(form.cluster_id)
      await api.put(`/clusters/${clusterId}/nodes/${props.editingNode.id}`, payload)
      message.success('节点已更新')
    } else {
      await api.post(`/clusters/${Number(form.cluster_id)}/nodes`, payload)
      message.success('节点已添加')
    }
    emit('saved')
    emit('close')
  } catch (error: unknown) {
    message.error(getApiErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>
