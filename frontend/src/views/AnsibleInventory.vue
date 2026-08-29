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
        <!-- 清单文件解析失败提示（文件存在但无法解析时展示真实原因） -->
        <a-alert v-if="loadErrors.length" type="error" show-icon class="stack-alert">
          <template #message>清单文件解析失败，主机列表无法加载</template>
          <template #description>
            <pre class="error-pre">{{ loadErrors.join('\n') }}</pre>
            <div class="alert-desc-row">
              <span>可在源码视图中修正后保存，或直接修复服务器上的 inventory 文件。</span>
            </div>
          </template>
        </a-alert>

        <!-- 未录入平台的 IP 联动提醒条 -->
        <a-alert v-if="unmanagedIps.length" type="warning" show-icon class="stack-alert">
          <template #message> 以下 {{ unmanagedIps.length }} 个 IP 存在于主机清单，但尚未录入节点管理 </template>
          <template #description>
            <div class="alert-desc-row">
              <span
                ><span class="mono">{{ unmanagedIps.join('、') }}</span
                >&#x3000;节点任务只会操作平台已录入的节点，如需纳管请先添加。</span
              >
              <a @click="goNodes">前往节点管理 →</a>
            </div>
          </template>
        </a-alert>

        <!-- ── 表格视图 ── -->
        <template v-if="viewMode === 'table'">
          <a-alert
            v-if="unknownKeys.length && showUnknownHint"
            type="info"
            show-icon
            closable
            class="stack-alert"
            @close="showUnknownHint = false"
          >
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
                <a-input v-model:value="groupPass" placeholder="留空则主机需自带凭据" allow-clear @change="markDirty" />
              </div>
            </div>
            <div v-if="extraVars.length" class="group-extra-vars">
              vars 还包含其他键：<span class="mono">{{ extraVars.join('、') }}</span
              >（仅源码模式可维护，保存时原样保留）
            </div>
          </div>

          <div class="card">
            <div class="card-title-row table-toolbar">
              <span class="card-title"
                >主机列表<span class="count-pill">{{ rows.length }}</span></span
              >
              <a-button v-if="viewMode === 'table'" size="small" @click="openBulkImport">批量导入</a-button>
            </div>
            <a-table
              :data-source="rows"
              :row-key="rowKeyOf"
              :row-class-name="rowClassName"
              :pagination="false"
              size="middle"
              :expanded-row-keys="expandedKeys"
              @expanded-rows-change="onExpandedChange"
            >
              <template #expandedRowRender="{ record }">
                <div class="advanced-grid">
                  <div v-for="def in ADVANCED_FIELDS" :key="def.key" class="advanced-field">
                    <label class="advanced-label">
                      {{ def.label }}
                      <a-tooltip v-if="def.hint" :title="def.hint"><span class="hint-mark">?</span></a-tooltip>
                      <a-popover v-if="def.helpRef" trigger="click" placement="bottom" overlay-class="ssh-help-popover">
                        <template #content>
                          <div style="max-height: 360px; overflow: auto; min-width: 360px">
                            <div style="font-weight: 600; margin-bottom: 8px">常用参数速查</div>
                            <table style="width: 100%; font-size: 12px; border-collapse: collapse">
                              <tr style="background: #fafafa">
                                <td style="padding: 4px 8px; font-weight: 600">参数</td>
                                <td style="padding: 4px 8px">含义</td>
                              </tr>
                              <tr v-for="r in def.helpRef" :key="r.param" style="border-bottom: 1px solid #f0f0f0">
                                <td
                                  style="padding: 4px 8px; font-family: monospace; white-space: nowrap; cursor: pointer"
                                  :title="'点击复制：' + r.param"
                                  @click="copyText(r.param)"
                                >
                                  {{ r.param }}
                                </td>
                                <td style="padding: 4px 8px">{{ r.desc }}</td>
                              </tr>
                            </table>
                          </div>
                        </template>
                        <span class="hint-mark" style="cursor: pointer">📋</span>
                      </a-popover>
                    </label>
                    <a-input-number
                      v-if="def.type === 'number'"
                      v-model:value="record[def.key]"
                      style="width: 100%"
                      :min="1"
                      :max="65535"
                      placeholder="未设置"
                      @change="markDirty"
                    />
                    <a-switch v-else-if="def.type === 'switch'" v-model:checked="record[def.key]" @change="markDirty" />
                    <a-auto-complete
                      v-else-if="def.type === 'select'"
                      :value="asString(record[def.key])"
                      :options="def.options?.map((o) => ({ value: o }))"
                      style="width: 100%"
                      placeholder="留空继承默认"
                      allow-clear
                      @change="(v: string) => setAdvanced(record, def.key, v)"
                    />
                    <a-input-password
                      v-else-if="def.type === 'password'"
                      :value="asString(record[def.key])"
                      :placeholder="def.placeholder || '未设置'"
                      :disabled="def.key === 'ansible_become_pass' && !record.ansible_become"
                      allow-clear
                      autocomplete="new-password"
                      @change="(e: Event) => setAdvanced(record, def.key, (e.target as HTMLInputElement).value)"
                    />
                    <a-input
                      v-else
                      :value="asString(record[def.key])"
                      :placeholder="def.placeholder || '未设置'"
                      :disabled="def.key === 'ansible_become_user' && !record.ansible_become"
                      allow-clear
                      @change="(e: Event) => setAdvanced(record, def.key, (e.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
              </template>
              <a-table-column title="IP" key="ip" width="230">
                <template #default="{ record, index }">
                  <a-input
                    v-model:value="record.ip"
                    placeholder="例如 192.168.1.10"
                    @change="markDirty"
                    @keydown.enter="index === rows.length - 1 ? onLastRowEnter($event) : undefined"
                  />
                </template>
              </a-table-column>
              <a-table-column title="SSH 用户" key="user" width="200">
                <template #default="{ record }">
                  <a-input
                    v-model:value="record.ansible_ssh_user"
                    placeholder="留空继承组级默认"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="SSH 密码（明文）" key="pass" width="220">
                <template #default="{ record }">
                  <a-input
                    v-model:value="record.ansible_ssh_pass"
                    placeholder="留空继承组级默认"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="高级" key="adv" width="80">
                <template #default="{ record }">
                  <a-tooltip
                    :title="
                      rowHasAdvanced(record)
                        ? '已配置高级连接变量'
                        : rowUnknownKeys(record).length
                          ? '仅源码模式可维护：' + rowUnknownKeys(record).join('、')
                          : ''
                    "
                  >
                    <a-button type="text" size="small" @click="toggleExpand(record)">
                      高级
                      <span v-if="rowUnknownKeys(record).length" class="orange-dot" />
                    </a-button>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="操作" key="action" width="90" align="right">
                <template #default="{ record }">
                  <a-button type="text" danger size="small" @click="removeRow(record)">删除</a-button>
                </template>
              </a-table-column>
            </a-table>
            <button class="add-row-dashed" @click="appendAndLocate">＋ 添加主机</button>
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
          <MonacoEditor
            :model-value="sourceDraft"
            language="yaml"
            height="calc(100vh - 380px)"
            @update:model-value="onEditorInput"
          />
        </template>
      </div>
    </a-spin>

    <!-- 批量导入弹窗 -->
    <a-modal
      v-model:open="bulkImportVisible"
      title="批量导入主机"
      :ok-button-props="{ disabled: bulkImportResult.errors.length > 0 }"
      ok-text="确认导入"
      cancel-text="取消"
      @ok="confirmBulkImport"
    >
      <a-textarea
        v-model:value="bulkImportText"
        :rows="10"
        placeholder="每行一条：IP [SSH用户] [SSH密码]（空白分隔，支持 # 注释）"
      />
      <div v-if="bulkImportText" class="bulk-preview">
        <div v-if="bulkImportResult.duplicatesInText" class="bulk-hint">
          文本内 {{ bulkImportResult.duplicatesInText }} 条重复已合并
        </div>
        <div v-if="bulkImportResult.errors.length === 0 && bulkImportResult.entries.length">
          <span v-if="bulkImportResult.entries.some((e) => rows.some((r) => r.ip === e.ip))" class="bulk-hint">
            将覆盖 {{ bulkImportResult.entries.filter((e) => rows.some((r) => r.ip === e.ip)).length }} 条现有主机凭据
          </span>
        </div>
        <div v-for="err in bulkImportResult.errors" :key="err.line" class="bulk-error">
          第 {{ err.line }} 行：{{ err.reason }}
        </div>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { onBeforeRouteLeave } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import type { RadioChangeEvent } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import { getInventory, parseInventory, renderInventory, saveInventory } from '@/api/ansibleInventory'
