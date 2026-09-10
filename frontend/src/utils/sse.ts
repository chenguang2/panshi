/**
 * SSE (Server-Sent Events) client utility for streaming migration progress.
 */

export interface SSEEvent {
  type: string
  [key: string]: unknown
}

interface SSECallbacks<T extends SSEEvent = SSEEvent> {
  onEvent?: (event: T) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

export interface SSEClientOptions<T extends SSEEvent = SSEEvent> extends SSECallbacks<T> {
  url: string
  body: Record<string, unknown>
  token?: string
}

/**
 * Send POST request and read SSE stream via fetch + ReadableStream.
 * Returns an AbortController to allow cancellation.
 *
 * 泛型 T：传入判别联合事件类型（如 MigrationStreamEvent）后，
 * onEvent 回调内按 event.type switch 可自然收窄，无需断言（v3 8B-2）。
 */
export function createSSEClient<T extends SSEEvent = SSEEvent>(options: SSEClientOptions<T>): AbortController {
  const { url, body, token, onEvent, onError, onComplete } = options
  const controller = new AbortController()

  async function run() {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onEvent?.(data)
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      onComplete?.()
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Request was cancelled, don't report error
        return
      }
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  run()
  return controller
}
