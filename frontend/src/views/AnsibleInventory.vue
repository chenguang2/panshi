<template>
  <div class="inventory-page">
    <PageHeader
      title="Ansible 主机清单"
      description="维护 Edge 集群的 Ansible inventory（all.children.edge_cluster），保存后立即对节点任务生效，无需重启；SSH 密码按平台约定明文存储与展示，不做掩码。"
    >
      <template #stats>
        <PageStatBadges :items="statBadges" />
      </template>
      <template #actions>
        <div class="seg">
          <button
            type="button"
            class="seg-opt all"
            :class="{ active: viewMode === 'table' }"
            :aria-pressed="viewMode === 'table'"
            :disabled="loading || switching"
            @click="setView('table')"
          >
            表格视图
          </button>
          <button
            type="button"
            class="seg-opt all"
            :class="{ active: viewMode === 'source' }"
            :aria-pressed="viewMode === 'source'"
            :disabled="loading || switching"
            @click="setView('source')"
          >
            源码视图
          </button>
        </div>
        <button class="btn btn-secondary" @click="openBackups"><HistoryOutlined /> 恢复记录</button>
        <button
          class="btn btn-secondary"
          title="放弃本地修改，重新从服务器加载"
          :disabled="loading || switching || saving"
          @click="reloadClicked"
        >
          <ReloadOutlined /> {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button class="btn btn-primary" :disabled="!dirty || loading || switching" @click="save">
          <StrokeIcon name="check" :size="13" /> {{ saving ? '保存中…' : '保存生效' }}
        </button>
      </template>
    </PageHeader>

    <a-spin :spinning="loading || switching" tip="正在与服务器同步...">
      <div class="inventory-body">
        <!-- 清单文件解析失败提示（文件存在但无法解析时展示真实原因） -->
        <a-alert v-if="loadErrors.length" type="error" show-icon>
          <template #message>清单文件解析失败，主机列表无法加载</template>
          <template #description>
            <pre class="error-pre">{{ loadErrors.join('\n') }}</pre>
            <div class="alert-desc-row">
              <span>可在源码视图中修正后保存，或直接修复服务器上的 inventory 文件。</span>
            </div>
          </template>
        </a-alert>

        <!-- 未录入平台的 IP 联动提醒：单行（设计页 .alert 单行形态，压掉原双行大框） -->
        <div v-if="unmanagedIps.length" class="alert alert-warning inv-notice">
          <span class="alert-icon"><StrokeIcon name="warning" :size="14" /></span>
          <div class="alert-content">
            <b>{{ unmanagedIps.length }} 个 IP 需要纳管</b>：<span class="mono">{{ unmanagedIps.join('、') }}</span>
            存在于主机清单，但尚未录入节点管理 —— 节点任务只会操作平台已录入的节点。
          </div>
          <a class="inv-link" @click="goNodes">前往节点管理 →</a>
        </div>

        <!-- ── 表格视图 ── -->
        <template v-if="viewMode === 'table'">
          <!-- 卡片外壳：card-header（全局）+ 全局 table-container 表格，与数据库管理页同款 -->
          <div class="table-container l5-card">
            <div class="card-header">
              <div class="card-heading">
                <h3>组级默认凭据</h3>
                <span class="card-subtitle"
                  >写入 edge_cluster.vars；未单独配置凭据的主机继承此默认值；密码按平台约定明文存储</span
                >
              </div>
              <code class="inv-path">inventory/host → all.children.edge_cluster.vars</code>
            </div>
            <a-table
              :data-source="groupCredRows"
              :pagination="false"
              size="middle"
              row-key="node"
              :table-layout="'fixed'"
              :show-expand-column="false"
              :scroll="{ x: 906 }"
              :expanded-row-keys="groupExpandedKeys"
              @expanded-rows-change="onGroupExpandedChange"
            >
              <template #expandedRowRender>
                <AnsibleAdvancedFields :values="baseVars" :errors="groupAdvancedErrors" @change="setGroupAdvanced" />
              </template>
              <!-- 展开触发列（antd 展开列已关，列序与设计页一致：高级 → 字段 → 用户 → 密码 → 操作） -->
              <a-table-column title="" key="advanced" :width="86">
                <template #default>
                  <a-tooltip :title="groupAdvancedTitle">
                    <button
                      type="button"
                      class="adv-expand-icon"
                      :class="{ expanded: groupRowExpanded }"
                      :aria-expanded="groupRowExpanded ? 'true' : 'false'"
                      aria-label="高级连接变量"
                      @click="toggleGroupExpand"
                    >
                      <SettingOutlined style="font-size: 13px" />
                      <span class="adv-text">高级</span>
                    </button>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="字段" key="node" :width="200">
                <template #default="{ record }">
                  <span class="mono">{{ record.node }}</span>
                </template>
              </a-table-column>
              <a-table-column title="SSH 用户" key="user" :width="300">
                <template #default>
                  <a-input
                    v-model:value="groupUser"
                    class="inv-inp"
                    placeholder="例如 root（留空则主机需自带凭据）"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="SSH 密码" key="pass" :width="320">
                <template #default>
                  <a-input
                    v-model:value="groupPass"
                    class="inv-inp"
                    placeholder="留空则主机需自带凭据"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="操作" key="action" align="right">
                <template #default>
                  <div class="action-cell">
                    <button type="button" class="inv-danger" :disabled="groupVarsEmpty" @click="deleteGroupVars">
                      删除
                    </button>
                  </div>
                </template>
              </a-table-column>
            </a-table>
            <div v-if="extraVars.length" class="group-extra-vars">
              vars 还包含其他键：<span class="mono">{{ extraVars.join('、') }}</span
              >（仅源码模式可维护，保存时原样保留）
            </div>
          </div>

          <div class="table-container l5-card">
            <div class="card-header">
              <div class="card-heading">
                <h3>
                  主机列表<span class="count-pill">{{ rows.length }}</span>
                </h3>
                <span class="card-subtitle">留空 SSH 用户或密码即继承组级默认</span>
              </div>
              <button class="btn btn-secondary btn-sm" @click="openBulkImport">
                <StrokeIcon name="upload" :size="12" /> 批量导入
              </button>
            </div>
            <a-table
              :data-source="rows"
              :row-key="rowKeyOf"
              :row-class-name="rowClassName"
              :pagination="false"
              size="middle"
              :table-layout="'fixed'"
              :show-expand-column="false"
              :scroll="{ x: 771 }"
              :expanded-row-keys="expandedKeys"
              @expanded-rows-change="onExpandedChange"
            >
              <template #expandedRowRender="{ record }">
                <AnsibleAdvancedFields
                  :values="record"
                  :errors="rowAdvancedErrors(rowKeyOf(record))"
                  @change="(key, value) => setAdvanced(record, key, value)"
                />
              </template>
              <a-table-column title="#" key="index" :width="45">
                <template #default="{ index }">
                  <span class="inv-idx">{{ index + 1 }}</span>
                </template>
              </a-table-column>
              <a-table-column title="" key="advanced" :width="86">
                <template #default="{ record }">
                  <a-tooltip :title="rowAdvancedTitle(record)">
                    <button
                      type="button"
                      class="adv-expand-icon"
                      :class="{ expanded: isRowExpanded(record) }"
                      :aria-expanded="isRowExpanded(record) ? 'true' : 'false'"
                      aria-label="高级连接变量"
                      @click="toggleExpand(record)"
                    >
                      <SettingOutlined style="font-size: 13px" />
                      <span class="adv-text">高级</span>
                      <span v-if="rowUnknownKeys(record).length" class="orange-dot" />
                    </button>
                  </a-tooltip>
                </template>
              </a-table-column>
              <a-table-column title="IP" key="ip" :width="190">
                <template #default="{ record, index }">
                  <a-input
                    v-model:value="record.ip"
                    class="inv-inp"
                    placeholder="例如 192.168.1.10"
                    @change="markDirty"
                    @keydown.enter="index === rows.length - 1 ? onLastRowEnter($event) : undefined"
                  />
                  <span v-if="inheritsGroupCreds(record)" class="inv-inherit"
                    >继承组级凭据 <b>{{ groupUser || '（未配置用户）' }}</b></span
                  >
                </template>
              </a-table-column>
              <a-table-column title="SSH 用户" key="user" :width="210">
                <template #default="{ record }">
                  <a-input
                    v-model:value="record.ansible_ssh_user"
                    class="inv-inp"
                    :placeholder="groupUser ? `继承 ${groupUser}` : '留空继承组级默认'"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="SSH 密码" key="pass" :width="240">
                <template #default="{ record }">
                  <a-input
                    v-model:value="record.ansible_ssh_pass"
                    class="inv-inp"
                    :placeholder="groupPass ? '继承组级密码' : '留空继承组级默认'"
                    allow-clear
                    @change="markDirty"
                  />
                </template>
              </a-table-column>
              <a-table-column title="操作" key="action" align="right">
                <template #default="{ record }">
                  <div class="action-cell">
                    <button type="button" class="inv-danger" @click="removeRow(record)">删除</button>
                  </div>
                </template>
              </a-table-column>
            </a-table>
            <button class="add-row-dashed" @click="appendAndLocate">＋ 添加主机</button>

            <!-- 条件态：清单里存在表外自定义字段时提示（常驻信息，不做成警告大框） -->
            <div v-if="unknownKeys.length" class="inv-note">
              <StrokeIcon name="inbox" :size="12" />
              另有 {{ unknownKeys.length }} 个自定义字段
              <code v-for="k in unknownKeys" :key="k">{{ k }}</code>
              —— 仅源码视图可维护，保存时原样保留。
            </div>

            <div class="inv-statusbar">
              <span v-if="lastModified"
                >清单最后修改 <b>{{ formatDateTime(lastModified) }}</b></span
              >
              <span v-if="dirty" class="inv-dirty">● 有未保存修改</span>
              <span class="inv-spacer"></span>
              <router-link
                v-if="canViewAudit"
                :to="{ path: '/audit-log', query: { resource: 'ansible_inventory' } }"
                class="inv-link"
                >操作日志 →</router-link
              >
            </div>
          </div>
        </template>

        <!-- ── 源码视图 ── -->
        <template v-else>
          <a-alert v-if="sourceErrors.length" type="error" show-icon>
            <template #message>源码无法解析，已阻止切换到表格视图，请先修正以下错误</template>
            <template #description>
              <pre class="error-pre">{{ sourceErrors.join('\n') }}</pre>
            </template>
          </a-alert>
          <div class="card">
            <div class="card-header">
              <div class="card-heading">
                <h3>清单源码</h3>
                <span class="card-subtitle"
                  >inventory 文件原文，保留注释与全部自定义字段；YAML 校验由服务端完成，保存前自动备份当前文件。</span
                >
              </div>
              <span class="inv-chip">{{ sourceLineCount }} 行 / {{ sourceSizeText }}</span>
            </div>
            <div class="card-body">
              <MonacoEditor
                :model-value="sourceDraft"
                language="yaml"
                height="520px"
                @update:model-value="onEditorInput"
              />
            </div>
            <div class="inv-statusbar">
              <span
                >内容来自 <b>backend/ansible/inventory/host</b
                ><template v-if="lastModified">
                  · 最后保存 <b>{{ formatDateTime(lastModified) }}</b></template
                ></span
              >
              <span v-if="dirty" class="inv-dirty">● 有未保存修改</span>
              <span class="inv-spacer"></span>
              <span>YAML 校验由服务端完成 · 保存前自动备份</span>
            </div>
          </div>
        </template>
      </div>
    </a-spin>

    <!-- 恢复记录抽屉：保存时自动备份的列表 / 只读预览 / 一键恢复 -->
    <a-drawer v-model:open="backupsOpen" title="恢复记录" width="560" placement="right">
      <div class="bk-list">
        <a-spin :spinning="backupsLoading" tip="加载备份列表...">
          <div v-if="!backupsLoading && backups.length === 0" class="bk-empty">
            暂无备份——每次保存时会自动备份当前清单（保留最近 10 份）。
          </div>
          <div v-for="bk in backups" :key="bk.name" class="bk-item" :class="{ expanded: previewName === bk.name }">
            <div class="bk-row">
              <div class="bk-meta">
                <span class="bk-time">{{ formatDateTime(bk.saved_at) }}</span>
                <span class="bk-size">{{ formatFileSize(bk.size_bytes) }}</span>
              </div>
              <div class="bk-actions">
                <button class="btn btn-secondary btn-sm" @click="togglePreview(bk.name)">
                  {{ previewName === bk.name ? '收起' : '查看' }}
                </button>
                <button class="btn btn-danger btn-sm" @click="restoreClicked(bk)">恢复此备份</button>
              </div>
            </div>
            <pre v-if="previewName === bk.name" class="bk-preview">{{ previewText }}</pre>
          </div>
        </a-spin>
      </div>
    </a-drawer>

    <!-- 批量导入弹窗：平台统一 .modal 解剖（与「添加节点」同款：品牌淡蓝头部 + 右上 × + 页脚取消/主操作） -->
    <div class="modal-overlay" :style="{ display: bulkImportVisible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 600px">
        <div class="modal-header">
          <h2>批量导入主机</h2>
          <button class="modal-close" aria-label="关闭批量导入" @click="closeBulkImport">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">主机列表<span class="required">*</span></label>
            <textarea
              v-model="bulkImportText"
              class="form-input bulk-import-textarea"
              rows="8"
              spellcheck="false"
              placeholder="每行一条：主机键 [SSH用户] [SSH密码]（主机键为 IP 或主机名；支持 # 注释）"
            ></textarea>
            <div class="form-hint">
              每行一条：主机键 [SSH 用户] [SSH 密码]；主机键可为 IP 或主机名，支持 # 注释行。留空凭据即继承组级默认。
            </div>
          </div>
          <div v-if="bulkImportText" class="bulk-preview">
            <div v-if="bulkImportResult.duplicatesInText" class="bulk-hint">
              文本内 {{ bulkImportResult.duplicatesInText }} 条重复已合并
            </div>
            <div v-if="bulkSummary" class="bulk-summary">{{ bulkSummary }}</div>
            <div v-for="w in bulkHostnameWarnings" :key="w.ip" class="bulk-warn">
              第 {{ w.line }} 行：主机键 {{ w.ip }} 不是 IP，将按主机名原样保存
            </div>
            <div v-for="err in bulkImportResult.errors" :key="err.line" class="bulk-error">
              第 {{ err.line }} 行：{{ err.reason }}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeBulkImport">取消</button>
          <button class="btn btn-primary" :disabled="bulkImportResult.errors.length > 0" @click="confirmBulkImport">
            确认导入
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRaw } from 'vue'
import { message } from 'ant-design-vue'
import { HistoryOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { onBeforeRouteLeave } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import AnsibleAdvancedFields from '@/components/AnsibleAdvancedFields.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import {
  getInventory,
  parseInventory,
  renderInventory,
  saveInventory,
  listBackups,
  readBackupContent,
  restoreBackup,
} from '@/api/ansibleInventory'
import type { InventoryHostEntry, InventorySavePayload, InventoryBackup } from '@/api/ansibleInventory'
import { formatDateTime, formatFileSize } from '@/utils/format'
import {
  ADVANCED_FIELDS,
  apiDetail,
  applyGroupCreds,
  assembleHosts,
  collectAdvancedErrors,
  credString,
  extraVarKeys,
  isEmptyStructureParse,
  mergeBulkEntries,
  parseBulkHosts,
  toBool,
  unknownKeysOf,
  validateAdvancedField,
} from '@/utils/ansibleInventory'

