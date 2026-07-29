import { describe, expect, test } from "bun:test"
import { canSave, criteriaSummary, emptyWatcherDraft, routeRungs, routingSummary, splitValues } from "./logic"

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
