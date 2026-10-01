<template>
  <Teleport to="body">
    <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
      <div class="modal dbw-modal">
        <div class="modal-header">
          <h2>容灾恢复向导</h2>
          <button class="modal-close" @click="requestClose">&times;</button>
        </div>

        <!-- 步骤指示条 -->
        <div class="dbw-steps">
          <div class="dbw-step" :class="{ active: step === 1, done: step > 1 }">
            <div class="dbw-circle"><span v-if="step > 1" class="dbw-check">&#10003;</span><span v-else>1</span></div>
            <span class="dbw-label">选择备份来源</span>
          </div>
          <div class="dbw-connector" :class="{ done: step > 1 }"></div>
          <div class="dbw-step" :class="{ active: step === 2, done: step > 2 }">
            <div class="dbw-circle"><span v-if="step > 2" class="dbw-check">&#10003;</span><span v-else>2</span></div>
            <span class="dbw-label">选择并校验备份包</span>
          </div>
          <div class="dbw-connector" :class="{ done: step > 2 }"></div>
          <div class="dbw-step" :class="{ active: step === 3, done: restoreDone }">
            <div class="dbw-circle">
              <span v-if="restoreDone" class="dbw-check">&#10003;</span><span v-else>3</span>
            </div>
            <span class="dbw-label">确认并执行恢复</span>
          </div>
        </div>

        <div class="modal-body">
          <!-- ═══ 步骤 1：备份来源（已配置位置 / 手动输入） ═══ -->
          <div v-show="step === 1">
            <div class="form-hint dbw-target-hint">
              选择备份包的来源：优先从已配置的备份位置浏览（不修改现有配置）；换机等临时场景可手动输入任意主机与目录。
            </div>
            <div class="dbw-src-options">
              <label class="dbw-src-option" :class="{ selected: sourceMode === 'configured' }">
                <input v-model="sourceMode" type="radio" value="configured" class="dbw-src-radio" />
                <div class="dbw-src-body">
                  <div class="dbw-src-head">
                    <span class="dbw-src-name">从已配置位置选择</span>
                    <span class="dbw-src-desc">浏览已配置备份位置的远端备份包</span>
                  </div>
                  <div class="dbw-src-fields">
                    <select v-model="selectedTargetId" class="form-input dbw-target-select" :disabled="targetsLoading">
                      <option value="all">全部位置</option>
                      <option v-for="t in targets" :key="t.id" :value="String(t.id)">
                        {{ targetOptionLabel(t) }}
                      </option>
                    </select>
                    <span v-if="targetsLoading" class="dbw-src-hint">位置加载中…</span>
                    <span v-else-if="targets.length === 0" class="dbw-src-hint">尚未配置备份位置</span>
                  </div>
                </div>
              </label>
              <label class="dbw-src-option" :class="{ selected: sourceMode === 'manual' }">
                <input v-model="sourceMode" type="radio" value="manual" class="dbw-src-radio" />
                <div class="dbw-src-body">
                  <div class="dbw-src-head">
                    <span class="dbw-src-name">手动输入</span>
                    <span class="dbw-src-desc">临时从任意主机 / 目录拉取备份包，不保存为配置（换机场景）</span>
                  </div>
                  <div class="dbw-src-fields dbw-src-manual">
                    <div class="form-row">
                      <div class="form-group">
                        <label class="form-label">主机 <span class="required">*</span></label>
                        <input v-model="target.host" type="text" class="form-input" placeholder="备份机地址" />
                      </div>
                      <div class="form-group">
                        <label class="form-label">端口</label>
                        <input
                          v-model.number="target.port"
                          type="number"
                          class="form-input"
                          min="1"
                          max="65535"
                          placeholder="22"
                        />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label class="form-label">用户名 <span class="required">*</span></label>
                        <input v-model="target.username" type="text" class="form-input" placeholder="root" />
                      </div>
                      <div class="form-group">
                        <label class="form-label">认证方式</label>
                        <select v-model="target.auth_type" class="form-input">
                          <option value="password">密码认证</option>
                          <option value="key">密钥认证</option>
                        </select>
                      </div>
                    </div>
                    <div v-if="target.auth_type === 'password'" class="form-group">
                      <label class="form-label">密码</label>
                      <div class="dbw-pass-row">
                        <a-input-password
                          v-model:value="target.password"
                          placeholder="SSH 密码"
                          autocomplete="new-password"
                        />
                        <button v-if="target.password" class="btn btn-secondary btn-sm" @click="clearPassword">
                          清除
                        </button>
                      </div>
                    </div>
                    <div v-else class="form-group">
                      <label class="form-label">私钥路径</label>
                      <input
                        v-model="target.key_path"
                        type="text"
                        class="form-input"
                        placeholder="/root/.ssh/id_ed25519"
                      />
                    </div>
                    <div class="form-group">
                      <label class="form-label">远端目录 <span class="required">*</span></label>
                      <input v-model="target.remote_dir" type="text" class="form-input" placeholder="/srv/panshi-dr" />
                      <div class="form-hint">备份包所在目录（备份配置中的 remote_dir）</div>
                    </div>
                  </div>
                </div>
              </label>
            </div>
            <div v-if="listError" class="dbw-error-text">{{ listError }}</div>
          </div>

          <!-- ═══ 步骤 2：选择并校验备份包 ═══ -->
          <div v-show="step === 2">
            <div v-if="listing" class="dbw-loading">
              <span class="loading-spinner"></span> 正在连接远端并读取备份包…
            </div>
            <template v-else>
              <div v-if="packages.length === 0" class="empty-state">
                <div class="empty-state-icon">&#128230;</div>
                <p>远端目录中没有可用的备份包（仅识别 panshi_backup_*.tar.gz）</p>
              </div>
              <template v-else>
                <div class="form-hint dbw-pkg-count">共 {{ packages.length }} 个备份包，选择一个后点击「校验此包」</div>
                <div class="dbw-pkg-toolbar">
                  <label class="checkbox-label dbw-latest-toggle">
                    <input v-model="onlyLatest" type="checkbox" />
                    <span>仅看每个来源的最新包</span>
                  </label>
                </div>
                <div v-if="failedLocations.length" class="dbw-loc-fail">
                  部分位置不可达：{{ failedLocations.join('、') }}——列表可能不完整，可在步骤 1 单独选择该位置重试
                </div>
                <div class="dbw-pkg-list">
                  <div
                    v-for="pkg in visiblePackages"
                    :key="pkg.name"
                    class="dbw-pkg"
                    :class="{ selected: selected === pkg.name }"
                    role="radio"
                    :aria-checked="selected === pkg.name"
                    tabindex="0"
                    @click="selectPkg(pkg.name)"
                    @keydown.enter.prevent="selectPkg(pkg.name)"
                    @keydown.space.prevent="selectPkg(pkg.name)"
                  >
                    <div class="dbw-pkg-radio"><span class="dbw-pkg-radio-dot"></span></div>
                    <div class="dbw-pkg-main">
                      <div class="dbw-pkg-name">
                        {{ pkg.name }}
                        <span v-if="isLatestPkg(pkg.name)" class="dbw-latest-tag">最新</span>
                      </div>
                      <div class="dbw-pkg-meta">
                        <span>{{ formatFileSize(pkg.size) }}</span>
                        <span class="dbw-pkg-source">
                          来源 {{ sourceText(pkg)
                          }}<a-tag
                            v-if="pkg.source_renamed"
                            color="warning"
                            title="包文件被手工改名（文件名与包内元数据不一致）"
                            >已改名</a-tag
                          >
                        </span>
                        <span v-if="pkg.present_in && pkg.present_in.length" class="dbw-pkg-locs"
                          >存在位置：{{ pkg.present_in.map((p) => p.target_name).join('、') }}</span
                        >
                        <span v-if="pkgMeta(pkg).created_at">备份于 {{ formatDateTime(pkgMeta(pkg).created_at) }}</span>
                        <span v-if="pkgMeta(pkg).app_version">版本 {{ pkgMeta(pkg).app_version }}</span>
                        <span v-if="pkgMeta(pkg).git_commit" class="dbw-pkg-commit">{{ pkgMeta(pkg).git_commit }}</span>
                      </div>
                      <div class="dbw-pkg-tags">
                        <a-tag v-if="metaUnreadable(pkg)" color="red">元数据不可读</a-tag>
                        <a-tag v-for="seg in missingSegments(pkg)" :key="seg" color="orange"
                          >未含{{ bSegmentLabel(seg) }}</a-tag
                        >
                        <a-tag v-for="sk in pkgMeta(pkg).skipped_databases || []" :key="sk" color="red">
                          跳过库 {{ sk }}
                        </a-tag>
                        <span v-if="databasesText(pkg)" class="dbb-pkg-dbs">{{ databasesText(pkg) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="verifying" class="dbw-loading">
                  <span class="loading-spinner"></span> 正在从「{{ verifySourceLabel }}」下载备份包并校验完整性（SHA256
                  + 逐库校验），大包可能需要数分钟，请勿关闭窗口…
                </div>
                <div v-if="verifyError" class="dbw-error-text">{{ verifyError }}</div>

                <!-- H4：多位置副本校验来源显式选择（聚合视图下 present_in > 1 时弹出） -->
                <div v-if="verifyChooserOpen" class="dbw-verify-chooser">
                  <div class="dbw-chooser-title">选择校验来源位置</div>
                  <div class="dbw-chooser-desc">
                    该备份包存在于多个位置，各副本可能不一致；校验将从所选位置下载完整包。
                  </div>
                  <label v-for="opt in chooserOptions" :key="opt.target_id" class="dbw-chooser-opt">
                    <input
                      v-model.number="chosenVerifyTargetId"
                      type="radio"
                      name="dbw-verify-source"
                      :value="opt.target_id"
                    />
                    <span>{{ opt.target_name }}</span>
                  </label>
                  <div class="dbw-chooser-actions">
                    <button class="btn btn-secondary btn-sm" @click="cancelVerifyChooser">取消</button>
                    <button class="btn btn-primary btn-sm" :disabled="verifying" @click="confirmVerifyChooser">
                      {{ verifying ? '校验中…' : '确认校验' }}
                    </button>
                  </div>
                </div>

                <!-- 校验明细 -->
                <div
                  v-if="verifyResult"
                  class="dbw-verify-detail"
                  :class="{ 'has-fail': !allChecksPassed(verifyResult) }"
                >
                  <div class="dbw-verify-src">本次校验自「{{ verifySourceLabel }}」</div>
                  <a-alert
                    v-if="verifyResult.version_note"
                    type="warning"
                    show-icon
                    :message="verifyResult.version_note"
                    class="dbw-version-note"
                  />
                  <div class="dbw-check-grid">
                    <div class="dbw-check">
                      <span
                        class="dbw-check-icon"
                        :class="checkPassed(verifyResult.checks.tar_integrity) ? 'ok' : 'fail'"
                        >{{ checkPassed(verifyResult.checks.tar_integrity) ? '✓' : '✗' }}</span
                      ><span>压缩包完整性</span>
                      <span class="dbw-check-val">{{ checkText(verifyResult.checks.tar_integrity) }}</span>
                    </div>
                    <div class="dbw-check">
                      <span class="dbw-check-icon" :class="checkPassed(verifyResult.checks.sha256) ? 'ok' : 'fail'">{{
                        checkPassed(verifyResult.checks.sha256) ? '✓' : '✗'
                      }}</span
                      ><span>SHA256 校验</span>
                      <span class="dbw-check-val">{{ checkText(verifyResult.checks.sha256) }}</span>
                    </div>
                    <div class="dbw-check">
                      <span
                        class="dbw-check-icon"
                        :class="checkPassed(verifyResult.checks.key_tables) ? 'ok' : 'fail'"
                        >{{ checkPassed(verifyResult.checks.key_tables) ? '✓' : '✗' }}</span
                      ><span>关键表存在性</span>
                      <span class="dbw-check-val">{{ checkText(verifyResult.checks.key_tables) }}</span>
                    </div>
                    <div v-for="(v, k) in verifyResult.checks.db_integrity" :key="k" class="dbw-check">
                      <span class="dbw-check-icon" :class="checkPassed(v) ? 'ok' : 'fail'">{{
                        checkPassed(v) ? '✓' : '✗'
                      }}</span
                      ><span>库 {{ k }}</span>
                      <span class="dbw-check-val">完整性校验 {{ checkText(v) }}</span>
                    </div>
                  </div>
                  <div class="dbw-verify-ok-hint">
                    {{
                      allChecksPassed(verifyResult)
                        ? '校验通过，可进入下一步执行恢复'
                        : '存在未通过的检查项，请更换备份包或来源位置后重新校验'
                    }}
                  </div>
                </div>
              </template>
            </template>
          </div>

          <!-- ═══ 步骤 3：高危确认与执行 ═══ -->
          <div v-show="step === 3">
            <div class="dbw-danger-box">
              <div class="dbw-danger-title">&#9888; 高危操作</div>
              <ul class="dbw-danger-list">
                <li>恢复将<b>替换当前全部数据库与配置</b>，现有数据不会直接保留</li>
                <li>旧活动库会保留为 <code>.pre-restore</code> 备份文件，必要时可人工抢救</li>
                <li>恢复完成后建议<b>重启后端服务</b>，并刷新页面重新登录</li>
              </ul>
            </div>

            <div v-if="verifyResult" class="dbw-summary">
              <div class="dbw-summary-row">
                <span class="dbw-summary-label">备份包</span
                ><span class="dbw-mono">{{ verifyResult.package_name }}</span>
              </div>
              <div class="dbw-summary-row">
                <span class="dbw-summary-label">备份时间</span
                ><span>{{ formatDateTime(verifyResult.meta.created_at) }}</span>
              </div>
              <div class="dbw-summary-row">
                <span class="dbw-summary-label">包内版本</span>
                <span
                  >{{ verifyResult.meta.app_version || '-'
                  }}<template v-if="verifyResult.meta.git_commit"
                    >（{{ verifyResult.meta.git_commit }}）</template
                  ></span
                >
              </div>
              <div class="dbw-summary-row">
                <span class="dbw-summary-label">包含数据库</span
                ><span>{{ Object.keys(verifyResult.checks.db_integrity).join('、') || '-' }}</span>
              </div>
              <div class="dbw-summary-row" v-if="(verifyResult.meta.skipped_databases || []).length">
                <span class="dbw-summary-label">跳过的库</span
                ><span class="dbw-text-danger">{{ (verifyResult.meta.skipped_databases || []).join('、') }}</span>
              </div>
              <div class="dbw-summary-row" v-if="(verifyResult.meta.missing_b_segments || []).length">
                <span class="dbw-summary-label">未含数据段</span>
                <span class="dbw-text-warning">{{
                  (verifyResult.meta.missing_b_segments || []).map(bSegmentLabel).join('、')
                }}</span>
              </div>
            </div>
            <a-alert
              v-if="verifyResult && verifyResult.version_note"
              type="warning"
              show-icon
              :message="verifyResult.version_note"
              class="dbw-version-note"
            />

            <div class="dbw-confirm-row">
              <a-checkbox v-model:checked="confirmed" :disabled="restoreDone">我已知晓风险并确认执行恢复</a-checkbox>
            </div>

            <div v-if="executeError" class="dbw-error-text">{{ executeError }}</div>

            <div v-if="executeResult" class="dbw-success-box">
              <div class="dbw-success-title">&#10003; {{ executeResult.message }}</div>
              <div class="dbw-success-row">
                激活的数据库连接：<span class="dbw-mono">{{ executeResult.active_connection_id || '-' }}</span>
              </div>
              <div v-if="restoredSourceName" class="dbw-success-row dbw-text-warning">
                已继承来源标识「<span class="dbw-mono">{{ restoredSourceName }}</span
                >」：若本机与旧机同时运行（双跑/迁移），请修改来源标识，避免两机互删共享目录中的备份。
              </div>
              <div class="dbw-success-row">
                请核对各备份位置的可达性与适用性（恢复继承包内来源标识后，共享目录中的清理归属可能变化）。
              </div>
              <div class="dbw-success-row dbw-restart">
                <span>完成后请重启后端服务（恢复已落位，重启以重载引擎）：</span>
                <span class="dbw-restart-item">
                  开发 <code>develop/linux/start.sh</code>
                  <button class="btn btn-secondary btn-sm" @click="copyRestartCommand('develop/linux/start.sh')">
                    复制
                  </button>
                </span>
                <span class="dbw-restart-item">
                  生产 <code>sh stop.sh &amp;&amp; sh start.sh</code>
                  <button class="btn btn-secondary btn-sm" @click="copyRestartCommand('sh stop.sh && sh start.sh')">
                    复制
                  </button>
                </span>
              </div>
              <div v-if="expiresText" class="dbw-success-row" :class="{ 'dbw-text-warning': expiresSoon }">
                暂存有效期至 {{ expiresText }}<template v-if="expiresSoon">（即将过期，请尽快刷新页面）</template>
              </div>
              <div class="dbw-success-row dbw-text-warning">请刷新页面并重新登录，以使用恢复后的数据。</div>
            </div>
          </div>
        </div>

        <div class="modal-footer dbw-footer">
          <button v-if="step === 1" class="btn btn-secondary" :disabled="busy" @click="requestClose">取消</button>
          <button v-else class="btn btn-secondary" :disabled="busy || restoreDone" @click="prevStep">上一步</button>
          <div class="dbw-footer-right">
            <button v-if="step === 1" class="btn btn-primary" :disabled="!targetReady || listing" @click="handleList">
              {{ listing ? '连接中…' : '连接并列出备份包' }}
            </button>
            <template v-else-if="step === 2">
              <button v-if="verifyResult" class="btn btn-secondary" :disabled="verifying" @click="requestVerify">
                重新校验
              </button>
              <button class="btn btn-primary" :disabled="!selected || verifying" @click="requestVerify">
                {{ verifying ? '校验中…' : verifyResult ? '重新校验此包' : '校验此包' }}
              </button>
              <button class="btn btn-primary" :disabled="!verifyResult || verifying" @click="nextStep">下一步</button>
            </template>
            <template v-else>
              <button
                v-if="!restoreDone"
                class="btn btn-danger"
                :disabled="!confirmed || executing"
                @click="handleExecute"
              >
                {{ executing ? '恢复中…' : '执行恢复' }}
              </button>
              <button v-else class="btn btn-primary" @click="reloadPage">已完成，刷新页面</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { showOverlayModal } from '@/composables/useOverlayModal'
import { formatDateTime, formatFileSize, parseBackendDate } from '@/utils/format'
import { getDbBackupConfig, listRestorePackages, verifyRestorePackage, executeDbRestore } from '@/api/dbBackup'
import type {
  DbBackupTarget,
  RestorePackageItem,
  RestorePackageMeta,
  RestoreTargetPayload,
  RestoreVerifyResult,
  RestoreExecuteResult,
} from '@/types/dbBackup'

const props = defineProps<{
  visible: boolean
  /** M8：从备份历史「恢复此包」进入时预选的包名（列包成功后自动选中，consumed in 5.4） */
  preselectPackageName?: string | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  restored: []
}>()

const step = ref(1)
const listing = ref(false)
const listError = ref('')
const packages = ref<RestorePackageItem[]>([])
const selected = ref('')
const verifying = ref(false)
const verifyResult = ref<RestoreVerifyResult | null>(null)
const verifyError = ref('')
const confirmed = ref(false)
const executing = ref(false)
const executeResult = ref<RestoreExecuteResult | null>(null)
const executeError = ref('')

// ── H4：多位置副本校验来源显式选择 ──
const verifyChooserOpen = ref(false)
const chooserOptions = ref<Array<{ target_id: number; target_name: string }>>([])
const chosenVerifyTargetId = ref<number | null>(null)
/** 本次校验实际使用的来源位置标注（「本次校验自 X」/下载提示共用） */
const verifySourceLabel = ref('')

const busy = computed(() => listing.value || verifying.value || executing.value)
const restoreDone = computed(() => executeResult.value !== null)

/**
 * 恢复完成提示用的继承来源标识（D7：恢复落位继承包内 source_name）。
 * 文件名解析是来源标识的唯一事实来源（D5）；旧格式包无来源则不提示。
 */
const restoredSourceName = computed<string | null>(() => {
  if (!executeResult.value) return null
  const pkg = packages.value.find((p) => p.name === selected.value)
  return pkg?.source || null
})

// 临时远端目标（独立于备份配置；在向导多次打开间保留，避免重复输入 SSH 信息）
const target = reactive({
  host: '',
  port: 22 as number | '',
  username: '',
  auth_type: 'password' as 'password' | 'key',
  password: '',
  key_path: '',
  remote_dir: '',
})

// ── 备份来源选择（多目标）：已配置位置 / 手动输入 ──
type SourceMode = 'configured' | 'manual'
const sourceMode = ref<SourceMode>('manual')
/** 下拉值：'all' = 「全部位置」聚合；否则为目标 id 字符串 */
const selectedTargetId = ref<string>('all')
const targets = ref<DbBackupTarget[]>([])
const targetsLoading = ref(false)
/** 「全部位置」聚合视图下不可达的位置名称（降级标注，不阻断列表） */
const failedLocations = ref<string[]>([])

const targetReady = computed(() => {
  if (sourceMode.value === 'configured') return targets.value.length > 0
  return !!(target.host.trim() && target.username.trim() && target.remote_dir.trim())
})

/** 打开向导时读取备份配置中的位置列表；空配置机器默认手动输入路径 */
async function loadTargets(): Promise<void> {
  targetsLoading.value = true
  try {
    const res = await getDbBackupConfig()
    targets.value = res.data.config?.targets || []
  } catch {
    // 读取失败（如权限/网络）不阻断向导：退回手动输入
    targets.value = []
  } finally {
    targetsLoading.value = false
  }
  sourceMode.value = targets.value.length > 0 ? 'configured' : 'manual'
  selectedTargetId.value = 'all'
}

/** 位置下拉项文案：名称（地址），停用位置追加标注 */
function targetOptionLabel(t: DbBackupTarget): string {
  return `${t.name}（${t.host}）${t.enabled ? '' : ' · 已停用'}`
}

/** B 类数据段标识 → 中文标签 */
const B_SEGMENT_LABELS: Record<string, string> = {
  static: '静态资源',
  task_scripts: '任务脚本',
  task_logs: '任务日志',
}

function bSegmentLabel(seg: string): string {
  return B_SEGMENT_LABELS[seg] || seg
}

/** 取后端 detail（422 校验错误等），取不到时用 fallback */
function errDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}

function toInt(v: number | string | null | undefined, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function pkgMeta(pkg: RestorePackageItem): RestorePackageMeta {
  return pkg.meta || {}
}

function metaUnreadable(pkg: RestorePackageItem): boolean {
  return !pkg.meta || !!pkg.meta.meta_error
}

function missingSegments(pkg: RestorePackageItem): string[] {
  return pkgMeta(pkg).missing_b_segments || []
}

function databasesText(pkg: RestorePackageItem): string {
  const dbs = pkgMeta(pkg).databases || []
  return dbs.length ? `包含库：${dbs.join('、')}` : ''
}

// ── 5.3：校验检查项按值渲染（后端 'ok' = 通过；其余按失败呈现，杜绝失败仍绿勾） ──
function checkPassed(v: string): boolean {
  return v === 'ok'
}

function checkText(v: string): string {
  return checkPassed(v) ? '通过' : '失败'
}

function allChecksPassed(r: RestoreVerifyResult): boolean {
  const simple = [r.checks.tar_integrity, r.checks.sha256, r.checks.key_tables].every(checkPassed)
  const dbs = Object.values(r.checks.db_integrity || {}).every(checkPassed)
  return simple && dbs
}

// ── 5.4：「仅看最新」与来源最新标记（列表为最新在前，首个出现即该来源最新） ──
const onlyLatest = ref(false)

const latestPkgNames = computed<Set<string>>(() => {
  const seen = new Set<string>()
  const latest = new Set<string>()
  for (const p of packages.value) {
    const key = p.source || p.name
    if (!seen.has(key)) {
      seen.add(key)
      latest.add(p.name)
    }
  }
  return latest
})

const visiblePackages = computed<RestorePackageItem[]>(() =>
  onlyLatest.value ? packages.value.filter((p) => latestPkgNames.value.has(p.name)) : packages.value,
)

function isLatestPkg(name: string): boolean {
  return latestPkgNames.value.has(name)
}

function clearPassword(): void {
  target.password = ''
}

/** 来源列文本：旧格式包（文件名无来源标识）显示 — */
function sourceText(pkg: RestorePackageItem): string {
  return pkg.source || '—'
}

function targetPayload(): RestoreTargetPayload {
  const p: RestoreTargetPayload = {
    host: target.host.trim(),
    port: toInt(target.port, 22),
    username: target.username.trim(),
    auth_type: target.auth_type,
    remote_dir: target.remote_dir.trim(),
  }
  if (target.auth_type === 'password' && target.password) p.password = target.password
  if (target.auth_type === 'key' && target.key_path.trim()) p.key_path = target.key_path.trim()
  return p
}

function selectPkg(name: string): void {
  if (verifying.value) return
  selected.value = name
  // 换选包后旧校验结果失效
  if (verifyResult.value && verifyResult.value.package_name !== name) {
    verifyResult.value = null
    verifyError.value = ''
  }
}

/** 列包 / 校验共用的来源载荷：已配置位置 → target_id（null = 全部位置聚合）；手输 → 连接字段 */
function listPayload(): RestoreTargetPayload {
  if (sourceMode.value === 'configured') {
    return { target_id: selectedTargetId.value === 'all' ? null : Number(selectedTargetId.value) }
  }
  return targetPayload()
}

/** 校验载荷：必须落到一个具体位置下载。「全部位置」时从选中包的 present_in 取
 * 第一个列包成功的位置（后端 target_id null 会 422——包行必带 ≥1 个存在位置）。
 * 多位置时改走 requestVerify 的显式选择（H4），本函数仅作单位置/指定位置兜底。 */
function verifyTarget(): RestoreTargetPayload {
  if (sourceMode.value !== 'configured') return targetPayload()
  if (selectedTargetId.value !== 'all') return { target_id: Number(selectedTargetId.value) }
  const found = packages.value.find((p) => p.name === selected.value)
  const tid = found?.present_in?.[0]?.target_id
  return { target_id: tid != null ? Number(tid) : null }
}

/** H4：聚合视图下选中包的多位置选项（≤1 个时无需选择） */
function resolveChooserOptions(): Array<{ target_id: number; target_name: string }> {
  if (sourceMode.value !== 'configured') return []
  if (selectedTargetId.value !== 'all') return []
  const found = packages.value.find((p) => p.name === selected.value)
  return (found?.present_in || []).map((p) => ({ target_id: p.target_id, target_name: p.target_name }))
}

/** 校验来源位置标注：已配置位置 → 位置名；手输 → 手动输入（主机） */
function sourceLabelFor(targetId: number | null): string {
  if (sourceMode.value !== 'configured') {
    return `手动输入（${target.host.trim() || '未填写主机'}）`
  }
  if (targetId != null) {
    const t = targets.value.find((x) => x.id === targetId)
    if (t) return t.name
    const opt = chooserOptions.value.find((o) => o.target_id === targetId)
    if (opt) return opt.target_name
  }
  return '已配置位置'
}

/** 校验入口：聚合视图 + 多位置副本 → 先显式选择来源；其余静默沿用 */
function requestVerify(): void {
  if (!selected.value || verifying.value) return
  const opts = resolveChooserOptions()
  if (opts.length > 1) {
    chooserOptions.value = opts
    chosenVerifyTargetId.value = opts[0].target_id
    verifyChooserOpen.value = true
    return
  }
  void doVerify(verifyTarget())
}

function cancelVerifyChooser(): void {
  if (verifying.value) return
  verifyChooserOpen.value = false
}

function confirmVerifyChooser(): void {
  if (chosenVerifyTargetId.value == null || verifying.value) return
  verifyChooserOpen.value = false
  void doVerify({ target_id: chosenVerifyTargetId.value })
}

async function handleList(): Promise<void> {
  if (!targetReady.value) {
    message.error(
      sourceMode.value === 'configured' ? '尚未配置备份位置，请改用手动输入' : '请填写主机、用户名与远端目录',
    )
    return
  }
  listing.value = true
  listError.value = ''
  failedLocations.value = []
  try {
    const res = await listRestorePackages(listPayload())
    packages.value = res.data.packages
    failedLocations.value = res.data.failed_locations || []
    selected.value = ''
    // M8/5.4：历史「恢复此包」预选——命中时自动选中，用户从校验步骤继续
    if (props.preselectPackageName && packages.value.some((p) => p.name === props.preselectPackageName)) {
      selected.value = props.preselectPackageName
    }
    verifyResult.value = null
    verifyError.value = ''
    step.value = 2
  } catch (err: unknown) {
    listError.value = errDetail(err, '连接远端失败，请检查目标与凭据')
  } finally {
    listing.value = false
  }
}

async function doVerify(target: RestoreTargetPayload): Promise<void> {
  if (!selected.value || verifying.value) return
  verifying.value = true
  verifyError.value = ''
  verifySourceLabel.value = sourceLabelFor(target.target_id ?? null)
  try {
    const res = await verifyRestorePackage({ target, package_name: selected.value })
    verifyResult.value = res.data
  } catch (err: unknown) {
    verifyResult.value = null
    verifyError.value = errDetail(err, '校验失败，请稍后重试')
  } finally {
    verifying.value = false
  }
}

/**
 * H3：恢复执行失败文案分类——超时必须警示「后端可能仍在执行」防重复发起；
 * 409 两种形态（暂存过期 / 并发冲突——并发拒绝时会顺带删除本次 verify_id 暂存）都必须引导重新校验。
 */
function classifyExecuteError(err: unknown): string {
  const e = err as {
    code?: string
    message?: string
    response?: { status?: number; data?: { detail?: unknown } }
  }
  const isTimeout = e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')
  if (isTimeout) {
    return '恢复请求超时：后端可能仍在执行恢复（落位与引擎重载进行中），请勿重复发起；请刷新页面并核对当前活动数据库'
  }
  const detail = typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : ''
  if (e?.response?.status === 409 && detail.includes('过期')) {
    return '校验会话已过期（暂存有效期 10 分钟），请返回上一步重新校验后再执行恢复'
  }
  if (e?.response?.status === 409) {
    return `${detail || '已有备份/恢复任务进行中，请稍后再试'}；本次校验暂存已失效，冲突解除后需重新校验`
  }
  return detail || '恢复失败，请稍后重试'
}

async function handleExecute(): Promise<void> {
  if (!verifyResult.value || !confirmed.value || executing.value) return
  executing.value = true
  executeError.value = ''
  try {
    const res = await executeDbRestore({ verify_id: verifyResult.value.verify_id, confirmed: true })
    executeResult.value = res.data
    emit('restored')
  } catch (err: unknown) {
    executeError.value = classifyExecuteError(err)
  } finally {
    executing.value = false
  }
}

/** H6：完成闭环——重启命令复制（clipboard 优先，execCommand 降级） */
async function copyRestartCommand(cmd: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cmd)
      message.success('已复制重启命令')
      return
    }
  } catch {
    // 降级到 execCommand
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = cmd
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    message.success('已复制重启命令')
  } catch {
    message.info(cmd)
  }
}