type ViewMode = 'table' | 'source'

const router = useRouter()
const authStore = useAuthStore()
/** 「操作日志」入口仅对持 audit_logs 权限的用户可见（审计页路由同门控） */
const canViewAudit = computed(() => authStore.hasPermission('audit_logs'))

// ── 草稿状态：表格与源码共享同一份草稿，切换经服务端转换 ──────────────
const viewMode = ref<ViewMode>('table')
const rows = ref<InventoryHostEntry[]>([])
const baseVars = ref<Record<string, unknown>>({})
const groupUser = ref('')
const groupPass = ref('')
/**
 * 组级默认凭据以表格呈现（与下方主机列表同款外壳）。
 * 该行代表 all.children.edge_cluster.vars 段本身（组固定为 edge_cluster，故行内容即 vars）。
 */
const groupCredRows = [{ node: 'vars' }]
const sourceDraft = ref('')
const sourceSynced = ref('') // 最近一次程序化写入编辑器的文本，用于区分用户输入
const unknownKeys = ref<string[]>([])
const unmanagedIps = ref<string[]>([])
const loadErrors = ref<string[]>([])

const dirty = ref(false)
const loading = ref(false)
const saving = ref(false)
const switching = ref(false)
const sourceErrors = ref<string[]>([])
const lastModified = ref<string | null>(null)

