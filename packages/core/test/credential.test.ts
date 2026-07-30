import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Credential } from "@opencode-ai/core/credential"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Integration } from "@opencode-ai/core/integration"
import { testEffect } from "./lib/effect"
import { Database } from "@opencode-ai/core/database/database"
import { IssueMetadataSnapshotTable, IssueMetadataSyncTable } from "@opencode-ai/core/issue-watcher/sql"
import { eq } from "drizzle-orm"

const it = testEffect(LayerNode.compile(Credential.node).pipe(Layer.provideMerge(LayerNode.compile(Database.node))))

describe("Credential", () => {
  it.effect("stores, updates, lists, and removes credentials", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const integrationID = Integration.ID.make("openai")
      const created = yield* credentials.create({
        integrationID,
        label: "Work",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })

      expect(yield* credentials.list(integrationID)).toEqual([created])
      yield* credentials.update(created.id, { label: "Personal" })
      expect((yield* credentials.list(integrationID))[0]?.label).toBe("Personal")

      const replacement = yield* credentials.create({
        integrationID,
        label: "Replacement",
        value: Credential.Key.make({ type: "key", key: "replacement" }),
      })
      expect(yield* credentials.list(integrationID)).toEqual([replacement])

      yield* credentials.remove(replacement.id)
      expect(yield* credentials.list(integrationID)).toEqual([])
    }),
  )

  it.effect("legacy key replacement preserves stable issue connections", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const integrationID = Integration.ID.make("jira")
      const stable = yield* credentials.createConnection({
        integrationID,
        connectionID: Credential.ConnectionID.create(),
        tenantIdentity: "https://example.atlassian.net",
        value: Credential.Key.make({ type: "key", key: "watcher" }),
      })
      const legacy = yield* credentials.create({
        integrationID,
        value: Credential.Key.make({ type: "key", key: "legacy" }),
      })

      expect(yield* credentials.list(integrationID)).toEqual([stable, legacy])
    }),
  )

  it.effect("rotates a stable connection without changing its tenant", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const integrationID = Integration.ID.make("jira")
      const connectionID = Credential.ConnectionID.create()
      const created = yield* credentials.createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "https://example.atlassian.net",
        label: "Jira",
        value: Credential.Key.make({ type: "key", key: "first", inputs: { email: "one@example.com" } }),
      })
      const rotated = yield* credentials.rotateConnection(connectionID, {
        value: Credential.Key.make({ type: "key", key: "second", inputs: { email: "two@example.com" } }),
      })

      expect(rotated.id).toBe(created.id)
      expect(rotated.connectionID).toBe(connectionID)
      expect(rotated.tenantIdentity).toBe("https://example.atlassian.net")
      expect(rotated.value).toMatchObject({ type: "key", key: "second", inputs: { email: "two@example.com" } })
    }),
  )

  it.effect("persists initial metadata recovery intent and updates health without rotation", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const database = yield* Database.Service
      const connectionID = Credential.ConnectionID.create()
      const created = yield* credentials.createConnection({
        integrationID: Integration.ID.make("jira-health"),
        connectionID,
        tenantIdentity: "https://example.atlassian.net",
        value: Credential.Key.make({ type: "key", key: "secret", inputs: { email: "a@example.com" } }),
      })
      const initialSnapshot = yield* database.db.select().from(IssueMetadataSnapshotTable)
        .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get().pipe(Effect.orDie)
      const initialSync = yield* database.db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).get().pipe(Effect.orDie)
      expect(initialSnapshot?.credential_generation).toBe(0)
      expect(initialSync).toMatchObject({ scope: "global", requested_generation: 1, completed_generation: 0 })

      const updated = yield* credentials.updateConnectionHealth(connectionID, {
        status: "connected",
        detail: "healthy",
        checkedAt: 42,
      })
      expect(updated.value).toMatchObject({
        key: "secret",
        inputs: { email: "a@example.com" },
        verification: { status: "connected", detail: "healthy", checkedAt: 42 },
      })
      expect((yield* database.db.select().from(IssueMetadataSnapshotTable)
        .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get().pipe(Effect.orDie))?.credential_generation).toBe(0)
      expect((yield* database.db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).get().pipe(Effect.orDie))?.requested_generation).toBe(1)

      yield* credentials.remove(created.id)
      expect(yield* database.db.select().from(IssueMetadataSnapshotTable)
        .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get().pipe(Effect.orDie)).toBeUndefined()
      expect(yield* database.db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).get().pipe(Effect.orDie)).toBeUndefined()
    }),
  )
})