import type { InventoryHostEntry, InventorySavePayload } from '@/api/ansibleInventory'
import {
  ADVANCED_FIELDS,
  apiDetail,
  applyGroupCreds,
  assembleHosts,
  credString,
  extraVarKeys,
  mergeBulkEntries,
  parseBulkHosts,
  toBool,
  unknownKeysOf,
  validateAdvancedField,
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
const loadErrors = ref<string[]>([])

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

// ── 高级设置（常用连接变量）──────────────────────────────────────────
const expandedKeys = ref<number[]>([])

function rowHasAdvanced(record: InventoryHostEntry): boolean {
  return ADVANCED_FIELDS.some((f) => {
    const v = record[f.key]
    return v !== undefined && v !== null && v !== ''
  })
}

function toggleExpand(record: object): void {
  const k = rowKeyOf(record)
  expandedKeys.value = expandedKeys.value.includes(k)
    ? expandedKeys.value.filter((x) => x !== k)
    : [...expandedKeys.value, k]
}

function onExpandedChange(keys: (number | string)[]): void {
  expandedKeys.value = keys.map(Number)
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function setAdvanced(record: InventoryHostEntry, key: string, value: unknown): void {
  record[key] = value
  markDirty()
}

/** 复制参数到剪贴板（浏览器 API）。 */
function copyText(text: string): void {
  navigator.clipboard?.writeText(text).then(() => message.success('已复制'))
}

/** 保存前逐行校验高级字段，返回错误信息列表（空数组=通过）。 */
function validateRowsAdvanced(): string[] {
  const errors: string[] = []
  rows.value.forEach((row, idx) => {
    for (const def of ADVANCED_FIELDS) {
      const err = validateAdvancedField(def.key, row[def.key])
      if (err) errors.push(`第 ${idx + 1} 行（${row.ip || '未填 IP'}）：${err}`)
    }
  })
  return errors
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
  rows.value = hosts.map((h) => {
    const row: InventoryHostEntry = { ...h }
    // 源码模式可能写出的字符串形态规范化，供表格控件直接绑定
    if ('ansible_port' in row) {
      const n = Number(row['ansible_port'])
      if (Number.isFinite(n) && String(n) === String(row['ansible_port']).trim()) {
        row['ansible_port'] = n
      }
    }
    if ('ansible_become' in row) {
      row['ansible_become'] = toBool(row['ansible_become'])
    }
    return row
  })
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
    loadErrors.value = res.data.errors || []
    sourceErrors.value = []
    // 文件解析失败时表格为空，强制进入源码视图展示真实文件内容供修复
    // （避免切到源码时被空表格渲染出的骨架覆盖掉原文）
    if (loadErrors.value.length) viewMode.value = 'source'
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
    const advancedErrors = validateRowsAdvanced()
    if (advancedErrors.length) {
      message.warning(advancedErrors.join('；'))
      return
    }
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

/** 待定位行的行键 — nextTick 后滚动 + 高亮 + 聚焦 IP 输入框 */
const pendingLocateKey = ref<number | null>(null)
const highlightKeys = ref<number[]>([])

/** 追加空白行并定位（底部按钮与 Enter 续录共用） */
function appendAndLocate(): void {
  const row: InventoryHostEntry = { ip: '', ansible_ssh_user: '', ansible_ssh_pass: '' }
  rows.value.push(row)
  markDirty()
  const key = rowKeyOf(row)
  void nextTick(() => {
    // 滚动定位
    const el = document.querySelector(`tr[data-row-key="${key}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 高亮 2s
    highlightKeys.value = [...highlightKeys.value, key]
    setTimeout(() => {
      highlightKeys.value = highlightKeys.value.filter((k) => k !== key)
    }, 2000)
    // 聚焦新行 IP 输入框
    const ipInput = el?.querySelector<HTMLInputElement>('input')
    ipInput?.focus()
  })
}

/** 行高亮 class 名 */
function rowClassName(record: InventoryHostEntry): string {
  return highlightKeys.value.includes(rowKeyOf(record)) ? 'ai-row-highlight' : ''
}

/** Enter 续录：仅最后一行且 IP 已填写时触发 */
function onLastRowEnter(e: KeyboardEvent): void {
  if (e.isComposing) return
  if (rows.value.length === 0) return
  const last = rows.value[rows.value.length - 1]
  if (!last.ip) return
  appendAndLocate()
}

// ── 批量导入 ───────────────────────────────────────────────────────

const bulkImportVisible = ref(false)
const bulkImportText = ref('')

const bulkImportResult = computed(() => parseBulkHosts(bulkImportText.value))

function openBulkImport(): void {
  bulkImportVisible.value = true
  bulkImportText.value = ''
}

function confirmBulkImport(): void {
  const { entries } = bulkImportResult.value
  if (bulkImportResult.value.errors.length) return
  const { rows: merged, overwrittenCount } = mergeBulkEntries(rows.value, entries)
  rows.value = merged
  if (overwrittenCount > 0) {
    message.info(`已覆盖 ${overwrittenCount} 条现有主机的凭据`)
  }
  markDirty()
  bulkImportVisible.value = false
  bulkImportText.value = ''
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
.ai-page {
  padding: 20px 24px;
}

.ai-body {
  min-height: 320px;
}

.dirty-tag {
  margin-right: 4px;
  cursor: default;
}

.stack-alert {
  margin-bottom: 16px;
}

.alert-desc-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.alert-desc-row a {
  white-space: nowrap;
}

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
.table-toolbar {
  margin-bottom: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}

.card-subtitle {
  font-size: 12px;
  color: var(--muted);
}

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

.mono {
  font-family: var(--font-mono);
  word-break: break-all;
}
.muted {
  color: var(--muted);
}

.custom-tag {
  cursor: help;
}

.orange-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fa8c16;
  margin-left: 4px;
  vertical-align: super;
}

.add-row-dashed {
  width: 100%;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  padding: 10px 0;
  text-align: center;
  border-radius: var(--radius-md);
  transition:
    border-color 0.2s,
    color 0.2s;
}
.add-row-dashed:hover {
  border-color: #1677ff;
  color: #1677ff;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px 16px;
  padding: 4px 8px;
}
.advanced-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.advanced-label {
  font-size: 12px;
  color: var(--text-secondary, #888);
}
.hint-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 10px;
  cursor: help;
}

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

/* 高亮闪烁动画 */
:deep(.ai-row-highlight) {
  animation: row-highlight-flash 2s ease-out;
}
@keyframes row-highlight-flash {
  0% {
    background-color: #fff7e6;
  }
  100% {
    background-color: transparent;
  }
}

/* 批量导入预览 */
.bulk-preview {
  margin-top: 12px;
  font-size: 13px;
}
.bulk-hint {
  color: #fa8c16;
  margin-bottom: 4px;
}
.bulk-error {
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.8;
}
</style>