const extraVars = computed(() => extraVarKeys(baseVars.value))

/** 页头轻统计：主机数（首项 accent）+ 未纳管 IP 数（补充维度，不重复 chips/表格里的数字语义） */
const statBadges = computed(() => {
  const items: { value: number | string; label: string; tone?: 'accent' | 'warn' }[] = [
    { value: rows.value.length, label: '台主机' },
  ]
  if (unmanagedIps.value.length) items.push({ value: unmanagedIps.value.length, label: '台未纳管', tone: 'warn' })
  return items
})

/** 源码视图卡头体量：行数 + 字节数（真实文本，非估算） */
/** 行数口径与会话视图一致：忽略文件末尾换行产生的空行 */
const sourceLineCount = computed(() => {
  const text = sourceDraft.value
  if (!text) return 0
  const lines = text.split('\n')
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
})
const sourceSizeText = computed(() => formatFileSize(new TextEncoder().encode(sourceDraft.value).length))

/** 该行凭据是否整行继承组级默认（两个字段都空且组级确有凭据）——用于行内「继承组级凭据」标注 */
function inheritsGroupCreds(record: InventoryHostEntry): boolean {
  return !record.ansible_ssh_user && !record.ansible_ssh_pass && !!(groupUser.value || groupPass.value)
}

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

