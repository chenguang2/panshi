import type { TablePaginationConfig } from 'ant-design-vue'

/** 表格分页页码选项（全局统一） */
export const TABLE_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

/** 分页状态：与各视图/composable 维护的 pagination 对象字段对齐 */
export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

/**
 * 统一的 a-table pagination 配置工厂。
 *
 * - state 为 undefined/null 时（数据未加载）仍返回结构完整的配置
 * - unit 控制总数文案量词：'条'（默认）/'个节点'/'条路由' 等
 */
export function paginationProps(
  state: PaginationState | undefined | null,
  unit = '条',
): TablePaginationConfig {
  return {
    current: state?.page,
    pageSize: state?.pageSize,
    total: state?.total,
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} ${unit}`,
    pageSizeOptions: TABLE_PAGE_SIZE_OPTIONS,
    showQuickJumper: true,
  }
}
