import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createMetadataPolling, type MetadataPollingInput } from "./metadata-polling"

type Result = { pending: boolean }

function pollingHarness(request: () => Promise<Result>) {
  let now = 0
  let calls = 0
  let dispose = () => {}
  const timers: { at: number; callback: () => void }[] = []
  const [retained, setRetained] = createSignal<Result>()
  const input: MetadataPollingInput = {
    scope: "server",
    integrationID: "jira",
    connectionID: "connection",
    issueProjects: ["APP"],
    refresh: 0,
  }

  createRoot((rootDispose) => {
    dispose = rootDispose
    createMetadataPolling({
      input: () => input,
      retained,
      request: async () => {
        calls++
        return request()
      },
      pending: (result) => result.pending,
      onCycle: () => {},
      onLoading: () => {},
      onError: () => {},
      onResult: (result) => setRetained(result),
      onPolling: () => {},
      onDeadline: () => {},
      now: () => now,
      schedule: (callback, delay) => {
        const timer = { at: now + delay, callback }
        timers.push(timer)
        return timer as unknown as ReturnType<typeof setTimeout>
      },
      cancel: (timer) => {
        const index = timers.indexOf(timer as unknown as (typeof timers)[number])
        if (index >= 0) timers.splice(index, 1)
      },
    })
  })

  const advance = async () => {
    await Promise.resolve()
    await Promise.resolve()
    timers.sort((a, b) => a.at - b.at)
    const timer = timers.shift()
    if (!timer) return false
    now = timer.at
    timer.callback()
    await Promise.resolve()
    await Promise.resolve()
    return true
  }
  return { advance, calls: () => calls, now: () => now, timers, dispose }
}

describe("metadata polling controller", () => {
  test("does not retrigger after storing a completed response", async () => {
    const harness = pollingHarness(async () => ({ pending: false }))
    expect(await harness.advance()).toBe(true)
    expect(harness.calls()).toBe(1)
    expect(harness.timers).toHaveLength(0)
    await Promise.resolve()
    expect(harness.calls()).toBe(1)
    harness.dispose()
  })

  test("uses one deadline for the cycle and makes no request at or after it", async () => {
    const harness = pollingHarness(async () => ({ pending: true }))
    while (await harness.advance()) {}
    expect(harness.now()).toBe(120_000)
    expect(harness.calls()).toBeGreaterThan(1)
    expect(harness.timers).toHaveLength(0)
    const calls = harness.calls()
    await Promise.resolve()
    expect(harness.calls()).toBe(calls)
    harness.dispose()
  })
})
