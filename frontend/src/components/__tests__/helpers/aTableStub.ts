/**
 * a-table 测试桩（DbBackupCard 备份历史表格专用）。
 *
 * 为什么不挂真实 AntDV Table：其 responsiveObserve 在挂载期调用 window.matchMedia，
 * jsdom 未实现会抛 Unhandled Rejection（2026-10-06 实测 14 errors / 36 用例连挂）；
 * 仓库既有惯例也是 mock a-table 桩（AuditLog.test.ts / NodeList.test.ts 同款思路）。
 *
 * 复刻本组件用到的语义切片：
 * - 行渲染：tr.ant-table-row（.ant-table-tbody 内），bodyCell 插槽按列转发
 * - 行展开：rowExpandable 可展开行渲染 .ant-table-row-expand-icon-collapsed（点击切换
 *   为 -expanded 并渲染 expandedRowRender 插槽），不可展开行渲染 -spaced 占位
 * - 受控分页：pagination.current/pageSize/total，dataSource 超页时本地切片；
 *   页码点击 $emit('change', { current, pageSize })（对应真实表格的分页 change 事件）
 *
 * 注：plain object 桩没有 vue 组件的 this 上下文类型，computed/methods 统一
 * `this: any`（测试文件豁免 any），避免 vue-tsc 对桩内部误报属性不存在。
 */
export const aTableStub = {
  name: 'ATableStub',
  props: {
    dataSource: { type: Array, default: () => [] },
    columns: { type: Array, default: () => [] },
    rowKey: { type: [String, Function], default: 'id' },
    pagination: { type: Object, default: null },
    rowExpandable: { type: Function, default: null },
  },
  emits: ['change'],
  data() {
    return { expandedKeys: [] as Array<string | number> }
  },
  computed: {
    pageSize(this: any): number {
      return Number((this.pagination as { pageSize?: number } | null)?.pageSize) || this.dataSource.length
    },
    current(this: any): number {
      return Number((this.pagination as { current?: number } | null)?.current) || 1
    },
    pageCount(this: any): number {
      if (!this.pagination) return 1
      const total = (this.pagination as { total?: number }).total ?? this.dataSource.length
      return Math.max(1, Math.ceil(total / this.pageSize))
    },
    pageRows(this: any): Array<Record<string, unknown>> {
      if (!this.pagination || this.dataSource.length <= this.pageSize) return this.dataSource
      const start = (this.current - 1) * this.pageSize
      return this.dataSource.slice(start, start + this.pageSize)
    },
  },
  methods: {
    keyOf(this: any, r: Record<string, unknown>): string | number {
      if (typeof this.rowKey === 'function') return this.rowKey(r) as string | number
      return r[this.rowKey as string] as string | number
    },
    expandable(this: any, r: Record<string, unknown>): boolean {
      return this.rowExpandable ? this.rowExpandable(r) !== false : true
    },
    isExpanded(this: any, r: Record<string, unknown>): boolean {
      return this.expandedKeys.includes(this.keyOf(r))
    },
    toggleExpand(this: any, r: Record<string, unknown>): void {
      const k = this.keyOf(r)
      this.expandedKeys = this.isExpanded(r)
        ? this.expandedKeys.filter((x: string | number) => x !== k)
        : [...this.expandedKeys, k]
    },
    onPage(this: any, p: number): void {
      if (p < 1 || p > this.pageCount || p === this.current) return
      this.$emit('change', { current: p, pageSize: this.pageSize })
    },
  },
  template: `
    <div class="ant-table-wrapper">
      <div class="ant-table">
        <table>
          <tbody class="ant-table-tbody">
            <template v-for="(r, i) in pageRows" :key="keyOf(r)">
              <tr class="ant-table-row">
                <td class="ant-table-row-expand-icon-cell">
                  <button
                    v-if="expandable(r)"
                    type="button"
                    class="ant-table-row-expand-icon"
                    :class="isExpanded(r) ? 'ant-table-row-expand-icon-expanded' : 'ant-table-row-expand-icon-collapsed'"
                    @click="toggleExpand(r)"
                  ></button>
                  <button v-else type="button" disabled class="ant-table-row-expand-icon ant-table-row-expand-icon-spaced"></button>
                </td>
                <td v-for="col in columns" :key="col.key">
                  <slot name="bodyCell" :column="col" :record="r" :index="i" />
                </td>
              </tr>
              <tr v-if="isExpanded(r)" class="ant-table-expanded-row">
                <td :colspan="columns.length + 1">
                  <slot name="expandedRowRender" :record="r" :index="i" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <ul v-if="pagination" class="ant-pagination">
        <li class="ant-pagination-total-text">共 {{ pagination.total }} 条</li>
        <li
          v-for="p in pageCount"
          :key="p"
          class="ant-pagination-item"
          :class="{ 'ant-pagination-item-active': p === current }"
          @click="onPage(p)"
        >{{ p }}</li>
        <li v-if="current < pageCount" class="ant-pagination-next" @click="onPage(current + 1)">›</li>
      </ul>
    </div>
  `,
}
