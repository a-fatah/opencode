import { describe, expect, test } from "bun:test"
import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { IssueWatcherGroup } from "../src/groups/issue-watcher"

const spec = OpenApi.fromApi(HttpApi.make("test").add(IssueWatcherGroup))

describe("issue watcher Slice 8 contracts", () => {
  test("exposes all location-free action routes", () => {
    expect(Object.values(IssueWatcherGroup.endpoints).map((endpoint) => [endpoint.method, endpoint.path])).toEqual(
      expect.arrayContaining([
        ["POST", "/api/issue-watcher/inbox/bulk"],
        ["POST", "/api/issue-watcher/inbox/:matchID/approve"],
        ["POST", "/api/issue-watcher/inbox/:matchID/route"],
        ["POST", "/api/issue-watcher/inbox/:matchID/skip"],
        ["POST", "/api/issue-watcher/inbox/:matchID/dismiss"],
        ["POST", "/api/issue-watcher/inbox/:matchID/rematerialize"],
        ["GET", "/api/issue-watcher/inbox/:matchID/duplicate"],
        ["POST", "/api/issue-watcher/inbox/:matchID/duplicate"],
        ["POST", "/api/issue-watcher/watchers/:watcherID/ignore"],
        ["DELETE", "/api/issue-watcher/watchers/:watcherID/ignore/:externalID"],
        ["GET", "/api/issue-watcher/sessions/:sessionID"],
        ["POST", "/api/issue-watcher/sessions/:sessionID/sync"],
      ]),
    )
    expect(Object.values(IssueWatcherGroup.endpoints).every((endpoint) => endpoint.middlewares.size === 0)).toBeTrue()
  })

  test("publishes canonical Slice 8 schemas and typed errors", () => {
    expect(spec.components.schemas["IssueWatcher.MaterializeInput"]).toBeDefined()
    expect(spec.components.schemas["IssueWatcher.MaterializeResult"]).toBeDefined()
    expect(spec.components.schemas["IssueWatcher.DuplicateDetail"]).toBeDefined()
    expect(spec.components.schemas["SessionProvenance.Detail"]).toBeDefined()
    expect(spec.components.schemas.IssueMatchNotFoundError).toBeDefined()
    expect(spec.components.schemas.IssueMatchConflictError).toBeDefined()
    expect(spec.components.schemas.IssueWatcherSessionNotFoundError).toBeDefined()
  })
})
