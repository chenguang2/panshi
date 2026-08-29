/**
 * Axios 错误信息统一提取（M5）。
 *
 * 替代散落在 useClusterUtils / useClusterRoutes / useClusterPluginEntity /
 * useClusterStaticResources 中的 4+ 处手写 detail 分支解析。
 * 统一处理：detail 字符串 / detail 数组（Pydantic 校验错误，含 loc 字段定位）/
 * 响应级 message / error.message / 兜底文案。
 */
export function getApiErrorMessage(error: unknown): string {
  if (!error) return '操作失败'
  const err = error as {
    response?: { data?: { detail?: unknown; message?: string } }
    message?: string
  }
  const detail = err.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : ''
        return `${loc ? `${loc}: ` : ''}${d?.msg || JSON.stringify(d)}`
      })
      .filter(Boolean)
      .join('；')
  }
  if (err.response?.data?.message) return err.response.data.message
  return err.message || '操作失败'
}