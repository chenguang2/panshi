import { describe, it, expect } from 'vitest'
import { getApiErrorMessage } from '../error'

describe('utils/error getApiErrorMessage', () => {
  it('detail 为字符串时直接返回', () => {
    const err = { response: { data: { detail: 'upstream_ids 不能为空' } } }
    expect(getApiErrorMessage(err)).toBe('upstream_ids 不能为空')
  })

  it('detail 为 Pydantic 校验数组时拼接 loc+msg', () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ['body', 'name'], msg: 'Field required' },
            { loc: ['body', 'uri'], msg: 'Field required' },
          ],
        },
      },
    }
    expect(getApiErrorMessage(err)).toBe('name: Field required；uri: Field required')
  })

  it('detail 数组过滤 body 定位段', () => {
    const err = {
      response: { data: { detail: [{ loc: ['body'], msg: 'Field required' }] } },
    }
    expect(getApiErrorMessage(err)).toBe('Field required')
  })

  it('无 detail 时回退响应级 message', () => {
    const err = { response: { data: { message: '服务器繁忙' } } }
    expect(getApiErrorMessage(err)).toBe('服务器繁忙')
  })

  it('最后回退 error.message 与兜底文案', () => {
    expect(getApiErrorMessage({ message: 'Network Error' })).toBe('Network Error')
    expect(getApiErrorMessage(null)).toBe('操作失败')
    expect(getApiErrorMessage('')).toBe('操作失败')
  })
})