<template>
  <div class="ai-page">
    <PageHeader
      title="Ansible 主机清单"
      description="维护 Edge 集群的 Ansible inventory（all.children.edge_cluster），保存后立即对节点任务生效，无需重启"
    >
      <template #actions>
        <a-tag v-if="dirty" color="warning" class="dirty-tag">有未保存修改</a-tag>
        <a-radio-group :value="viewMode" button-style="solid" size="small" :disabled="loading" @change="onViewChange">
          <a-radio-button value="table">表格视图</a-radio-button>
          <a-radio-button value="source">源码视图</a-radio-button>
        </a-radio-group>
        <a-tooltip title="放弃本地修改，重新从服务器加载">
          <a-button :loading="loading" :disabled="switching || saving" @click="reloadClicked">刷新</a-button>
        </a-tooltip>
        <a-button type="primary" :loading="saving" :disabled="!dirty || loading || switching" @click="save">
          保存生效
        </a-button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading || switching" tip="正在与服务器同步...">
      <div class="ai-body">
        <!-- 未录入平台的 IP 联动提醒条 -->
        <a-alert v-if="unmanagedIps.length" type="warning" show-icon class="stack-alert">
          <template #message>
            以下 {{ unmanagedIps.length }} 个 IP 存在于主机清单，但尚未录入节点管理
          </template>
          <template #description>
            <div class="alert-desc-row">
              <span><span class="mono">{{ unmanagedIps.join('、') }}</span>　节点任务只会操作平台已录入的节点，如需纳管请先添加。</span>
              <a @click="goNodes">前往节点管理 →</a>
            </div>
          </template>
        </a-alert>

        <!-- ── 表格视图 ── -->
        <template v-if="viewMode === 'table'">
          <a-alert v-if="unknownKeys.length && showUnknownHint" type="info" show-icon closable class="stack-alert" @close="showUnknownHint = false">
            <template #message>
              部分主机包含自定义字段：<span class="mono">{{ unknownKeys.join('、') }}</span>
            </template>
            <template #description>
              表格视图仅维护 IP 与 SSH 凭据；这些自定义字段不会丢失——保存时原样保留，完整内容可在源码视图中查看与维护。
            </template>
          </a-alert>

          <div class="card group-card">
            <div class="card-title-row">
              <span class="card-title">组级默认凭据</span>
              <span class="card-subtitle">写入 edge_cluster.vars；未单独配置凭据的主机继承此默认值</span>
            </div>
            <div class="group-form">
              <div class="group-field">
                <label>SSH 用户</label>
                <a-input
                  v-model:value="groupUser"
                  placeholder="例如 root（留空则主机需自带凭据）"
                  allow-clear
                  @change="markDirty"
                />
              </div>
              <div class="group-field">
                <label>SSH 密码（明文）</label>
                <a-input
                  v-model:value="groupPass"
                  placeholder="留空则主机需自带凭据"
                  allow-clear
                  @change="markDirty"
                />
              </div>
            </div>
            <div v-if="extraVars.length" class="group-extra-vars">
              vars 还包含其他键：<span class="mono">{{ extraVars.join('、') }}</span>（仅源码模式可维护，保存时原样保留）
            </div>
          </div>

          <div class="card">
            <div class="card-title-row table-toolbar">
              <span class="card-title">主机列表<span class="count-pill">{{ rows.length }}</span></span>
              <a-button size="small" @click="addRow">＋ 添加主机</a-button>
            </div>
            <a-table :data-source="rows" :row-key="rowKeyOf" :pagination="false" size="middle">
              <a-table-column title="IP" key="ip" width="230">
                <template #default="{ record }">
                  <a-input v-model:value="record.ip" placeholder="例如 192.168.1.10" @change="markDirty" />
                </template>
              </a-table-column>
              <a-table-column title="SSH 用户" key="user" width="200">
                <template #default="{ record }">
                  <a-input v-model:value="record.ansible_ssh_user" placeholder="留空继承组级默认" allow-clear @change="markDirty" />
                </template>
              </a-table-column>
              <a-table-column title="SSH 密码（明文）" key="pass" width="220">
                <template #default="{ record }">
                  <a-input v-model:value="record.ansible_ssh_pass" placeholder="留空继承组级默认" allow-clear @change="markDirty" />
                </template>
              </a-table-column>
              <a-table-column title="自定义字段" key="custom">
                <template #default="{ record }">
                  <a-tooltip v-if="rowUnknownKeys(record).length" :title="'仅源码模式可维护：' + rowUnknownKeys(record).join('、')">
                    <a-tag color="orange" class="custom-tag">含自定义字段</a-tag>
                  </a-tooltip>
                  <span v-else class="muted">—</span>
                </template>
              </a-table-column>
              <a-table-column title="操作" key="action" width="90" align="right">
                <template #default="{ record }">
                  <a-button type="text" danger size="small" @click="removeRow(record)">删除</a-button>
                </template>
              </a-table-column>
            </a-table>
          </div>
        </template>

        <!-- ── 源码视图 ── -->
        <template v-else>
          <a-alert v-if="sourceErrors.length" type="error" show-icon class="stack-alert">
            <template #message>源码无法解析，已阻止切换到表格视图，请先修正以下错误</template>
            <template #description>
              <pre class="error-pre">{{ sourceErrors.join('\n') }}</pre>
            </template>
          </a-alert>
          <div class="source-hint">
            源码为 inventory 文件原文（保留注释与全部自定义字段）；YAML 校验由服务端完成，保存前自动备份当前文件。
          </div>
          <MonacoEditor :model-value="sourceDraft" language="yaml" height="calc(100vh - 380px)" @update:model-value="onEditorInput" />
        </template>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { onBeforeRouteLeave } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import type { RadioChangeEvent } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import {
  getInventory,
  parseInventory,
  renderInventory,
  saveInventory,
} from '@/api/ansibleInventory'
import type { InventoryHostEntry, InventorySavePayload } from '@/api/ansibleInventory'
import {
  apiDetail,
  applyGroupCreds,
  assembleHosts,
  credString,
  extraVarKeys,
  unknownKeysOf,
} from '@/utils/ansibleInventory'

