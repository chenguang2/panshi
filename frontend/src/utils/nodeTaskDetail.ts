/**
 * 节点任务详情页的纯推导（node-task-ux-optimization 7.2）。
 *
 * 视图只负责排版：计数文案、处理建议、参数摘要都在这里算，
 * 避免「同一段业务判断散落在模板表达式里」——也便于单测覆盖关键词分支。
 */

// ── 计数文案 ─────────────────────────────────────────────────────────

export interface TaskCountsInput {
  total_nodes?: number | null
  success_nodes?: number | null
  failed_nodes?: number | null
  skipped_nodes?: number | null
  cancelled_nodes?: number | null
}

function num(v: number | null | undefined): number {
  return Math.max(0, v ?? 0)
}

/** `成功 x · 失败 y · 跳过 z · 取消 w / 共 N`（四项恒显示，便于纵向对齐比较） */
export function countsLine(t: TaskCountsInput): string {
  return `成功 ${num(t.success_nodes)} · 失败 ${num(t.failed_nodes)} · 跳过 ${num(t.skipped_nodes)} · 取消 ${num(t.cancelled_nodes)} / 共 ${num(t.total_nodes)}`
}

// ── 处理建议 ─────────────────────────────────────────────────────────
//
// 不新增后端字段：按 failure_summary / 子项 failure_reason 的关键词给「一条」可执行建议。
// 规则顺序即优先级（越具体越靠前），命中即返回；未命中的失败给通用建议。

export interface SuggestionInput {
  status: string
  failed_nodes?: number | null
  cancelled_nodes?: number | null
  failure_summary?: string | null
  /** 各子项的 failure_reason（可含 null） */
  reasons?: Array<string | null | undefined>
}

interface SuggestionRule {
  test: RegExp
  text: string
}

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    test: /清单|inventory/i,
    text: '建议：确认节点已加入 Ansible 主机清单后重试',
  },
  {
    test: /无法连接|连接失败|connection refused|connection closed|unreachable|no route|网络不可达/i,
    text: '建议：确认节点网络与 SSH 服务可达后重试',
  },
  {
    test: /认证|密码|permission denied|publickey|auth/i,
    text: '建议：核对清单中的 SSH 账号与密码/密钥后重试',
  },
  {
    test: /超时|timeout|timed out/i,
    text: '建议：检查节点负载与网络后重试，必要时调大超时时间',
  },
  {
    test: /磁盘|no space|空间不足|disk full/i,
    text: '建议：清理节点磁盘空间后重试',
  },
  {
    test: /权限|sudo|not permitted|denied/i,
    text: '建议：确认执行账号具备所需权限（如 sudo）后重试',
  },
]

const CANCELLED_HINT = '建议：确认节点环境后重试已取消的节点'
const FALLBACK_HINT = '建议：查看节点日志定位具体原因'

/** 处理建议：无失败且无取消时返回空串（渲染侧不占位） */
export function buildSuggestion(input: SuggestionInput): string {
  const failed = num(input.failed_nodes)
  const cancelled = num(input.cancelled_nodes)
  if (failed === 0 && cancelled === 0) return ''

  const haystack = [input.failure_summary || '', ...(input.reasons || [])].filter(Boolean).join('\n')
  for (const rule of SUGGESTION_RULES) {
    if (rule.test.test(haystack)) return rule.text
  }
  if (failed === 0 && cancelled > 0) return CANCELLED_HINT
  return FALLBACK_HINT
}

// ── 参数摘要 ─────────────────────────────────────────────────────────

export interface ParamEntry {
  label: string
  value: string
}

const SECURITY_LABELS: Record<string, string> = {
  blacklist: '黑名单',
  whitelist: '白名单',
  none: '不限制',
}

/** 只进「原始参数」代码块、不进 key-value 摘要的键（内容很长或技术细节） */
const RAW_ONLY_KEYS = new Set(['script_content', 'script_file', 'srcpath', 'archive_upload_id'])

function listText(v: unknown): string {
  return Array.isArray(v) ? v.join('、') : String(v)
}

/**
 * 按任务类型挑出有意义的参数字段（命令/安全策略/超时/分发路径/安装包/软件列表…）。
 * 未识别的键兜底成通用 key-value，不静默丢参数。
 */
export function paramEntries(task: { task_type: string; params?: Record<string, unknown> | null }): ParamEntry[] {
  const params = task.params || {}
  const out: ParamEntry[] = []
  const used = new Set<string>()

  const take = (key: string, label: string, format?: (v: unknown) => string) => {
    used.add(key)
    if (!(key in params)) return
    const value = params[key]
    if (value === null || value === undefined || value === '') return
    out.push({ label, value: format ? format(value) : String(value) })
  }

  const securityText = (v: unknown) => SECURITY_LABELS[String(v)] || String(v)
  const secondsText = (v: unknown) => `${v}s`

  switch (task.task_type) {
    case 'cmd_exec':
      take('cmd', '命令')
      take('script_filename', '脚本')
      take('security', '安全策略', securityText)
      take('whitelist', '白名单命令', listText)
      take('timeout', '超时', secondsText)
      break
    case 'distribute_file':
      take('srcfilename', '源文件')
      take('destpath', '目标目录')
      take('timeout', '超时', secondsText)
      break
    case 'install_openresty':
      take('openresty_file', '安装包')
      break
    case 'edge_pack_add':
      take('pack_file', '版本包')
      break
    case 'edge_pack_rebase':
      take('version', '目标版本')
      break
    case 'software_check':
      take('software_list', '软件列表', listText)
      break
    default:
      break
  }

  for (const [key, value] of Object.entries(params)) {
    if (used.has(key) || RAW_ONLY_KEYS.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (key === 'timeout') out.push({ label: '超时', value: `${value}s` })
    else out.push({ label: key, value: listText(value) })
  }
  return out
}
