import { createComputed, onCleanup, untrack } from "solid-js"
import { metadataPollDeadline, metadataPollDelay, metadataPollNext } from "./logic"

export type MetadataPollingInput = {
  scope: string
  integrationID: string
  connectionID: string
  issueProjects: string[]
  refresh: number
}

export function createMetadataPolling<T>(options: {
  input: () => MetadataPollingInput | undefined
  retained: () => T | undefined
  request: (input: MetadataPollingInput, signal: AbortSignal) => Promise<T>
  pending: (result: T) => boolean
  onCycle: (input: MetadataPollingInput) => void
  onLoading: (loading: boolean) => void
  onError: (error: string) => void
  onResult: (result: T, previous: T | undefined, pending: boolean) => void
  onPolling: (polling: boolean) => void
  onDeadline: () => void
  now?: () => number
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}) {
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? clearTimeout

  createComputed(() => {
    const input = options.input()
    untrack(() => {
      if (!input) return
      options.onCycle(input)

      const controller = new AbortController()
      const startedAt = now()
      let timer: ReturnType<typeof setTimeout> | undefined

      const stopAtDeadline = () => {
        options.onLoading(false)
        options.onPolling(false)
        options.onDeadline()
      }
      const queue = (attempt: number, delay: number) => {
        const remaining = metadataPollDeadline - (now() - startedAt)
        if (remaining <= 0) {
          stopAtDeadline()
          return
        }
        options.onPolling(true)
        timer = schedule(() => void read(attempt), Math.min(delay, remaining))
      }
      const read = async (attempt = 0) => {
        if (now() - startedAt >= metadataPollDeadline) {
          stopAtDeadline()
          return
        }
        options.onLoading(!untrack(options.retained))
        options.onError("")
        const result = await options.request(input, controller.signal).catch((error: Error) => {
          if (error.name !== "AbortError") options.onError(error.message)
          return undefined
        })
        if (controller.signal.aborted) return

        options.onLoading(false)
        const pending = !result || options.pending(result)
        const next = metadataPollNext({ pending, elapsed: now() - startedAt })
        if (result) options.onResult(result, untrack(options.retained), pending)
        if (next === "poll") {
          queue(attempt + 1, metadataPollDelay(attempt))
          return
        }
        options.onPolling(false)
        if (next === "deadline") options.onDeadline()
      }

      queue(0, 300)
      onCleanup(() => {
        if (timer !== undefined) cancel(timer)
        controller.abort()
      })
    })
  })
}
