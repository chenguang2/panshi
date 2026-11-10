/**
 * 拓扑图就地 popover 引擎（relay-region-topology-view design D5 / 任务 3.1）。
 *
 * 交互语义照 mockup（docs/refactoring/relay-region-topology-mockup.html，用户批准的可点 demo）：
 * - fixed 定位锚定图元，视口边缘避让（优先锚点下方，放不下翻到上方，左右钳制 12px）；
 * - Esc / 点击空白处关闭；浮层与锚点内点击不关；同图元再点收起（togglePopover）；
 * - 输入即时校验：失焦即验红、输入即清红；提交时全字段校验不通过不发请求；
 * - 链式主按钮（chain）：主按钮 onApply 成功关闭后接续执行（如「保存并初始化」→ 自动开始初始化）；
 *   链式时可用 altSave 提供次级「仅保存」；Enter 等价主按钮（视图层接线）；
 * - 有字段型：提交异常时错误就地红字展示（.p-error）、浮层不关闭；
 *   无字段确认/分支型（状态切换、初始化轻确认）：主按钮点击即关闭再执行 onApply（mockup 语义）。
 *
 * 校验正则与错误文案与后端 schemas/relay.py 逐字一致（RELAY_* 常量），禁止就地改写。
 */
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { getApiErrorMessage } from '@/utils/error'

// ── 与 backend/app/schemas/relay.py 逐字一致的校验规则 ──
export const RELAY_CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/
export const RELAY_CODE_ERROR_MSG = '区域code格式错误: 以小写字母开头，仅含小写字母/数字/中划线，长度2-32'
export const RELAY_HTTP_BASE_URL_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/
export const RELAY_HTTP_BASE_URL_ERROR_MSG =
  '网关 HTTP 腿格式错误: 须以 http:// 或 https:// 开头且不含路径，如 http://10.10.1.1:8443'
export const RELAY_SSH_JUMP_PATTERN = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:\d{1,5})?$/
export const RELAY_SSH_JUMP_ERROR_MSG = 'SSH 跳板格式错误: 须为 账号@主机[:端口]，如 tunnel@10.10.1.1:22'
export const RELAY_OPENRESTY_PREFIX_ERROR_MSG =
  'OpenResty 前缀格式错误: 须为以 / 开头的绝对路径，如 /work/jboss/tunnel/openresty-1.21.4.1/nginx'

export interface TopoPopoverFieldOption {
  value: string
  label: string
}

export interface TopoPopoverField {
  key: string
  label: string
  value?: string
  placeholder?: string
  /** mono=false 渲染为普通文本框（.ftext），默认等宽（地址/路径类） */
  mono?: boolean
  /** 提供 options 渲染下拉（如挂接/解挂区域选择），否则为文本框 */
  options?: TopoPopoverFieldOption[]
  /** 失焦/提交时校验，返回红字文案或 null（空校验函数视为通过） */
  validate?: (v: string) => string | null
}

export interface TopoPopoverLink {
  label: string
  onClick: () => void
}

export interface TopoPopoverConfig {
  title: string
  sub?: string
  fields: TopoPopoverField[]
  /** 主按钮文案，默认「保存」 */
  primaryLabel?: string
  /** 链式回调：主按钮保存成功关闭后接续执行（mockup「保存并初始化」语义） */
  chain?: () => void | Promise<void>
  /** 链式主按钮的次级「仅保存」文案 */
  altSave?: string
  /** 底部注记（HTML 片段，仅限本仓库常量文案，照 mockup 加粗强调） */
  note?: string
  /** 无字段确认型的主按钮禁用（如无可挂接候选） */
  primaryDisabled?: boolean
  /** 动作区左侧链接（如「打开集群 ›」） */
  link?: TopoPopoverLink
  /** 打开时聚焦末尾而非首个输入框（链式前缀收集聚焦前缀框） */
  focusLast?: boolean
  /** 校验通过后的提交回调；异常时红字就地展示、浮层不关闭（有字段型） */
  onApply: (values: Record<string, string>) => void | Promise<void>
}

