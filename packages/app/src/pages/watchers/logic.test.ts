import { describe, expect, test } from "bun:test"
import {
  authExpiredMessage,
  canSave,
  composeMetadataScope,
  criteriaSummary,
  emptyWatcherDraft,
  inboxActions,
  inboxAttentionCount,
  inboxBulkActionSupports,
  inboxQuery,
  metadataPollDelay,
  metadataPollNext,
  metadataSyncState,
  outcomeLabel,
  routeRungs,
  routingSummary,
  retainGlobalMetadata,
  selectableInboxItem,
  splitValues,
  withUnavailableOptions,
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
    expect(criteriaSummary({ ...draft.criteria, assignee: { id: "jira-account-id" } }, "Ada Lovelace"))
      .toBe("ENG · assigned to Ada Lovelace · 1 label")
    expect(criteriaSummary({ ...draft.criteria, assignee: { id: "jira-account-id" } }))
      .toBe("ENG · assigned to Unknown user · 1 label")
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

  test("adds explicit unavailable choices without changing stored values", () => {
    expect(withUnavailableOptions([{ id: "open", name: "Open" }], ["deleted", "open", "deleted"])).toEqual([
      { id: "open", name: "Open" },
      { id: "deleted", name: "Unavailable: deleted" },
    ])
  })

  test("caps metadata polling backoff and stops only at completion or deadline", () => {
    expect([0, 1, 2, 3, 4, 20].map(metadataPollDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 10_000, 10_000])
    expect(metadataPollNext({ pending: true, elapsed: 119_999 })).toBe("poll")
    expect(metadataPollNext({ pending: true, elapsed: 120_000 })).toBe("deadline")
    expect(metadataPollNext({ pending: false, elapsed: 1 })).toBe("complete")
  })

  test("keeps an old sync warning while its retry is in flight", () => {
    expect(metadataSyncState({
      result: { syncing: true, syncError: "Previous Jira sync failed" },
      resyncing: false,
    })).toEqual({
      refreshing: true,
      warning: "Previous Jira sync failed",
    })
  })

  test("retains only global metadata when the project scope changes", () => {
    const previous = {
      projects: [{ key: "OLD" }], users: [{ id: "old-user" }], labels: ["global"],
      statuses: [{ id: "old-status" }], components: [{ id: "old-component" }],
      issueTypes: [{ id: "old-type" }], fields: [{ id: "global-field" }],
    }
    expect(retainGlobalMetadata(previous)).toEqual({
      ...previous, users: [], statuses: [], components: [], issueTypes: [],
    })
    const next = {
      projects: [{ key: "NEW" }], users: [{ id: "new-user" }], labels: ["next"],
      statuses: [{ id: "new-status" }], components: [{ id: "new-component" }],
      issueTypes: [{ id: "new-type" }], fields: [{ id: "next-field" }],
    }
    expect(composeMetadataScope(previous, next, true)).toEqual({
      ...next,
      projects: [{ key: "NEW" }, { key: "OLD" }],
      labels: ["global", "next"],
      fields: [{ id: "next-field" }, { id: "global-field" }],
    })
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