type ViewMode = 'table' | 'source'

const router = useRouter()

// ── 草稿状态：表格与源码共享同一份草稿，切换经服务端转换 ──────────────
const viewMode = ref<ViewMode>('table')
const rows = ref<InventoryHostEntry[]>([])
const baseVars = ref<Record<string, unknown>>({})
const groupUser = ref('')
const groupPass = ref('')
const sourceDraft = ref('')
const sourceSynced = ref('') // 最近一次程序化写入编辑器的文本，用于区分用户输入
const unknownKeys = ref<string[]>([])
const unmanagedIps = ref<string[]>([])

const dirty = ref(false)
const loading = ref(false)
const saving = ref(false)
const switching = ref(false)
const showUnknownHint = ref(true)
const sourceErrors = ref<string[]>([])

const extraVars = computed(() => extraVarKeys(baseVars.value))

function markDirty(): void {
  dirty.value = true
}

function rowUnknownKeys(record: InventoryHostEntry): string[] {
  return unknownKeysOf(record)
}

// 行键：WeakMap 身份键，避免用 ip 作键（新增行 IP 可能为空或临时重复）
const rowKeyMap = new WeakMap<object, number>()
let rowKeySeq = 0
function rowKeyOf(record: object): number {
  let k = rowKeyMap.get(record)
  if (k === undefined) {
    rowKeySeq += 1
    k = rowKeySeq
    rowKeyMap.set(record, k)
  }
  return k
}

// ── 加载 / 应用服务器数据 ────────────────────────────────────────────

function syncGroupCreds(): void {
  groupUser.value = credString(baseVars.value['ansible_ssh_user'])
  groupPass.value = credString(baseVars.value['ansible_ssh_pass'])
}

function applyServerStructure(hosts: InventoryHostEntry[], vars: Record<string, unknown>): void {
  rows.value = hosts.map((h) => ({ ...h }))
  baseVars.value = { ...vars }
  syncGroupCreds()
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await getInventory()
    applyServerStructure(res.data.hosts || [], res.data.vars || {})
    sourceDraft.value = res.data.raw_text || ''
    sourceSynced.value = sourceDraft.value
    unknownKeys.value = res.data.unknown_keys || []
    unmanagedIps.value = res.data.unmanaged_ips || []
    sourceErrors.value = []
    showUnknownHint.value = true
    dirty.value = false
  } catch (err: unknown) {
    message.error(apiDetail(err, '加载主机清单失败'))
  } finally {
    loading.value = false
  }
}

function reloadClicked(): void {
  if (!dirty.value) {
    void load()
    return
  }
  Modal.confirm({
    title: '放弃未保存的修改？',
    content: '刷新将从服务器重新加载清单，本地未保存的修改会丢失。',
    okText: '放弃修改并刷新',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      void load()
    },
  })
}

