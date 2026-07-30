import { describe, expect, test } from "bun:test"
import type { SessionInput } from "@opencode-ai/schema/session-input"
import {
  awaitingRunLocked,
  awaitingRunPromptState,
  clearedAwaitingRunState,
  awaitingRunVisible,
  confirmationPair,
  createAwaitingRunApi,
  latestHandoffAttempt,
  loadAwaitingRunHistory,
  pendingHydration,
  runAttemptID,
  saveAndRun,
  shouldRefreshAwaitingRun,
  type AwaitingRunState,
} from "./awaiting-run"
import { createStore } from "solid-js/store"

const input = {
  admittedSeq: 1,
  id: "msg_1",
  sessionID: "ses_1",
  prompt: { text: "server prompt" },
  delivery: "steer",
  timeCreated: 1,
} as unknown as SessionInput.Pending

describe("awaiting run", () => {
  test("hydrates once and never overwrites user edits", () => {
    const state: AwaitingRunState = { locked: false }
    expect(pendingHydration(state, "", input)).toBe("server prompt")
    expect(pendingHydration({ ...state, hydratedID: input.id, sourceText: input.prompt.text }, "user edit", input)).toBeUndefined()
    expect(pendingHydration(state, "already typing", input)).toBeUndefined()
    expect(pendingHydration({ ...state, sessionID: "ses_other", messageID: "msg_other" }, "stale", input)).toBe("server prompt")
    expect(awaitingRunPromptState(input, "server prompt")).toEqual({
      sessionID: "ses_1",
      messageID: "msg_1",
      hydratedID: "msg_1",
      sourceText: "server prompt",
      locked: false,
    })
    expect(clearedAwaitingRunState()).toEqual({ locked: true })
  })

  test("reuses run and confirmation IDs across retries", () => {
    const state = {}
    const attemptID = runAttemptID(state, () => "sea_run")
    expect(runAttemptID({ ...state, attemptID }, () => "sea_other")).toBe("sea_run")

    const pair = confirmationPair(state, "sea_old", () => "sea_new")
    expect(confirmationPair({ ...state, confirmation: pair }, "sea_old", () => "sea_other")).toEqual(pair)
  })

  test("locks on claim and execution start events", () => {
    expect(awaitingRunLocked({ type: "session.next.prompt.claimed", data: { sessionID: "ses_1" } }, "ses_1")).toBe(true)
    expect(awaitingRunLocked({ type: "session.execution.started", data: { sessionID: "ses_1" } }, "ses_1")).toBe(true)
    expect(awaitingRunLocked({ type: "session.execution.started", data: { sessionID: "ses_2" } }, "ses_1")).toBe(false)
  })

  test("refreshes for input and execution lifecycle events", () => {
    expect(shouldRefreshAwaitingRun({ type: "session.next.prompt.replaced", data: { sessionID: "ses_1" } }, "ses_1")).toBe(true)
    expect(shouldRefreshAwaitingRun({ type: "session.execution.failed", data: { sessionID: "ses_1" } }, "ses_1")).toBe(true)
    expect(shouldRefreshAwaitingRun({ type: "message.updated", data: { sessionID: "ses_1" } }, "ses_1")).toBe(false)
  })

  test("finds the latest unresolved handoff attempt", () => {
    expect(
      latestHandoffAttempt([
        { type: "session.execution.scheduled", data: { sessionID: "ses_1", attemptID: "sea_old" } },
        { type: "session.execution.failed", data: { sessionID: "ses_1", attemptID: "sea_old" } },
        { type: "session.execution.scheduled", data: { sessionID: "ses_1", attemptID: "sea_unknown" } },
      ]),
    ).toBe("sea_unknown")
  })

  test("loads every history page before deriving the unresolved handoff", async () => {
    const after: Array<number | undefined> = []
    const events = await loadAwaitingRunHistory(
      {
        history: async (_sessionID, cursor) => {
          after.push(cursor)
          if (cursor === undefined)
            return {
              data: [{ type: "session.execution.scheduled", durable: { seq: 200 }, data: { attemptID: "sea_old" } }],
              hasMore: true,
            }
          return {
            data: [
              { type: "session.execution.failed", durable: { seq: 201 }, data: { attemptID: "sea_old" } },
              { type: "session.execution.scheduled", durable: { seq: 202 }, data: { attemptID: "sea_latest" } },
            ],
            hasMore: false,
          }
        },
      },
      "ses_1",
    )
    expect(after).toEqual([undefined, 200])
    expect(latestHandoffAttempt(events)).toBe("sea_latest")
  })

  test("requests protocol-valid history pages with the aggregate cursor", async () => {
    const urls: string[] = []
    const fetch = Object.assign(
      async (request: string | URL | Request) => {
        urls.push(request.toString())
        const after = new URL(request.toString()).searchParams.get("after")
        return Response.json(
          after === null
            ? { data: [{ type: "session.execution.scheduled", durable: { seq: 100 } }], hasMore: true }
            : { data: [{ type: "session.execution.completed", durable: { seq: 101 } }], hasMore: false },
        )
      },
      { preconnect: globalThis.fetch.preconnect },
    )
    const api = createAwaitingRunApi({
      baseUrl: "https://example.test",
      fetch,
    })

    expect(await loadAwaitingRunHistory(api, "ses/query value")).toHaveLength(2)
    expect(urls).toEqual([
      "https://example.test/api/session/ses%2Fquery%20value/history?limit=100",
      "https://example.test/api/session/ses%2Fquery%20value/history?limit=100&after=100",
    ])
  })

  test("saves an edited prompt before claiming the exact saved input", async () => {
    const calls: string[] = []
    const saved = { ...input, id: "msg_saved", prompt: { text: "edited" } } as SessionInput.Pending
    await saveAndRun({
      api: {
        replace: async (_sessionID, messageID, prompt) => {
          calls.push(`replace:${messageID}:${prompt.text}`)
          return saved
        },
        resume: async (_sessionID, messageID, attemptID) => {
          calls.push(`resume:${messageID}:${attemptID}`)
        },
      },
      sessionID: "ses_1",
      pending: input,
      prompt: { text: "edited" },
      attemptID: "sea_retry",
    })
    expect(calls).toEqual(["replace:msg_1:edited", "resume:msg_saved:sea_retry"])
  })

  test("integrates hydration, cancellation locking, and status transitions with reactive state", () => {
    const [state, setState] = createStore<AwaitingRunState>({ locked: false })
    const hydrated = pendingHydration(state, "", input)
    expect(hydrated).toBe("server prompt")
    setState({ hydratedID: input.id, sourceText: hydrated })
    expect(pendingHydration(state, "edited", input)).toBeUndefined()

    setState("locked", true)
    expect(state.locked).toBeTrue()
    expect(awaitingRunLocked({ type: "session.execution.started", data: { sessionID: "ses_1" } }, "ses_1")).toBeTrue()
    expect(shouldRefreshAwaitingRun({ type: "session.execution.succeeded", data: { sessionID: "ses_1" } }, "ses_1")).toBeTrue()
    expect(awaitingRunVisible("awaiting_run")).toBeTrue()
    expect(awaitingRunVisible("handoff_unknown")).toBeTrue()
    expect(awaitingRunVisible("running")).toBeFalse()
  })
})