const expiresText = computed(() => {
  const exp = verifyResult.value?.meta?.expires_at
  return exp ? formatDateTime(exp) : ''
})

/** M13：暂存剩余 <2 分钟时警示即将过期 */
const expiresSoon = computed(() => {
  const exp = verifyResult.value?.meta?.expires_at
  if (!exp) return false
  try {
    return parseBackendDate(exp).getTime() - Date.now() < 2 * 60 * 1000
  } catch {
    return false
  }
})

function nextStep(): void {
  if (step.value === 2 && !verifyResult.value) return
  if (step.value < 3) step.value += 1
}

function prevStep(): void {
  if (step.value > 1) step.value -= 1
}

function reloadPage(): void {
  window.location.reload()
}

function closeWizard(): void {
  emit('update:visible', false)
}

/** 关闭向导：进行中禁止；有进度时二次确认 */
function requestClose(): void {
  if (busy.value) {
    message.warning('操作进行中，请等待完成后再关闭')
    return
  }
  if (restoreDone.value) {
    closeWizard()
    return
  }
  if (step.value > 1 || packages.value.length > 0) {
    showOverlayModal({
      title: '关闭恢复向导',
      content: '已列出的备份包与校验结果将丢弃；连接信息会保留，下次打开无需重填。确定关闭？',
      okText: '关闭向导',
      okDanger: true,
      onOk: () => {
        closeWizard()
      },
    })
    return
  }
  closeWizard()
}