// ── 双模式切换（表格 ⇄ 源码，转换由服务端承担） ──────────────────────

function onViewChange(e: RadioChangeEvent): void {
  const target = e.target.value
  if (target === 'table' || target === 'source') void switchTo(target)
}

async function switchTo(target: ViewMode): Promise<void> {
  if (target === viewMode.value || switching.value || loading.value) return
  switching.value = true
  try {
    if (target === 'source') {
      // 表格 → 源码：把表格草稿渲染成 YAML 放入编辑器（渲染不做校验，总能成功）
      const res = await renderInventory(
        rows.value.map((r) => ({ ...r })),
        buildVars(),
      )
      sourceDraft.value = res.data.text
      sourceSynced.value = res.data.text
      sourceErrors.value = []
      viewMode.value = 'source'
    } else {
      // 源码 → 表格：先解析校验，失败则阻止切换并在源码视图上方标错
      const res = await parseInventory(sourceDraft.value)
      if (res.data.errors.length) {
        sourceErrors.value = res.data.errors
        message.warning('源码存在解析错误，已阻止切换，请先修正')
        return
      }
      applyServerStructure(res.data.hosts, res.data.vars)
      unknownKeys.value = res.data.unknown_keys || []
      sourceErrors.value = []
      viewMode.value = 'table'
    }
  } catch (err: unknown) {
    message.error(apiDetail(err, '视图切换失败，请稍后重试'))
  } finally {
    switching.value = false
  }
}

/** 编辑器输入：程序化赋值（与 sourceSynced 相同）不算脏。 */
function onEditorInput(value: string): void {
  sourceDraft.value = value
  if (value !== sourceSynced.value) markDirty()
}

// ── 保存载荷组装 ─────────────────────────────────────────────────────

function buildVars(): Record<string, unknown> {
  return applyGroupCreds(baseVars.value, groupUser.value.trim(), groupPass.value)
}

async function save(): Promise<void> {
  if (saving.value || !dirty.value) return
  let payload: InventorySavePayload
  if (viewMode.value === 'table') {
    const assembled = assembleHosts(rows.value)
    if (assembled.error) {
      message.warning(assembled.error)
      return
    }
    payload = { hosts: assembled.hosts, vars: buildVars() }
  } else {
    payload = { raw_text: sourceDraft.value }
  }
  saving.value = true
  try {
    await saveInventory(payload)
    message.success('已生效')
    // 成功后重新 GET 刷新双份草稿
    await load()
  } catch (err: unknown) {
    // 失败展示后端 detail（可能含 第 N 行 / 删除保护 / 409 任务互斥提示）
    message.error(apiDetail(err, '保存失败'), 8)
  } finally {
    saving.value = false
  }
}

// ── 表格行操作 ───────────────────────────────────────────────────────

function addRow(): void {
  rows.value.push({ ip: '', ansible_ssh_user: '', ansible_ssh_pass: '' })
  markDirty()
}

function removeRow(row: InventoryHostEntry): void {
  const idx = rows.value.indexOf(row)
  if (idx !== -1) rows.value.splice(idx, 1)
  markDirty()
}

function goNodes(): void {
  void router.push('/nodes')
}

// ── 未保存离开护栏 ───────────────────────────────────────────────────

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title: '有未保存的修改',
      content: '离开页面将丢失未保存的主机清单修改，确定离开吗？',
      okText: '放弃修改并离开',
      okType: 'danger',
      cancelText: '留在本页',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
})

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

function onKeyDown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (dirty.value && !saving.value && !loading.value) void save()
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeyDown)
  void load()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.ai-page { padding: 20px 24px; }

.ai-body { min-height: 320px; }

.dirty-tag { margin-right: 4px; cursor: default; }

.stack-alert { margin-bottom: 16px; }

.alert-desc-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.alert-desc-row a { white-space: nowrap; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.card-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.table-toolbar { margin-bottom: 12px; }

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}

.card-subtitle { font-size: 12px; color: var(--muted); }

.count-pill {
  display: inline-block;
  min-width: 20px;
  text-align: center;
  margin-left: 8px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  border-radius: 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--muted);
  vertical-align: 1px;
}

/* 组级默认凭据表单 */
.group-form {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.group-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
  flex: 1;
  max-width: 360px;
}
.group-field label {
  font-size: 12px;
  color: var(--muted);
}
.group-extra-vars {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

.mono { font-family: var(--font-mono); word-break: break-all; }
.muted { color: var(--muted); }

.custom-tag { cursor: help; }

.source-hint {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.error-pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
}
</style>
