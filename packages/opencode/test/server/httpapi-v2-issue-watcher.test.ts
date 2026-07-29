import { afterEach, describe, expect, test } from "bun:test"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, init: RequestInit = {}) {
  return HttpApiApp.webHandler().handler(new Request(`http://localhost${route}`, init), context)
}

const input = {
  integrationID: "jira",
  connectionID: "icn_connection-1",
  name: "API issues",
  enabled: false,
  criteria: {
    issueProjects: ["API"],
    watchUpdates: true,
  },
  routing: {
    mappings: [],
    fallback: "inbox",
    workspace: { type: "current" },
  },
  action: {
    mode: "inbox",
    promptTemplate: "Resolve {{issue.key}}",
    writeback: {
      comment: false,
      commentOnFailure: false,
    },
  },
}

const json = (method: string, body: object): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

function watcher(value: unknown): asserts value is typeof input & {
  id: string
  enabled: boolean
  timeCreated: number
  timeUpdated: number
} {
  expect(value).toBeObject()
  expect(value).toHaveProperty("id")
  expect(value).toHaveProperty("timeCreated")
  expect(value).toHaveProperty("timeUpdated")
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 issue watcher HttpApi", () => {
  test("exposes location-free Jira sources and watcher settings", async () => {
    const sources = await request("/api/issue-watcher/integrations")
    expect(sources.status).toBe(200)
    expect(await sources.json()).toEqual([
      expect.objectContaining({
        integration: expect.objectContaining({
          id: "jira",
          name: "Jira",
          methods: [expect.objectContaining({ type: "key", prompts: expect.any(Array) })],
        }),
        watcherCount: 0,
        owner: { status: "active" },
      }),
    ])

    const settings = await request("/api/issue-watcher/settings")
    expect(settings.status).toBe(200)
    expect(await settings.json()).toEqual({
      pollInterval: 120,
      concurrentRuns: 3,
      retryFailedRuns: "once",
      owner: { status: "active" },
    })

    const invalid = await request(
      "/api/issue-watcher/integrations/jira/verify",
      json("POST", { key: "secret", inputs: {}, useSavedConnection: true }),
    )
    expect(invalid.status).toBe(400)
  })

  test("manages global watchers without location transport", async () => {
    const route = "/api/issue-watcher/watchers"
    const empty = await request(route)
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual([])

    const created = await request(route, json("POST", input))
    expect(created.status).toBe(200)
    const createdWatcher: unknown = await created.json()
    watcher(createdWatcher)
    expect(createdWatcher).toMatchObject(input)
    expect(createdWatcher.id).toStartWith("iwt_")

    const listed = await request(route)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([createdWatcher])

    const found = await request(`${route}/${createdWatcher.id}`)
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual(createdWatcher)

    const updated = await request(`${route}/${createdWatcher.id}`, json("PATCH", { name: "Backend issues" }))
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({
      id: createdWatcher.id,
      integrationID: input.integrationID,
      connectionID: input.connectionID,
      name: "Backend issues",
      enabled: false,
    })

    const immutable = await request(
      `${route}/${createdWatcher.id}`,
      json("PATCH", { integrationID: "github", connectionID: "connection-2" }),
    )
    expect(immutable.status).toBe(400)

    const enabled = await request(`${route}/${createdWatcher.id}/enable`, json("POST", { enabled: true }))
    expect(enabled.status).toBe(200)
    expect(await enabled.json()).toMatchObject({ id: createdWatcher.id, enabled: true })

    const archived = await request(`${route}/${createdWatcher.id}`, { method: "DELETE" })
    expect(archived.status).toBe(204)
    expect(await request(route).then((response) => response.json())).toEqual([])

    const missingID = "iwt_00000000000000000000000000"
    const missing = await request(`${route}/${missingID}`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({
      _tag: "IssueWatcherNotFoundError",
      watcherID: missingID,
      message: `Issue watcher not found: ${missingID}`,
    })
  })
})