// 每次打开重置流程状态（target 保留），避免上次残留的校验结果误导本次恢复
watch(
  () => props.visible,
  (open) => {
    if (!open) return
    step.value = 1
    packages.value = []
    listError.value = ''
    failedLocations.value = []
    selected.value = ''
    verifying.value = false
    verifyResult.value = null
    verifyError.value = ''
    confirmed.value = false
    executing.value = false
    executeResult.value = null
    executeError.value = ''
    verifyChooserOpen.value = false
    chooserOptions.value = []
    chosenVerifyTargetId.value = null
    verifySourceLabel.value = ''
    void loadTargets()
  },
  // immediate：整页挂载即处于打开态（如 HMR / 直链恢复入口）时也要初始化
  { immediate: true },
)
</script>

<style scoped>
.dbw-modal {
  max-width: 820px;
}

/* ── 步骤指示条 ── */
.dbw-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 20px 4px;
}
.dbw-step {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dbw-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    border-color 0.2s,
    background 0.2s,
    color 0.2s;
}
.dbw-step.active .dbw-circle {
  border-color: var(--accent);
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
}
.dbw-step.done .dbw-circle {
  border-color: var(--success);
  background: var(--success);
  color: #fff;
}
.dbw-check {
  font-size: 12px;
  line-height: 1;
}
.dbw-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}
.dbw-step.active .dbw-label {
  color: var(--fg);
  font-weight: 600;
}
.dbw-connector {
  width: 48px;
  height: 2px;
  background: var(--border);
  border-radius: 1px;
}
.dbw-connector.done {
  background: var(--success);
}