/** 主机行触发器 tooltip：已配置 > 含表外字段 > 未配置（原渲染函数迁入模板后的文案来源） */
function rowAdvancedTitle(record: InventoryHostEntry): string {
  const unknown = rowUnknownKeys(record)
  const base = rowHasAdvanced(record)
    ? '已配置高级连接变量：点击展开查看或修改'
    : '高级连接变量：点击展开设置（SSH 端口 / 连接方式 / 提权 / 私钥等）'
  return unknown.length ? `${base}；另有仅源码模式可维护的自定义字段：${unknown.join('、')}` : base
}

/** 该主机行的「高级」是否展开 */
function isRowExpanded(record: InventoryHostEntry): boolean {
  return expandedKeys.value.includes(rowKeyOf(record))
}

function onExpandedChange(keys: (number | string)[]): void {
  expandedKeys.value = keys.map(Number)
}

/** 主机行高级字段写回：清空即删除该键（与后端"空串=删除键"口径一致，避免落库 null 被拒）。 */
function setAdvanced(record: InventoryHostEntry, key: string, value: unknown): void {
  if (value === '' || value === undefined || value === null) delete record[key]
  else record[key] = value
  markDirty()
}

// ── 组级行（edge_cluster.vars）展开的高级连接变量 ────────────────────
/** 组级行键：该表恒为一行，行内容即 vars 段本身 */
const GROUP_ROW_KEY = 'vars'
const groupExpandedKeys = ref<string[]>([])

