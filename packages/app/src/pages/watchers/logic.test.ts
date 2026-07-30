import { describe, expect, test } from "bun:test"
import {
  authExpiredMessage,
  canSave,
  criteriaSummary,
  emptyWatcherDraft,
  inboxActions,
  inboxAttentionCount,
  inboxBulkActionSupports,
  inboxQuery,
  outcomeLabel,
  routeRungs,
  routingSummary,
  selectableInboxItem,
  splitValues,
  watcherAuthExpired,
} from "./logic"

describe("watcher editor logic", () => {
  test("normalizes comma-separated rule values", () => {
    expect(splitValues(" bug, ready,bug, , blocked ")).toEqual(["bug", "ready", "blocked"])
  })

  test("summarizes criteria and routing", () => {
    const draft = emptyWatcherDraft()
    draft.criteria = { issueProjects: ["ENG"], assignee: "me", labels: ["agent"], watchUpdates: true }
    draft.routing = {
      ...draft.routing,
      mappings: [{ key: { type: "label", value: "frontend" }, projectID: "prj_web" }],
    }
    expect(criteriaSummary(draft.criteria)).toBe("ENG · assigned to me · 1 label")
    expect(routingSummary(draft.routing)).toBe("1 mapping")
  })

  test("keeps the routing ladder in first-match order", () => {
    const draft = emptyWatcherDraft()
    expect(routeRungs(draft.routing).map((rung) => rung.title)).toEqual([
      "1. Repository field",
      "2. Explicit mappings",
      "3. Inbox fallback",
    ])
  })

  test("requires a source, name, and prompt before saving", () => {
    const draft = emptyWatcherDraft()
    expect(canSave(draft)).toBe(false)
    draft.name = "Frontend bugs"
    draft.integrationID = "int_github"
    draft.connectionID = "cred_github"
    expect(canSave(draft)).toBe(true)
  })
})

describe("watcher inbox logic", () => {
  test("uses server filters for every paginated view", () => {
    expect(inboxQuery("all")).toEqual({})
    expect(inboxQuery("attention")).toEqual({ filter: "attention" })
    expect(inboxQuery("dismissed")).toEqual({ state: "dismissed" })
    expect(inboxQuery("source:jira")).toEqual({ integrationID: "jira" })
  })

  test("describes every disabled inbox action state", () => {
    expect(inboxActions("pending")).toEqual(["Create & run", "Awaiting run", "Skip", "Dismiss"])
    expect(inboxActions("unrouted")).toEqual(["Pick project", "Skip"])
    expect(inboxActions("duplicate")).toEqual(["Open session", "Dismiss"])
    expect(inboxActions("skipped")).toEqual([])
    expect(inboxActions("dismissed")).toEqual([])
  })

  test("combines attention counters and labels run outcomes", () => {
    expect(inboxAttentionCount({ unrouted: 2, duplicate: 3, failedMaterializations: 1 })).toBe(6)
    expect(outcomeLabel("auth_failed")).toBe("Authentication expired")
  })

  test("selects actionable states and validates each bulk action", () => {
    const states = ["pending", "skipped", "dismissed", "duplicate", "unrouted"] as const
    expect(states.filter(selectableInboxItem)).toEqual(["pending", "duplicate", "unrouted"])
    expect(states.filter((state) => inboxBulkActionSupports("approve", state))).toEqual(["pending"])
    expect(states.filter((state) => inboxBulkActionSupports("skip", state))).toEqual(["pending", "unrouted"])
    expect(states.filter((state) => inboxBulkActionSupports("dismiss", state))).toEqual(["pending", "duplicate"])
  })

  test("preserves the cursor guarantee in expired-auth copy", () => {
    expect(authExpiredMessage("Jira", "Assigned bugs")).toBe(
      "Jira authentication expired. Assigned bugs is paused. Its cursor was not advanced, and polling resumes from that cursor after reconnect.",
    )
  })

  test("recognizes expired watcher authentication without treating unrelated failures as auth", () => {
    expect(watcherAuthExpired({ watcher: { enabled: false }, connection: { verification: { status: "needs_auth" } } })).toBe(true)
    expect(watcherAuthExpired({ watcher: { enabled: false, lastError: "Authentication failed" } })).toBe(true)
    expect(watcherAuthExpired({ watcher: { enabled: false, lastError: "Routing failed" } })).toBe(false)
  })
})
