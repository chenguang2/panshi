import { describe, it, expect } from 'vitest'
import { consumeSSEDataLines, extractSSEErrorMessage } from '../sse'

/** 构造一个分块输出的 Response（模拟网络流式到达） */
function fakeResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i++
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream)
}

describe('consumeSSEDataLines（v3 8B-3 收敛三处手写 SSE 解析）', () => {
  it('跨 chunk 粘包正确切分，仅回调 data: 行', async () => {
    const received: string[] = []
    await consumeSSEDataLines(
      fakeResponse(['data: {"a":1}\ndata: {"a":2}\n', 'da', 'ta: {"a":3}\n\n']),
      (raw) => {
        received.push(raw)
      },
    )
    expect(received).toEqual(['{"a":1}', '{"a":2}', '{"a":3}'])
  })

  it('忽略非 data 行、空行与行首空白', async () => {
    const received: string[] = []
    await consumeSSEDataLines(
      fakeResponse([': ping\n\nevent: log\n  data: spaced\ndata:tail\n']),
      (raw) => {
        received.push(raw)
      },
    )
    // "data:tail" 无前缀空格不属于协议行；"  data: spaced" 容忍行首空白
    expect(received).toEqual(['spaced'])
  })

  it('onData 返回 false 立即终止（不再消费后续块）', async () => {
    const received: string[] = []
    await consumeSSEDataLines(
      fakeResponse(['data: one\ndata: two\ndata: three\n']),
      (raw) => {
        received.push(raw)
        return received.length === 2 ? false : undefined
      },
    )
    expect(received).toEqual(['one', 'two'])
  })

  it('无 body 的响应抛错（调用方走错误分支）', async () => {
    await expect(consumeSSEDataLines(new Response(null), () => {})).rejects.toThrow(
      'No response body'
    )
  })
})

describe('extractSSEErrorMessage', () => {
  it('优先提取 JSON detail', async () => {
    const resp = new Response(JSON.stringify({ detail: '目标库连接失败' }), { status: 400 })
    expect(await extractSSEErrorMessage(resp)).toBe('目标库连接失败')
  })

  it('非 JSON 响应回退到状态码文案', async () => {
    const resp = new Response('Internal Server Error', { status: 500 })
    expect(await extractSSEErrorMessage(resp)).toBe('请求失败 (500)')
  })
})