function groupHasAdvanced(): boolean {
  return ADVANCED_FIELDS.some((f) => {
    const v = baseVars.value[f.key]
    return v !== undefined && v !== null && v !== ''
  })
}

/** 组级高级字段写回（同主机行为：清空即删除键，其余键原样保留）。 */
function setGroupAdvanced(key: string, value: unknown): void {
  if (value === '' || value === undefined || value === null) delete baseVars.value[key]
  else baseVars.value[key] = value
  markDirty()
}

function toggleGroupExpand(): void {
  groupExpandedKeys.value = groupExpandedKeys.value.includes(GROUP_ROW_KEY) ? [] : [GROUP_ROW_KEY]
}

function onGroupExpandedChange(keys: (number | string)[]): void {
  groupExpandedKeys.value = keys.map(String)
}

/** 组级行触发器 tooltip / 展开态（模板自绘按钮用；antd 展开列已关闭） */
const groupAdvancedTitle = computed(() =>
  groupHasAdvanced()
    ? '已配置组级高级连接变量：点击展开查看或修改'
    : '组级高级连接变量：点击展开设置（SSH 端口 / 连接方式 / 提权 / 私钥等）',
)
const groupRowExpanded = computed(() => groupExpandedKeys.value.includes(GROUP_ROW_KEY))

/** vars 是否已空（凭据与高级变量都无值）——空时「删除」无对象可删 */
const groupVarsEmpty = computed(() => Object.keys(buildVars()).length === 0)

/** 删除组级 vars 段：清空凭据与高级变量，保存后 YAML 中不再有 vars: 段 */
function deleteGroupVars(): void {
  showOverlayModal({
    title: '删除组级 vars？',
    content:
      '将清空 edge_cluster.vars（组级默认凭据与组级高级连接变量）。保存后清单中不再有 vars 段，各主机需自带凭据，未配置凭据的主机将无法被连接。',
    okText: '删除',
    okDanger: true,
    cancelText: '取消',
    onOk: () => {
      baseVars.value = {}
      groupUser.value = ''
      groupPass.value = ''
      groupExpandedKeys.value = []
      markDirty()
    },
  })
}

/** 行内标红错误：rowKey → { 字段键 → 原因 }（保存校验失败时写入，行内 AnsibleAdvancedFields 展示）。 */
const advancedErrorMap = ref<Record<number, Record<string, string>>>({})

function rowAdvancedErrors(rowKey: number): Record<string, string> | undefined {
  return advancedErrorMap.value[rowKey]
}

/** 组级行内标红错误（键同主机行：字段键 → 原因）。 */
const groupAdvancedErrors = ref<Record<string, string>>({})

/**
 * 保存前高级字段校验（批 2 结构化）：返回行定位错误列表，并写入行内标红映射。
 * 空数组 = 通过。
 */
function validateRowsAdvanced(): { rowIndex: number; key: string; message: string }[] {
  const errors = collectAdvancedErrors(rows.value)
  const map: Record<number, Record<string, string>> = {}
  for (const e of errors) {
    const rowKey = rowKeyOf(rows.value[e.rowIndex])
    ;(map[rowKey] ||= {})[e.key] = e.message
  }
  advancedErrorMap.value = map
  return errors
}

/** 组级高级字段校验（与主机行同口径），错误写入组级行内标红。 */
function validateGroupAdvanced(): string[] {
  const errors: string[] = []
  const map: Record<string, string> = {}
  for (const def of ADVANCED_FIELDS) {
    const err = validateAdvancedField(def.key, baseVars.value[def.key])
    if (err) {
      errors.push(`组级变量 ${def.key}：${err}`)
      map[def.key] = err
    }
  }
  groupAdvancedErrors.value = map
  return errors
}