/* ── 步骤 1 ── */
.dbw-target-hint {
  margin-bottom: 14px;
}

/* ── 步骤 1：备份来源单选卡片 ── */
.dbw-src-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dbw-src-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.15s;
}
.dbw-src-option:hover {
  border-color: oklch(56% 0.16 210 / 50%);
}
.dbw-src-option.selected {
  border-color: oklch(56% 0.16 210);
  box-shadow: 0 0 0 3px oklch(56% 0.16 210 / 15%);
  background: oklch(56% 0.16 210 / 4%);
}
.dbw-src-radio {
  margin-top: 3px;
  accent-color: var(--accent);
  flex-shrink: 0;
}
.dbw-src-body {
  flex: 1;
  min-width: 0;
}
.dbw-src-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.dbw-src-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}
.dbw-src-desc {
  font-size: 12px;
  color: var(--muted);
}
.dbw-src-fields {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.15s;
}
.dbw-src-manual {
  display: block;
}
/* 未选中的来源卡：内部字段降透明且不可交互（选中卡描边 + 光晕，未选组降透明联动） */
.dbw-src-option:not(.selected) .dbw-src-fields {
  opacity: 0.45;
  pointer-events: none;
}
.dbw-target-select {
  max-width: 320px;
}
.dbw-src-hint {
  font-size: 12px;
  color: var(--muted);
}

