import { describe, expect, test } from "bun:test"
import { watcherConnectionSource, type WatcherSummary } from "./api"
import type { IntegrationSource } from "@/components/settings-v2/integrations-logic"

describe("watcher connection source", () => {
  test("uses the watcher's immutable connection instead of the integration's latest connection", () => {
    const latest = {
      id: "connection-latest",
      label: "Latest tenant",
      tenantIdentity: "latest.example.com",
      inputs: {},
      verification: { status: "connected" as const, detail: "Connected", checkedAt: 2 },
    }
    const exact = { ...latest, id: "connection-watcher", label: "Watcher tenant", tenantIdentity: "watcher.example.com" }
    const sources = [{ integration: { id: "jira" }, connection: latest }] as IntegrationSource[]
    const watcher = {
      watcher: { integrationID: "jira" },
      connection: exact,
    } as WatcherSummary

    expect(watcherConnectionSource(sources, watcher)?.connection).toBe(exact)
  })

  test("does not fall back to the integration's unrelated connection", () => {
    const sources = [{ integration: { id: "jira" }, connection: { id: "connection-latest" } }] as IntegrationSource[]
    const watcher = { watcher: { integrationID: "jira" } } as WatcherSummary

    expect(watcherConnectionSource(sources, watcher)).toBeUndefined()
  })
})
