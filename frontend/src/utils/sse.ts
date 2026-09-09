/**
 * SSE (Server-Sent Events) client utility for streaming migration progress.
 */

export interface SSEEvent {
  type: string
  [key: string]: unknown
}

export interface SSEClientOptions {
  url: string
  body: Record<string, unknown>
  token?: string
  onEvent?: (event: SSEEvent) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

/**
 * Send POST request and read SSE stream via fetch + ReadableStream.
 * Returns an AbortController to allow cancellation.
 */
export function createSSEClient(options: SSEClientOptions): AbortController {
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