export function useTopologyPopover() {
  const open = ref(false)
  const anchorEl = ref<HTMLElement | null>(null)
  const config = ref<TopoPopoverConfig | null>(null)
  const busy = ref(false)
  const submitError = ref('')
  const values = reactive<Record<string, string>>({})
  const fieldErrors = reactive<Record<string, string>>({})
  const popRef = ref<HTMLElement | null>(null)
  const pos = reactive({ left: '0px', top: '0px' })

  function close(): void {
    open.value = false
    anchorEl.value = null
    config.value = null
    submitError.value = ''
    busy.value = false
  }

  function resetForm(cfg: TopoPopoverConfig): void {
    for (const key of Object.keys(values)) delete values[key]
    for (const key of Object.keys(fieldErrors)) delete fieldErrors[key]
    for (const f of cfg.fields) {
      values[f.key] = f.value ?? (f.options ? (f.options[0]?.value ?? '') : '')
      fieldErrors[f.key] = ''
    }
  }

  /** 视口边缘避让定位（mockup openPop 同公式：优先下方 8px，放不下翻上方 8px，左右钳制 12px） */
  async function position(): Promise<void> {
    await nextTick()
    const el = popRef.value
    const anchor = anchorEl.value
    if (!el || !anchor) return
    const r = anchor.getBoundingClientRect()
    const pw = el.offsetWidth
    const ph = el.offsetHeight
    const left = Math.max(12, Math.min(r.left, window.innerWidth - pw - 12))
    let top = r.bottom + 8
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8)
    pos.left = `${left}px`
    pos.top = `${top}px`
  }

  async function focusField(cfg: TopoPopoverConfig): Promise<void> {
    await nextTick()
    const inputs = popRef.value?.querySelectorAll<HTMLInputElement>('.pf input')
    if (!inputs || inputs.length === 0) return
    const target = cfg.focusLast ? inputs[inputs.length - 1]! : inputs[0]!
    target.focus()
    if (!cfg.focusLast) target.select()
  }

  function openPopover(anchor: HTMLElement, cfg: TopoPopoverConfig): void {
    anchorEl.value = anchor
    resetForm(cfg)
    config.value = cfg
    submitError.value = ''
    busy.value = false
    open.value = true
    void position()
    void focusField(cfg)
  }

  /** 同图元再点收起，否则打开 */
  function togglePopover(anchor: HTMLElement, cfg: TopoPopoverConfig): void {
    if (open.value && anchorEl.value === anchor) {
      close()
      return
    }
    openPopover(anchor, cfg)
  }

  /** 模板函数 ref：渲染完成后测量定位 */
  function setPopEl(el: unknown): void {
    popRef.value = (el as HTMLElement | null) || null
    if (el) void position()
  }

  function validateField(f: TopoPopoverField): boolean {
    const err = f.validate ? f.validate((values[f.key] ?? '').trim()) : null
    fieldErrors[f.key] = err || ''
    return !err
  }

  function clearFieldError(key: string): void {
    if (fieldErrors[key]) fieldErrors[key] = ''
  }

  /**
   * act='primary'：主按钮（链式时 onApply 成功后接续 chain）；
   * act='save'：次级「仅保存」/ 无链式主按钮。
   */
  async function apply(act: 'save' | 'primary'): Promise<void> {
    const cfg = config.value
    if (!cfg || busy.value) return
    if (cfg.fields.length === 0) {
      // 确认/分支型：先关闭再执行（mockup openStatus / openInitConfirm 语义）
      const fn = cfg.onApply
      close()
      await fn({})
      return
    }
    let ok = true
    for (const f of cfg.fields) {
      if (!validateField(f)) ok = false
    }
    if (!ok) return
    submitError.value = ''
    busy.value = true
    try {
      await cfg.onApply({ ...values })
    } catch (e) {
      submitError.value = getApiErrorMessage(e)
      busy.value = false
      return
    }
    busy.value = false
    close()
    if (act === 'primary' && cfg.chain) await cfg.chain()
  }

  // Esc / 点击空白处关闭（mockup：浮层与锚点内点击不关；锚点自身的 toggle 由触发处管理）
  function onDocClick(e: MouseEvent): void {
    if (!open.value) return
    const target = e.target as Node | null
    if (!target) return
    if (popRef.value?.contains(target)) return
    if (anchorEl.value?.contains(target)) return
    close()
  }

  function onDocKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open.value) close()
  }

  onMounted(() => {
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onDocKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick)
    document.removeEventListener('keydown', onDocKeydown)
  })

  return reactive({
    open,
    anchorEl,
    config,
    busy,
    submitError,
    values,
    fieldErrors,
    pos,
    close,
    openPopover,
    togglePopover,
    setPopEl,
    validateField,
    clearFieldError,
    apply,
  })
}

export type TopologyPopover = ReturnType<typeof useTopologyPopover>