/* ── 聚合视图降级标注 ── */
.dbw-loc-fail {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid oklch(70% 0.15 85 / 40%);
  border-radius: var(--radius-md, 6px);
  background: oklch(70% 0.15 85 / 8%);
  color: oklch(50% 0.13 85);
  font-size: 12px;
}
.dbw-pkg-locs {
  color: var(--muted);
}

/* ── 步骤 2：包列表 ── */
.dbw-pkg-count {
  margin-bottom: 10px;
}
.dbw-pkg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}
.dbw-pkg {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 8px);
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.dbw-pkg:hover {
  border-color: oklch(56% 0.16 210 / 45%);
}
.dbw-pkg.selected {
  border-color: var(--accent);
  background: oklch(56% 0.16 210 / 6%);
}
.dbw-pkg-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border);
  margin-top: 3px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}
.dbw-pkg.selected .dbw-pkg-radio {
  border-color: var(--accent);
}
.dbw-pkg-radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}
.dbw-pkg.selected .dbw-pkg-radio-dot {
  background: var(--accent);
}
.dbw-pkg-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dbw-pkg-name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  word-break: break-all;
}
.dbw-pkg-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
}
.dbw-pkg-commit {
  font-family: var(--font-mono);
}
.dbw-pkg-source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dbw-pkg-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.dbw-pkg-tags .dbb-pkg-dbs {
  font-size: 12px;
  color: var(--muted);
}