/** 滚动定位 + 高亮既有行（校验失败定位首错行；复用新增行的视觉语言）。 */
function locateRow(rowKey: number): void {
  void nextTick(() => {
    const el = document.querySelector(`tr[data-row-key="${rowKey}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightKeys.value = [...highlightKeys.value, rowKey]
    setTimeout(() => {
      highlightKeys.value = highlightKeys.value.filter((k) => k !== rowKey)
    }, 2000)
  })
}

// 行键：WeakMap 身份键，避免用 ip 作键（新增行 IP 可能为空或临时重复）。
// 加载期行先注册「稳定键」（index+ip 哈希，批 3）：保存后重载重建行对象时
// 同名主机取回同键 → a-table 展开态与滚动定位跨保存保持；新增行走自增兜底。
const rowKeyMap = new WeakMap<object, number>()
let rowKeySeq = 1000000

function stableRowKey(index: number, ip: string): number {
  let h = 2166136261
  const s = `${index}|${ip}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rowKeyOf(record: object): number {
  // 归一到 raw：模板/a-table 侧拿到的是 reactive 代理，注册侧（applyServerStructure /
  // appendAndLocate）是 raw——不经 toRaw 会双侧各注册一份，展开态跨重载丢失
  const raw = toRaw(record)
  let k = rowKeyMap.get(raw) ?? rowKeyMap.get(record)
  if (k === undefined) {
    rowKeySeq += 1
    k = rowKeySeq
    rowKeyMap.set(raw, k)
  }
  return k
}

// ── 加载 / 应用服务器数据 ────────────────────────────────────────────

function syncGroupCreds(): void {
  groupUser.value = credString(baseVars.value['ansible_ssh_user'])
  groupPass.value = credString(baseVars.value['ansible_ssh_pass'])
}

function applyServerStructure(hosts: InventoryHostEntry[], vars: Record<string, unknown>): void {
  rows.value = hosts.map((h, index) => {
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
    // 稳定行键（批 3）：同名主机跨保存重载保持键值 → 展开态不丢
    rowKeyMap.set(row, stableRowKey(index, String(row.ip || '')))
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
    lastModified.value = (res.data as { last_modified?: string | null }).last_modified ?? null
    sourceErrors.value = []
    advancedErrorMap.value = {}
    groupAdvancedErrors.value = {}
    // 文件解析失败时表格为空，强制进入源码视图展示真实文件内容供修复
    // （避免切到源码时被空表格渲染出的骨架覆盖掉原文）
    if (loadErrors.value.length) viewMode.value = 'source'
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
  showOverlayModal({
    title: '放弃未保存的修改？',
    content: '刷新将从服务器重新加载清单，本地未保存的修改会丢失。',
    okText: '放弃修改并刷新',
    okDanger: true,
    cancelText: '取消',
    onOk: () => {
      void load()
    },
  })
}

// ── 双模式切换（表格 ⇄ 源码，转换由服务端承担） ──────────────────────

/** 页头视图切换按钮（原生 .btn，与数据库管理页按钮语言一致） */
function setView(target: ViewMode): void {
  void switchTo(target)
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
        // 空清单（hosts/vars 全空）引导文案替代裸结构错误（批 2）
        if (isEmptyStructureParse(res.data)) {
          message.warning('清单为空：请补全 hosts 段后切换表格视图；如确要清空清单，请直接「保存生效」')
        } else {
          message.warning('源码存在解析错误，已阻止切换，请先修正')
        }
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
      // 定位首错行：展开 + 滚动高亮 + 行内标红（toast 汇总仅辅助）
      const first = advancedErrors[0]
      const firstRow = rows.value[first.rowIndex]
      const firstKey = rowKeyOf(firstRow)
      if (!expandedKeys.value.includes(firstKey)) expandedKeys.value = [...expandedKeys.value, firstKey]
      locateRow(firstKey)
      message.warning(
        advancedErrors
          .map((e) => {
            const row = rows.value[e.rowIndex]
            return `第 ${e.rowIndex + 1} 行（${row.ip || '未填 IP'}）：${e.message}`
          })
          .join('；'),
      )
      return
    }
    const groupErrors = validateGroupAdvanced()
    if (groupErrors.length) {
      if (!groupExpandedKeys.value.includes(GROUP_ROW_KEY)) {
        groupExpandedKeys.value = [GROUP_ROW_KEY]
      }
      message.warning(groupErrors.join('；'))
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
    // 成功后重新 GET 刷新双份草稿（顺带拿真实主机数做规模化反馈）
    await load()
    message.success(`已保存并生效：${rows.value.length} 台主机`)
  } catch (err: unknown) {
    // 失败展示后端 detail（可能含 第 N 行 / 409 任务互斥提示）
    message.error(apiDetail(err, '保存失败'), 8)
  } finally {
    saving.value = false
  }
}

// ── 恢复记录（保存时自动备份：列表 / 预览 / 一键恢复） ────────────────

const backupsOpen = ref(false)
const backups = ref<InventoryBackup[]>([])
const backupsLoading = ref(false)
const previewName = ref('')
const previewText = ref('')

async function refreshBackups(): Promise<void> {
  backupsLoading.value = true
  try {
    const res = await listBackups()
    backups.value = res.data.backups || []
  } catch (err: unknown) {
    message.error(apiDetail(err, '加载备份列表失败'))
  } finally {
    backupsLoading.value = false
  }
}

async function openBackups(): Promise<void> {
  backupsOpen.value = true
  previewName.value = ''
  await refreshBackups()
}

async function togglePreview(name: string): Promise<void> {
  if (previewName.value === name) {
    previewName.value = ''
    return
  }
  try {
    const res = await readBackupContent(name)
    previewText.value = res.data.raw_text
    previewName.value = name
  } catch (err: unknown) {
    message.error(apiDetail(err, '读取备份内容失败'))
  }
}

/** 恢复确认：覆盖语义 + 可逆说明（服务端恢复前会把当前清单自动备份）。 */
function restoreClicked(bk: InventoryBackup): void {
  showOverlayModal({
    title: '恢复此备份？',
    content:
      `将把 ${formatDateTime(bk.saved_at)} 的备份恢复为当前清单，将覆盖当前清单的全部内容。` +
      '恢复前当前清单会先被自动备份（可再次恢复回来）；如有节点任务正在运行，恢复会被拒绝。',
    okText: '确认恢复',
    okDanger: true,
    cancelText: '取消',
    onOk: async () => {
      try {
        await restoreBackup(bk.name)
        message.success('已恢复，清单立即生效')
        previewName.value = ''
        await Promise.all([load(), refreshBackups()])
      } catch (err: unknown) {
        message.error(apiDetail(err, '恢复失败'), 8)
      }
    },
  })
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

/** 双摘要（批 2）：将新增 N 台 + 将覆盖 M 条（errors 非空或无条目时不展示）。 */
const bulkSummary = computed(() => {
  if (bulkImportResult.value.errors.length || !bulkImportResult.value.entries.length) return ''
  const existing = rows.value.map((r) => r.ip)
  const newCount = bulkImportResult.value.entries.filter((e) => !existing.includes(e.ip)).length
  const overwriteCount = bulkImportResult.value.entries.length - newCount
  const parts: string[] = []
  if (newCount) parts.push(`将新增 ${newCount} 台主机`)
  if (overwriteCount) parts.push(`将覆盖 ${overwriteCount} 条现有主机凭据`)
  return parts.join(' · ')
})

/** 非 IP 主机键警示行（批 2）：合法主机名按原样保存，必须显式提示不得静默。 */
const bulkHostnameWarnings = computed(() => bulkImportResult.value.entries.filter((e) => e.isHostnameKey))

function openBulkImport(): void {
  bulkImportVisible.value = true
  bulkImportText.value = ''
}

/** 关闭批量导入弹窗（取消 / 右上 ×；不清空文本，便于再次打开前保留上次内容由 openBulkImport 统一清空） */
function closeBulkImport(): void {
  bulkImportVisible.value = false
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
  // 已录入节点管理的主机不允许直接删除
  if (row.ip && !unmanagedIps.value.includes(row.ip)) {
    showOverlayModal({
      title: '无法删除',
      content: `该 IP（${row.ip}）在节点管理中存在，无法删除。请先在节点管理中删除该节点`,
      okText: '前往节点管理',
      cancelText: '取消',
      onOk: () => {
        router.push('/nodes')
      },
    })
    return
  }
  showOverlayModal({
    title: '确认删除',
    content: `确定要删除主机 ${row.ip || '（未知）'} 吗？`,
    okText: '删除',
    okDanger: true,
    cancelText: '取消',
    onOk: () => {
      const idx = rows.value.indexOf(row)
      if (idx !== -1) rows.value.splice(idx, 1)
      markDirty()
    },
  })
}

function goNodes(): void {
  void router.push('/nodes')
}
// ── 未保存离开护栏 ───────────────────────────────────────────────────

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    showOverlayModal({
      title: '有未保存的修改',
      content: '离开页面将丢失未保存的主机清单修改，确定离开吗？',
      okText: '放弃修改并离开',
      okDanger: true,
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
/* 页面骨架与数据库管理页一致：外层由 .app-content 提供 20/24 内边距，此处只负责纵向节奏 */
.inventory-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.inventory-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 320px;
}

/* ── 清单页专属解剖（设计页 proposal-c/ansible-inventory.html 同值） ── */

/* 未纳管提示：单行（图标 + 文案 + 右端入口） */
.inv-notice {
  align-items: center;
  padding: 9px 16px;
  margin-bottom: 0;
  font-size: 12.5px;
}
.inv-notice .alert-icon {
  display: inline-flex;
}

/* 卡头右端只读路径 / 体量胶囊 */
.inv-path {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 7px;
  white-space: nowrap;
}
.inv-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 9px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
}

/* 表格内输入：30px 高 + 等宽（IP 与 SSH 凭据都是机器值，等宽才好逐字符核对） */
.inventory-page :deep(.inv-inp.ant-input),
.inventory-page :deep(.inv-inp.ant-input-affix-wrapper) {
  height: 30px;
  font-size: 12.5px;
}
.inventory-page :deep(.inv-inp.ant-input),
.inventory-page :deep(.inv-inp.ant-input-affix-wrapper .ant-input) {
  font-family: var(--font-mono);
}

/* 行内「删除」= 无边框危险文本（设计页 .inv-danger）：描边红按钮会与左侧描边「高级」抢视觉重量 */
.inv-danger {
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--danger);
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.inv-danger:hover {
  background: oklch(55% 0.18 28 / 8%);
}
.inv-danger:focus-visible {
  outline: 2px solid var(--danger);
  outline-offset: 1px;
}
.inv-danger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.inv-danger:disabled:hover {
  background: transparent;
}

/* 行内动作容器（与路由/上游页同款：gap 2px；按钮圆角/字重/hover 由共享层 .action-cell 规则提供） */
.action-cell {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* 序号列 */
.inv-idx {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}

/* 继承标注（凭据整行继承组级默认时挂在 IP 下方） */
.inv-inherit {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
}
.inv-inherit b {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--fg);
}

/* 卡底弱提示（清单外自定义字段：常驻信息，不是警告） */
.inv-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 20px;
  border-top: 1px dashed var(--border);
  font-size: 11.5px;
  color: var(--muted);
}
.inv-note code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 5px;
}

/* 卡底状态条：最后修改 · 未保存胶囊 · 操作日志入口 */
.inv-statusbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  font-size: 11.5px;
  color: var(--muted);
}
.inv-statusbar b {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--fg);
}
.inv-spacer {
  flex: 1 1 auto;
}
.inv-dirty {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: oklch(52% 0.13 60);
  background: oklch(65% 0.15 85 / 16%);
  border: 1px solid oklch(65% 0.15 85 / 35%);
}
.inv-link {
  color: var(--accent);
  font-size: 11.5px;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.inv-link:hover {
  text-decoration: underline;
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

/* 卡片标题行（.card-header 由全局提供；本页仅需在标题右侧挂说明文字） */
.card-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.card-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

/* 计数徽标：口径对齐数据库管理页「历史迁移记录」的条数徽标 */
.count-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  border-radius: 999px;
  color: var(--muted);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 18%);
  vertical-align: 1px;
}

/* 表格与表头样式由全局 .table-container / .card-header 提供（见 src/style.css，
   含展开行 nowrap 排除），本页不再复制一份。 */

.group-extra-vars {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
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

/* 高级连接变量栅格样式随组件迁至 components/AnsibleAdvancedFields.vue */

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

/* 恢复记录抽屉 */
.bk-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bk-empty {
  color: var(--muted);
  font-size: 13px;
  padding: 12px 0;
}
.bk-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}
.bk-item.expanded {
  border-color: oklch(56% 0.16 210 / 35%);
}
.bk-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.bk-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.bk-time {
  font-size: 13px;
  font-weight: 500;
}
.bk-size {
  font-size: 12px;
  color: var(--muted);
}
.bk-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.bk-preview {
  margin: 10px 0 0;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  background: var(--bg-subtle, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}

/* 批量导入预览 */
/* 批量导入：等宽粘贴框（与设计页一致，便于逐行核对主机键/凭据） */
.bulk-import-textarea {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
}

.bulk-preview {
  margin-top: 12px;
  font-size: 13px;
}
.bulk-summary {
  font-weight: 500;
  margin-bottom: 4px;
}
.bulk-warn {
  color: #fa8c16;
  font-size: 12px;
  line-height: 1.8;
}
.bulk-hint {
  color: var(--muted);
  margin-bottom: 4px;
}
.bulk-error {
  color: #ff4d4f;
  font-size: 12px;
  line-height: 1.8;
}
</style>
