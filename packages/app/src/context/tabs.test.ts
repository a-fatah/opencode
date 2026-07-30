import { describe, expect, test } from "bun:test"
import { createComputed, createRoot, getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createTabMemory } from "./tab-memory"
import { nextTabAfterClose, pushClosedTab, removeClosedTabs, takeClosedTab, type ClosedTab } from "./closed-tabs"
import { peekTabInfo, tabHref, tabKey, type SessionTab, type Tab, type TabInfo } from "./tabs"
import type { ServerConnection } from "./server"

const server = "local\nhttp://localhost:4096" as ServerConnection.Key

function sessionTab(sessionId: string): SessionTab {
  return { type: "session", server, sessionId }
}

describe("tab memory", () => {
  test("keeps state until its tab is removed", () => {
    createRoot((dispose) => {
      const memory = createTabMemory(getOwner())
      let disposed = 0
      const first = memory.ensure("tab", "prompt", () => {
        onCleanup(() => disposed++)
        return { value: "prompt" }
      })

      expect(memory.ensure("tab", "prompt", () => ({ value: "other" }))).toBe(first)
      expect(memory.get<typeof first>("tab", "prompt")).toBe(first)
      expect(memory.get("missing", "prompt")).toBeUndefined()
      expect(memory.ensure("other", "prompt", () => ({ value: "other" }))).not.toBe(first)

      memory.remove("tab")
      expect(disposed).toBe(1)
      expect(memory.ensure("tab", "prompt", () => ({ value: "new" }))).not.toBe(first)
      dispose()
    })
  })
})

describe("closed tab stack", () => {
  test("records session tabs with their index", () => {
    const stack = pushClosedTab([], sessionTab("a"), 2)

    expect(stack).toEqual([{ tab: sessionTab("a"), index: 2 }])
  })

  test("ignores draft tabs", () => {
    const draft: Tab = { type: "draft", draftID: "d1", server, directory: "/tmp" }

    expect(pushClosedTab([], draft, 0)).toEqual([])
  })

  test("records and reopens utility tabs", () => {
    const inbox = { type: "inbox" as const, server }
    const watcher = { type: "watcher" as const, server, watcherID: "watcher/1" }
    const stack = pushClosedTab(pushClosedTab([], inbox, 0), watcher, 1)

    expect(takeClosedTab(stack, [inbox])).toEqual({
      entry: { tab: watcher, index: 1 },
      stack: [{ tab: inbox, index: 0 }],
    })
    expect(takeClosedTab([{ tab: inbox, index: 0 }], [inbox])).toEqual({ stack: [] })
  })

  test("caps the stack size", () => {
    const stack = Array.from({ length: 30 }, (_, i) => i).reduce<ClosedTab[]>(
      (acc, i) => pushClosedTab(acc, sessionTab(`s${i}`), i),
      [],
    )

    expect(stack).toHaveLength(25)
    expect(stack[0]?.tab).toEqual(sessionTab("s5"))
    expect(stack.at(-1)?.tab).toEqual(sessionTab("s29"))
  })

  test("pops the most recently closed tab", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]
    const result = takeClosedTab(stack, [])

    expect(result.entry?.tab).toEqual(sessionTab("b"))
    expect(result.stack).toEqual([{ tab: sessionTab("a"), index: 0 }])
  })

  test("skips entries whose tab is already open", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]
    const result = takeClosedTab(stack, [sessionTab("b")])

    expect(result.entry?.tab).toEqual(sessionTab("a"))
    expect(result.stack).toEqual([])
  })

  test("returns no entry when everything is open or empty", () => {
    expect(takeClosedTab([], []).entry).toBeUndefined()

    const result = takeClosedTab([{ tab: sessionTab("a"), index: 0 }], [sessionTab("a")])
    expect(result.entry).toBeUndefined()
    expect(result.stack).toEqual([])
  })

  test("purges removed sessions", () => {
    const stack = [
      { tab: sessionTab("a"), index: 0 },
      { tab: sessionTab("b"), index: 1 },
    ]

    expect(removeClosedTabs(stack, server, ["a"])).toEqual([{ tab: sessionTab("b"), index: 1 }])
  })

  test("does not navigate when a background tab closes", () => {
    const tabs = [sessionTab("a"), sessionTab("b"), sessionTab("c")]

    expect(nextTabAfterClose(tabs, 1, false)).toBeUndefined()
    expect(nextTabAfterClose(tabs, 1, true)).toEqual(sessionTab("c"))
    expect(nextTabAfterClose([sessionTab("a")], 0, true)).toBeNull()
  })
})

describe("utility tabs", () => {
  test("builds stable server-scoped hrefs and keys", () => {
    const inbox = { type: "inbox" as const, server }
    const watchers = { type: "watchers" as const, server }
    const watcher = { type: "watcher" as const, server, watcherID: "new rule" }

    expect(tabHref(inbox)).toEndWith("/inbox")
    expect(tabHref(watchers)).toEndWith("/watchers")
    expect(tabHref(watcher)).toEndWith("/watchers/new%20rule")
    expect(new Set([tabKey(inbox), tabKey(watchers), tabKey(watcher)]).size).toBe(3)
  })

  test("reading current tab info does not subscribe metadata writers", () => {
    createRoot((dispose) => {
      const [info, setInfo] = createStore<Record<string, TabInfo>>({})
      let runs = 0

      createComputed(() => {
        runs++
        peekTabInfo(info, "watcher")
      })
      expect(runs).toBe(1)

      setInfo("watcher", { title: "Watcher" })
      expect(runs).toBe(1)
      dispose()
    })
  })
})