/* ── 校验进度 / 结果 ── */
.dbw-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  font-size: 13px;
  color: var(--muted);
}
.dbw-verify-detail {
  margin-top: 14px;
  padding: 14px 16px;
  border: 1px solid oklch(55% 0.15 145 / 35%);
  border-radius: 8px;
  background: oklch(55% 0.15 145 / 6%);
}
.dbw-verify-detail.has-fail {
  border-color: oklch(55% 0.18 28 / 35%);
  background: oklch(55% 0.18 28 / 6%);
}
/* ── H4 校验来源选择 / 来源标注 ── */
.dbw-verify-chooser {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid oklch(56% 0.16 210 / 40%);
  border-radius: 8px;
  background: oklch(56% 0.16 210 / 5%);
}
.dbw-chooser-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.dbw-chooser-desc {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.dbw-chooser-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}
.dbw-chooser-opt input {
  accent-color: var(--accent);
}
/* ── L4 键盘可达性焦点样式 ── */
.dbw-pkg:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.dbw-chooser-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.dbw-verify-src {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 8px;
}
/* ── H6 完成闭环：重启命令 / 暂存有效期 ── */
.dbw-restart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dbw-restart-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dbw-restart-item code {
  padding: 1px 6px;
  border-radius: 4px;
  background: oklch(0% 0 0 / 6%);
  font-size: 12px;
  font-family: var(--font-mono);
}
.dbw-check-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dbw-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
}
.dbw-check-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 11px;
  color: #fff;
  flex-shrink: 0;
}
.dbw-check-icon.ok {
  background: var(--success);
}
.dbw-check-icon.fail {
  background: var(--danger);
}
/* ── 5.4 仅看最新工具行 / 最新标记 ── */
.dbw-pkg-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.dbw-latest-tag {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--success);
  background: oklch(55% 0.15 145 / 10%);
  border: 1px solid oklch(55% 0.15 145 / 35%);
  vertical-align: middle;
}
/* ── L7 密码清除 ── */
.dbw-pass-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dbw-pass-row > :first-child {
  flex: 1;
}
.dbw-check-val {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}
.dbw-verify-ok-hint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #b7eb8f;
  font-size: 12px;
  color: var(--muted);
}
.dbw-version-note {
  margin-bottom: 10px;
}

