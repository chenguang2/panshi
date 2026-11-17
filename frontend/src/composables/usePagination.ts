import type { TablePaginationConfig } from 'ant-design-vue'

/** 表格分页页码选项（全局统一） */
const TABLE_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

/**
 * 每页条数的数值档（`components/ListPager.vue` 的原生 <select> 用——antd 的 pageSizeOptions
 * 是字符串数组，外置分页条需要 number 才能与 pageSize 精确相等，见约定 #56）。
 */
export const PAGE_SIZE_VALUES = TABLE_PAGE_SIZE_OPTIONS.map(Number)

/** 分页状态：与各视图/composable 维护的 pagination 对象字段对齐 */
interface PaginationState {
  page: number
  pageSize: number
  total: number
}

/**
 * 统一的 a-table pagination 配置工厂。
 *
 * - state 为 undefined/null 时（数据未加载）仍返回结构完整的配置
 * - unit 控制总数文案量词：'条'（默认）/'个节点'/'条路由' 等
 * - overrides 为页面级 opt-in 覆盖（机制/#54 不动；如三独立列表页传
 *   buildOptionText 让 sizeChanger 选项渲染「20 条」而非「20 条/页」，
 *   与设计稿「共 N · 每页 [20 条]」读感一致——mockup-parity-standard r3-3）
 */
export function paginationProps(
  state: PaginationState | undefined | null,
  unit = '条',
  overrides?: Partial<TablePaginationConfig>,
): TablePaginationConfig {
  return {
    current: state?.page,
    pageSize: state?.pageSize,
    total: state?.total,
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} ${unit}`,
    pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
    showQuickJumper: true,
    ...overrides,
  }
}