/* ── 步骤 3：高危确认 ── */
.dbw-danger-box {
  padding: 14px 16px;
  border: 1px solid oklch(55% 0.18 28 / 35%);
  border-left: 4px solid var(--danger);
  border-radius: 8px;
  background: oklch(55% 0.18 28 / 6%);
}
.dbw-danger-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--danger);
  margin-bottom: 8px;
}
.dbw-danger-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--fg);
}
.dbw-danger-list code {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 12px;
  font-family: var(--font-mono);
}
.dbw-summary {
  margin-top: 14px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dbw-summary-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}
.dbw-summary-label {
  width: 84px;
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
}
.dbw-mono {
  font-family: var(--font-mono);
  word-break: break-all;
}
.dbw-text-danger {
  color: var(--danger);
}
.dbw-text-warning {
  color: var(--warning);
}
.dbw-confirm-row {
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--danger);
}
.dbw-error-text {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: oklch(55% 0.18 28 / 8%);
  border: 1px solid oklch(55% 0.18 28 / 30%);
  color: var(--danger);
  font-size: 13px;
  word-break: break-all;
  white-space: pre-wrap;
}
.dbw-success-box {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid oklch(55% 0.15 145 / 35%);
  border-radius: 8px;
  background: oklch(55% 0.15 145 / 6%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.dbw-success-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--success);
}

/* ── 底部按钮 ── */
.dbw-footer {
  justify-content: space-between;
}
.dbw-footer-right {
  display: flex;
  gap: 8px;
}
</style>
