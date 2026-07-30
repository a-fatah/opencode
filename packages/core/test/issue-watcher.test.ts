import { describe, expect, test } from "bun:test"
import { Integration } from "@opencode-ai/schema/integration"
import { IssueWatcher as IssueWatcherSchema } from "@opencode-ai/schema/issue-watcher"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { Credential } from "@opencode-ai/core/credential"
import { GlobalConfig } from "@opencode-ai/core/global-config"
import { IssueWatcher } from "@opencode-ai/core/issue-watcher"
import { IssueWatcherOwner } from "@opencode-ai/core/issue-watcher/owner"
import { IssueProvider } from "@opencode-ai/core/issue-watcher/provider"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from "effect"
import { Issue } from "@opencode-ai/schema/issue"
import { Project } from "@opencode-ai/schema/project"
import { testEffect } from "./lib/effect"
import { IssueMatchTable, IssueMaterializationTable, IssueMetadataSnapshotTable, IssueMetadataSyncTable, IssueWatcherIgnoreTable, IssueWatcherRunTable } from "@opencode-ai/core/issue-watcher/sql"
import { and, eq } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { tmpdir } from "./fixture/tmpdir"
import {
  IssueMatchObservationTable,
  IssueMatchSessionTable,
  IssueSessionClaimTable,
  SessionProvenanceTable,
} from "@opencode-ai/core/issue-watcher/sql"
import { SessionExecutionAttemptTable, SessionInputTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionID } from "@opencode-ai/schema/session-id"
import { SessionV2 } from "@opencode-ai/core/session"
import { EventTable } from "@opencode-ai/core/event/sql"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionExecutionAttempt } from "@opencode-ai/core/session/execution-attempt"

const activeOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "active" }),
})
const disabledOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "disabled", detail: "disabled for test" }),
})
const globalConfig = Layer.succeed(GlobalConfig.Service, {
  getIssueWatcher: () => Effect.succeed({ pollInterval: 3600, concurrentRuns: 3, retryFailedRuns: "once" as const }),
  updateIssueWatcher: () => Effect.die("unused"),
})

function layer(
  owner = activeOwner,
  settings = globalConfig,
  execution: Layer.Layer<SessionExecution.Service> = SessionExecution.noopLayer,
) {
  return AppNodeBuilder.build(LayerNode.group([IssueWatcher.node, Credential.node, IssueProvider.node, Database.node, EventV2.node, SessionV2.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
    [GlobalConfig.node, settings],
    [IssueWatcherOwner.node, owner],
    [SessionExecution.node, execution],
  ])
}

const input = {
  integrationID: Integration.ID.make("jira"),
  connectionID: IssueWatcherSchema.ConnectionID.make("icn_connection"),
  name: "Incoming bugs",
  criteria: {
    issueProjects: ["opencode"],
    watchUpdates: true,
  },
  routing: {
    mappings: [],
    fallback: "inbox" as const,
    workspace: { type: "current" as const },
  },
  action: {
    mode: "inbox" as const,
    promptTemplate: "Fix {{issue}}",
    writeback: { comment: true, commentOnFailure: true },
  },
}

const issue = Issue.Info.make({
  id: "100",
  key: "DEV-100",
  title: "Fix routing",
  description: "Route repository fields",
  url: "https://issues.example/DEV-100",
  status: "Open",
  assignee: { id: "1", name: "Ada" },
  labels: ["backend"],
  issueProject: "DEV",
  component: "Core",
  acceptanceCriteria: "SSH and HTTPS remotes match",
  repoField: "git@github.com:OpenCode-AI/opencode.git",
  updatedAt: 1,
  raw: {},
})

describe("IssueWatcher pure pipeline", () => {
  const projectID = Project.ID.make("project-1")
  const projects = [{
    projectID,
    name: "OpenCode",
    directories: ["/work/opencode"],
    remotes: [{ host: "github.com", path: "OpenCode-AI/opencode", label: "OpenCode-AI/opencode" }],
  }]

  test("routes repository fields before first-match-wins mappings", () => {
    expect(IssueWatcher.route(issue, {
      repoField: { fieldName: "Repository" },
      mappings: [{ key: { type: "label", value: "backend" }, projectID: Project.ID.make("project-2") }],
      fallback: "inbox",
      workspace: { type: "current" },
    }, projects)).toEqual({ projectID, reason: "Repository field matched OpenCode-AI/opencode" })
    expect(IssueWatcher.route({ ...issue, repoField: "https://github.com/opencode-ai/OPENCODE" }, {
      repoField: { fieldName: "Repository" },
      mappings: [],
      fallback: "inbox",
      workspace: { type: "current" },
    }, projects)).toEqual({ projectID, reason: "Repository field matched opencode-ai/OPENCODE" })
  })

  test("uses ordered mappings and returns an unrouted suggestion", () => {
    expect(IssueWatcher.route({ ...issue, repoField: undefined }, {
      mappings: [
        { key: { type: "component", value: "Core" }, projectID },
        { key: { type: "issueProject", value: "DEV" }, projectID: Project.ID.make("project-2") },
      ],
      fallback: "inbox",
      workspace: { type: "current" },
    }, projects)).toEqual({ projectID, reason: "component matched Core" })
    expect(IssueWatcher.route({ ...issue, repoField: undefined, labels: [], component: undefined, issueProject: "OTHER" }, {
      mappings: [],
      fallback: "inbox",
      workspace: { type: "current" },
    }, projects)).toEqual({ unrouted: true, reason: "No repository or explicit mapping matched", suggestion: projectID })
  })

  test("renders prompt variables and writeback plans deterministically", () => {
    expect(IssueWatcher.renderPrompt(issue, projects[0], "{{issue.key}} {{issue.title}} in {{project.name}}: {{issue.acceptanceCriteria}}")).toBe(
      "DEV-100 Fix routing in OpenCode: SSH and HTTPS remotes match",
    )
    expect(IssueWatcher.renderWriteback(issue, {
      mode: "run",
      promptTemplate: "",
      writeback: { comment: true, transitionOnStart: "In Progress", commentOnFailure: true },
    })).toEqual({
      comment: "OpenCode started work on DEV-100: Fix routing",
      transitionOnStart: "In Progress",
      commentOnFailure: "OpenCode could not complete work on DEV-100.",
    })
  })

  test("fingerprints semantically identical JSON deterministically", () => {
    expect(IssueWatcher.fingerprint({ ...issue, raw: { a: 1, b: 2 } })).toBe(
      IssueWatcher.fingerprint({ ...issue, raw: { b: 2, a: 1 } }),
    )
    expect(IssueWatcher.fingerprint({ ...issue, title: "Changed" })).not.toBe(IssueWatcher.fingerprint(issue))
  })
})

describe("IssueWatcher", () => {
  const it = testEffect(layer())

  it.effect("serves stale metadata immediately and single-flights scoped refreshes", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-cache")
      const connectionID = Credential.ConnectionID.make("icn_metadata-cache")
      const globalStarted = yield* Deferred.make<void>()
      const projectStarted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      let globalCalls = 0
      let projectCalls = 0
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Metadata cache",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.gen(function* () {
          globalCalls++
          yield* Deferred.succeed(globalStarted, undefined)
          yield* Deferred.await(release)
          return { projects: [], labels: [], fields: [] }
        }),
        metadataProject: () => Effect.gen(function* () {
          projectCalls++
          yield* Deferred.succeed(projectStarted, undefined)
          yield* Deferred.await(release)
          return { users: [], statuses: [], components: [], issueTypes: [] }
        }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      const storedCredential = yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const syncedAt = Date.now() - IssueWatcher.MetadataFreshness - 1
      const database = yield* Database.Service
      yield* database.db.update(IssueMetadataSnapshotTable).set({
        snapshot: {
          connectionID,
          global: {
            projects: [{ id: "1", key: "ENG", name: "Engineering" }],
            labels: ["cached"],
            fields: [],
            syncedAt,
          },
          projects: {
            ENG: {
              users: [{ id: "user-1", name: "Ada" }],
              statuses: [],
              components: [],
              issueTypes: [],
              syncedAt,
            },
          },
          updatedAt: syncedAt,
        },
        time_updated: syncedAt,
      }).where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).run().pipe(Effect.orDie)
      const service = yield* IssueWatcher.Service
      const first = yield* service.source.metadata(integrationID, connectionID, { issueProjects: ["ENG"] })
      expect(first).toMatchObject({
        metadata: { labels: ["cached"], users: [{ id: "user-1", name: "Ada" }] },
        stale: true,
        syncing: true,
        refreshingProjectKeys: ["ENG"],
        missingProjectKeys: [],
      })
      const accumulated = yield* service.source.metadata(integrationID, connectionID, { issueProjects: [] })
      expect(accumulated.metadata.users).toEqual([{ id: "user-1", name: "Ada" }])
      yield* Effect.all([Deferred.await(globalStarted), Deferred.await(projectStarted)])
      yield* Effect.all([
        service.source.metadata(integrationID, connectionID, { issueProjects: ["ENG"] }),
        service.source.syncMetadata(integrationID, connectionID),
      ])
      expect(globalCalls).toBe(1)
      expect(projectCalls).toBe(1)
      yield* Deferred.succeed(release, undefined)
      yield* (yield* Credential.Service).remove(storedCredential.id)
      expect(yield* database.db.select().from(IssueMetadataSnapshotTable)
        .where(eq(IssueMetadataSnapshotTable.connection_id, connectionID)).get().pipe(Effect.orDie)).toBeUndefined()
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("returns the completed snapshot from an immediate metadata provider", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-immediate")
      const connectionID = Credential.ConnectionID.make("icn_metadata-immediate")
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Immediate metadata",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({
          projects: [{ id: "1", key: "ENG", name: "Engineering" }],
          labels: ["fresh"],
          fields: [],
        }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })

      const result = yield* (yield* IssueWatcher.Service).source.metadata(integrationID, connectionID, {
        issueProjects: [],
      })

      expect(result).toMatchObject({
        metadata: { labels: ["fresh"] },
        stale: false,
        syncing: false,
      })
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("fences old credential metadata and immediately follows rotation with the new credential", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-rotation")
      const connectionID = Credential.ConnectionID.make("icn_metadata-rotation")
      const oldStarted = yield* Deferred.make<void>()
      const releaseOld = yield* Deferred.make<void>()
      const newCompleted = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Metadata rotation",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: (credential) => Effect.gen(function* () {
          if (credential.key === "old") {
            yield* Deferred.succeed(oldStarted, undefined)
            yield* Deferred.await(releaseOld)
            return { projects: [], labels: ["old"], fields: [] }
          }
          yield* Deferred.succeed(newCompleted, undefined)
          return { projects: [], labels: ["new"], fields: [] }
        }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "old", inputs: {} }),
      })
      const service = yield* IssueWatcher.Service
      yield* service.source.metadata(integrationID, connectionID, { issueProjects: [] })
      yield* Deferred.await(oldStarted)
      const rotated = yield* service.source.rotate(integrationID, connectionID, { key: "new", inputs: {} })
      expect(rotated.connection?.id).toBe(connectionID)
      yield* Deferred.succeed(releaseOld, undefined)
      yield* Deferred.await(newCompleted)
      yield* Effect.yieldNow
      const result = yield* service.source.metadata(integrationID, connectionID, { issueProjects: [] })
      expect(result.metadata.labels).toEqual(["new"])
      const sync = yield* (yield* Database.Service).db.select().from(IssueMetadataSyncTable).where(and(
        eq(IssueMetadataSyncTable.connection_id, connectionID),
        eq(IssueMetadataSyncTable.scope, "global"),
      )).get().pipe(Effect.orDie)
      expect(sync?.credential_generation).toBe(1)
      expect(sync?.completed_generation).toBe(sync?.requested_generation)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("saved credential verification updates health without invalidating metadata", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-health-check")
      const connectionID = Credential.ConnectionID.make("icn_metadata-health-check")
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Metadata health check",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "healthy" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      const credentials = yield* Credential.Service
      yield* credentials.createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret", inputs: {} }),
      })
      const database = yield* Database.Service
      const before = yield* database.db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).get().pipe(Effect.orDie)
      expect(yield* (yield* IssueWatcher.Service).source.verify(integrationID, {
        inputs: {},
        useSavedConnection: true,
      })).toEqual({ ok: true, detail: "healthy" })
      const after = yield* database.db.select().from(IssueMetadataSyncTable)
        .where(eq(IssueMetadataSyncTable.connection_id, connectionID)).get().pipe(Effect.orDie)
      expect(after?.credential_generation).toBe(before?.credential_generation)
      expect(after?.requested_generation).toBe(before?.requested_generation)
      expect((yield* credentials.getConnection(connectionID))?.value).toMatchObject({
        key: "secret",
        verification: { status: "connected", detail: "healthy" },
      })
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("persists failed-scope cooldown so status polling does not retry provider work", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-cooldown")
      const connectionID = Credential.ConnectionID.make("icn_metadata-cooldown")
      const scope = yield* Scope.make()
      const failed = yield* Deferred.make<void>()
      let calls = 0
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Metadata cooldown",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.gen(function* () {
          calls++
          yield* Deferred.succeed(failed, undefined)
          return yield* new IssueProvider.RequestError({ detail: "unavailable" })
        }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret", inputs: {} }),
      })
      const service = yield* IssueWatcher.Service
      yield* service.source.metadata(integrationID, connectionID, { issueProjects: [] })
      yield* Deferred.await(failed)
      yield* Effect.yieldNow
      yield* Effect.forEach(Array.from({ length: 5 }), () =>
        service.source.metadata(integrationID, connectionID, { issueProjects: [] }))
      expect(calls).toBe(1)
      const status = yield* service.source.metadata(integrationID, connectionID, { issueProjects: [] })
      expect(status.syncError).toBe("global: unavailable")
      expect(status.syncing).toBe(false)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("keeps failed project status after a later scope succeeds", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("metadata-partial-failure")
      const connectionID = Credential.ConnectionID.make("icn_metadata-partial-failure")
      const scope = yield* Scope.make()
      const completed = yield* Deferred.make<void>()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Metadata partial failure",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: (_credential, projectKey) => Effect.gen(function* () {
          if (projectKey === "ENG") return yield* new IssueProvider.RequestError({ detail: "ENG unavailable" })
          yield* Deferred.succeed(completed, undefined)
          return { users: [], statuses: [], components: [], issueTypes: [] }
        }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret", inputs: {} }),
      })
      const service = yield* IssueWatcher.Service
      yield* service.source.metadata(integrationID, connectionID, { issueProjects: ["ENG", "OPS"] })
      yield* Deferred.await(completed)
      yield* Effect.yieldNow
      const status = yield* service.source.metadata(integrationID, connectionID, { issueProjects: ["ENG", "OPS"] })
      expect(status.syncError).toBe("project:ENG: ENG unavailable")
      expect(status.metadata.users).toEqual([])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("creates, reads, lists, updates, enables, and archives watchers", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service
      const created = yield* service.create({ ...input, enabled: false })

      expect(created.name).toBe("Incoming bugs")
      expect(created.enabled).toBe(false)
      expect(yield* service.get(created.id)).toEqual(created)
      expect((yield* service.list()).map((item) => item.watcher)).toEqual([created])

      const updated = yield* service.update(created.id, { name: "Updated bugs" })
      expect(updated.name).toBe("Updated bugs")
      expect((yield* service.enable(created.id, true)).enabled).toBe(true)

      yield* service.archive(created.id)
      const archived = yield* service.get(created.id)
      expect(archived.enabled).toBe(false)
      expect(archived.archivedAt).toBeDefined()
      expect(yield* service.list()).toEqual([])
      expect(yield* service.update(created.id, { name: "Rejected" }).pipe(Effect.flip)).toBeInstanceOf(
        IssueWatcher.ArchivedError,
      )
      expect(yield* service.enable(created.id, true).pipe(Effect.flip)).toBeInstanceOf(IssueWatcher.ArchivedError)
    }),
  )

  it.effect("includes the watcher's exact immutable connection in its summary", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      yield* credentials.createConnection({
        integrationID: input.integrationID,
        connectionID: input.connectionID,
        tenantIdentity: "first.example",
        label: "First",
        value: Credential.Key.make({
          type: "key",
          key: "first",
          inputs: { site: "first.example" },
          verification: { status: "connected", detail: "ready", checkedAt: 1 },
        }),
      })
      yield* credentials.createConnection({
        integrationID: input.integrationID,
        connectionID: Credential.ConnectionID.make("icn_newer"),
        tenantIdentity: "newer.example",
        value: Credential.Key.make({ type: "key", key: "newer" }),
      })
      const watcher = yield* (yield* IssueWatcher.Service).create({ ...input, enabled: false })

      expect((yield* (yield* IssueWatcher.Service).list()).find((item) => item.watcher.id === watcher.id)?.connection)
        .toEqual({
          id: input.connectionID,
          label: "First",
          tenantIdentity: "first.example",
          inputs: { site: "first.example" },
          verification: { status: "connected", detail: "ready", checkedAt: 1 },
        })
    }),
  )

  it.effect("resolves an assignee summary from cached provider metadata", () =>
    Effect.gen(function* () {
      const credentials = yield* Credential.Service
      yield* credentials.createConnection({
        integrationID: input.integrationID,
        connectionID: input.connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const now = Date.now()
      const database = yield* Database.Service
      yield* database.db.update(IssueMetadataSnapshotTable).set({
        snapshot: {
          connectionID: input.connectionID,
          projects: {
            opencode: {
              users: [{ id: "user-1", name: "Ada", imageUrl: "https://example.com/ada.png" }],
              statuses: [],
              components: [],
              issueTypes: [],
              syncedAt: now,
            },
          },
          updatedAt: now,
        },
        time_updated: now,
      }).where(eq(IssueMetadataSnapshotTable.connection_id, input.connectionID)).run().pipe(Effect.orDie)
      yield* (yield* IssueWatcher.Service).create({
        ...input,
        enabled: false,
        criteria: { ...input.criteria, assignee: { id: "user-1" } },
      })

      expect((yield* (yield* IssueWatcher.Service).list())[0]?.assignee).toEqual({
        id: "user-1",
        name: "Ada",
        imageUrl: "https://example.com/ada.png",
      })
    }),
  )

  it.effect("returns not found for unknown watcher operations", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service
      const id = IssueWatcher.ID.make("iwt_missing")

      expect(yield* service.get(id).pipe(Effect.flip)).toBeInstanceOf(IssueWatcher.NotFoundError)
      expect(yield* service.archive(id).pipe(Effect.flip)).toBeInstanceOf(IssueWatcher.NotFoundError)
    }),
  )

  it.effect("rejects a connection owned by another integration before provider search", () =>
    Effect.gen(function* () {
      const connectionID = Credential.ConnectionID.make("icn_other-source")
      yield* (yield* Credential.Service).createConnection({
        integrationID: Integration.ID.make("github"),
        connectionID,
        tenantIdentity: "github.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })

      const error = yield* (yield* IssueWatcher.Service).preview({
        integrationID: Integration.ID.make("jira"),
        connectionID,
        criteria: input.criteria,
        routing: input.routing,
        action: input.action,
      }).pipe(Effect.flip)
      expect(error).toBeInstanceOf(IssueWatcher.ConnectionNotFoundError)
      expect(yield* (yield* IssueWatcher.Service).list()).toEqual([])
    }),
  )

  it.effect("collects preview pages up to the documented limit without persistence", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("github")
      const connectionID = Credential.ConnectionID.make("icn_preview")
      const pages: Array<string | undefined> = []
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "GitHub",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("github.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: ({ page }) => {
          pages.push(page)
          const offset = page ? Number(page) : 0
          const issues = Array.from({ length: 60 }, (_, index) => Issue.Info.make({
            ...issue,
            id: String(offset + index),
            key: `DEV-${offset + index}`,
          }))
          return Effect.succeed({ issues, cursor: "unused", ...(offset < 60 ? { nextPage: "60" } : {}) })
        },
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "github.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })

      const preview = yield* (yield* IssueWatcher.Service).preview({
        integrationID,
        connectionID,
        criteria: input.criteria,
        routing: input.routing,
        action: input.action,
      })

      expect(pages).toEqual([undefined, "60"])
      expect(preview.matches).toHaveLength(IssueWatcher.PreviewLimit)
      expect(preview.truncated).toBe(true)
      expect(yield* (yield* IssueWatcher.Service).list()).toEqual([])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("polls all pages, deduplicates observations, and preserves cursor on auth failure", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("github-poll")
      const connectionID = Credential.ConnectionID.make("icn_poll")
      const pages: Array<{ cursor?: string; page?: string }> = []
      const scope = yield* Scope.make()
      let revision = 1
      let authenticated = true
      let failPage = false
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "GitHub",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("github.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: ({ cursor, page }) => {
          pages.push({ cursor, page })
          if (!authenticated) return new IssueProvider.AuthenticationError({ detail: "expired" })
          const observed = Issue.Info.make({ ...issue, raw: { revision }, title: `Revision ${revision}` })
          if (!page) return Effect.succeed({ issues: [observed], nextPage: "next", cursor: `candidate-${revision}` })
          if (failPage) return new IssueProvider.RequestError({ detail: "page failed" })
          return Effect.succeed({ issues: [Issue.Info.make({ ...observed, id: "101", key: "DEV-101" })], cursor: `cursor-${revision}` })
        },
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "github.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, integrationID, connectionID })

      const first = yield* service.run(watcher.id)
      expect(first).toMatchObject({ outcome: "ok", scanned: 2, matched: 2, unrouted: 2 })
      expect((yield* service.source.list()).find((source) => source.integration.id === integrationID)?.lastPollAt)
        .toEqual((yield* service.get(watcher.id)).lastRunAt)
      expect((yield* service.inbox({})).items).toHaveLength(2)
      expect((yield* service.history(watcher.id, {})).items.filter((item) => item.type === "observation")).toHaveLength(2)

      yield* service.run(watcher.id)
      expect((yield* service.history(watcher.id, {})).items.filter((item) => item.type === "observation")).toHaveLength(2)
      expect(pages.at(-2)?.cursor).toBe("cursor-1")

      revision = 2
      yield* service.run(watcher.id)
      expect((yield* service.history(watcher.id, {})).items.filter((item) => item.type === "observation")).toHaveLength(4)

      revision = 3
      failPage = true
      expect(yield* service.run(watcher.id)).toMatchObject({ outcome: "error", error: "page failed" })
      expect((yield* service.history(watcher.id, {})).items.filter((item) => item.type === "observation")).toHaveLength(4)
      expect(yield* service.get(watcher.id)).toMatchObject({ enabled: true, cursor: "cursor-2" })

      failPage = false
      authenticated = false
      const failed = yield* service.run(watcher.id)
      expect(failed.outcome).toBe("auth_failed")
      expect(yield* service.get(watcher.id)).toMatchObject({ enabled: false, cursor: "cursor-2", lastError: "expired" })
      expect((yield* (yield* Credential.Service).getConnection(connectionID))?.value).toMatchObject({ key: "secret" })
      expect((yield* service.summary()).failedRuns).toBeGreaterThanOrEqual(2)
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("keeps the last non-empty page watermark when the terminal page is empty", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("terminal-page")
      const connectionID = Credential.ConnectionID.make("icn_terminal-page")
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Terminal page",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: ({ page }) => Effect.succeed(page
          ? { issues: [], cursor: "starting-cursor" }
          : { issues: [issue], cursor: "advanced-cursor", nextPage: "empty" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, integrationID, connectionID })

      const run = yield* service.run(watcher.id)

      expect(run.cursor).toBeUndefined()
      expect((yield* service.get(watcher.id)).cursor).toBe("advanced-cursor")
      expect(yield* service.run(watcher.id)).toMatchObject({ cursor: "advanced-cursor" })
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("merges history using SQLite binary ID ordering", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, enabled: false })
      const { db } = yield* Database.Service
      yield* db.insert(IssueWatcherRunTable).values([
        { id: IssueWatcherSchema.RunID.make("iwr_Z"), watcher_id: watcher.id, started_at: 1, outcome: "ok" },
        { id: IssueWatcherSchema.RunID.make("iwr_a"), watcher_id: watcher.id, started_at: 1, outcome: "ok" },
      ]).run().pipe(Effect.orDie)

      const history = yield* service.history(watcher.id, {})

      expect(history.items.map((item) => item.type === "run" ? item.run.id : item.observation.id)).toEqual([
        IssueWatcherSchema.RunID.make("iwr_a"),
        IssueWatcherSchema.RunID.make("iwr_Z"),
      ])
    }),
  )

  it.effect("preserves triage when updates are not watched, with ignore precedence and no non-inbox materialization", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("triage")
      const connectionID = Credential.ConnectionID.make("icn_triage")
      const scope = yield* Scope.make()
      let revision = 1
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Triage",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Effect.succeed({
          issues: [
            Issue.Info.make({ ...issue, title: `Ignored ${revision}` }),
            Issue.Info.make({ ...issue, id: "101", key: "DEV-101", title: `Triaged ${revision}` }),
          ],
          cursor: `cursor-${revision}`,
        }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({
        ...input,
        integrationID,
        connectionID,
        criteria: { ...input.criteria, watchUpdates: false },
        action: { ...input.action, mode: "run" },
      })
      yield* service.run(watcher.id)
      const { db } = yield* Database.Service
      yield* db.update(IssueMatchTable).set({
        state: "duplicate",
        project_id: "project-manual",
        route_reason: "Manually triaged",
      }).where(eq(IssueMatchTable.external_id, "101")).run().pipe(Effect.orDie)
      yield* db.insert(IssueWatcherIgnoreTable).values({ watcher_id: watcher.id, external_id: "100" }).run().pipe(Effect.orDie)
      revision = 2

      yield* service.run(watcher.id)

      yield* db.update(IssueMatchTable).set({ state: "pending" }).where(eq(IssueMatchTable.external_id, "100")).run().pipe(Effect.orDie)
      const updates: string[] = []
      const unsubscribe = yield* (yield* EventV2.Service).listen((event) => Effect.sync(() => {
        if (event.type === IssueWatcher.Event.MatchUpdated.type) updates.push(event.type)
      }))
      yield* service.run(watcher.id)
      yield* unsubscribe

      const rows = yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.watcher_id, watcher.id)).all().pipe(Effect.orDie)
      expect(rows.find((row) => row.external_id === "100")?.state).toBe("skipped")
      expect(rows.find((row) => row.external_id === "101")).toMatchObject({
        state: "duplicate",
        project_id: "project-manual",
        route_reason: "Manually triaged",
      })
      expect(updates).toEqual([IssueWatcher.Event.MatchUpdated.type])
      expect(yield* db.select().from(IssueMaterializationTable).all().pipe(Effect.orDie)).toEqual([])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("coalesces concurrent runs and returns a conflict for a snapshot invalidated by update", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("single-flight")
      const connectionID = Credential.ConnectionID.make("icn_single-flight")
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      let searches = 0
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Single flight",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => {
          searches++
          return Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as({ issues: [issue], cursor: "stale-cursor" }),
          )
        },
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      yield* (yield* Credential.Service).createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, integrationID, connectionID })
      const first = yield* service.run(watcher.id).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const second = yield* service.run(watcher.id).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      expect(searches).toBe(1)
      yield* service.update(watcher.id, { name: "Updated during poll" })
      expect((yield* service.get(watcher.id)).name).toBe("Updated during poll")
      yield* Deferred.succeed(release, undefined)

      const firstRun = yield* Fiber.join(first).pipe(Effect.flip)
      const secondRun = yield* Fiber.join(second).pipe(Effect.flip)
      expect(firstRun).toBeInstanceOf(IssueWatcher.RunConflictError)
      expect(secondRun).toBeInstanceOf(IssueWatcher.RunConflictError)
      expect(searches).toBe(1)
      expect(yield* service.get(watcher.id)).toMatchObject({ name: "Updated during poll" })
      expect((yield* service.get(watcher.id)).cursor).toBeUndefined()
      expect((yield* service.inbox({})).items).toEqual([])
      expect((yield* service.history(watcher.id, {})).items).toEqual([])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("does not overwrite rotated credential health after a stale auth failure", () =>
    Effect.gen(function* () {
      const integrationID = Integration.ID.make("auth-race")
      const connectionID = Credential.ConnectionID.make("icn_auth-race")
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      yield* (yield* IssueProvider.Service).register({
        integrationID,
        name: "Auth race",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("example.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadataGlobal: () => Effect.succeed({ projects: [], labels: [], fields: [] }),
        metadataProject: () => Effect.succeed({ users: [], statuses: [], components: [], issueTypes: [] }),
        search: () => Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.andThen(new IssueProvider.AuthenticationError({ detail: "expired request" })),
        ),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }).pipe(Scope.provide(scope))
      const credentials = yield* Credential.Service
      yield* credentials.createConnection({
        integrationID,
        connectionID,
        tenantIdentity: "example.com",
        value: Credential.Key.make({ type: "key", key: "old" }),
      })
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, integrationID, connectionID })
      const running = yield* service.run(watcher.id).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* credentials.rotateConnection(connectionID, {
        value: Credential.Key.make({
          type: "key",
          key: "new",
          verification: { status: "connected", detail: "rotated", checkedAt: 2 },
        }),
      })
      yield* Deferred.succeed(release, undefined)

      expect(yield* Fiber.join(running)).toMatchObject({ outcome: "auth_failed" })
      expect(yield* service.get(watcher.id)).toMatchObject({ enabled: false, lastError: "expired request" })
      expect((yield* credentials.getConnection(connectionID))?.value).toMatchObject({
        key: "new",
        verification: { status: "connected", detail: "rotated" },
      })
      yield* Scope.close(scope, Exit.void)
    }),
  )

  it.effect("paginates only attention Inbox rows", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, enabled: false })
      const { db } = yield* Database.Service
      const rows = [
        { id: IssueMatch.ID.make("imt_attention-d"), state: "pending" as const, error: null },
        { id: IssueMatch.ID.make("imt_attention-c"), state: "pending" as const, error: "match failed" },
        { id: IssueMatch.ID.make("imt_attention-b"), state: "duplicate" as const, error: null },
        { id: IssueMatch.ID.make("imt_attention-a"), state: "unrouted" as const, error: null },
      ]
      yield* db.insert(IssueMatchTable).values(rows.map((row) => ({
        id: row.id,
        watcher_id: watcher.id,
        integration_id: watcher.integrationID,
        connection_id: watcher.connectionID,
        external_id: row.id,
        external_key: row.id,
        external_url: `https://example.com/${row.id}`,
        fingerprint: row.id,
        external_updated_at: 1,
        state: row.state,
        payload: { ...issue, id: row.id, key: row.id },
        error: row.error,
        time_created: 1,
        time_updated: 1,
      }))).run().pipe(Effect.orDie)
      const first = yield* service.inbox({ filter: "attention", limit: 2 })
      const second = yield* service.inbox({ filter: "attention", limit: 2, cursor: first.nextCursor })
      expect(first.items.map((item) => item.match.id)).toEqual([
        IssueMatch.ID.make("imt_attention-c"),
        IssueMatch.ID.make("imt_attention-b"),
      ])
      expect(second.items.map((item) => item.match.id)).toEqual([IssueMatch.ID.make("imt_attention-a")])
      expect(second.nextCursor).toBeUndefined()
    }),
  )

  it.live("atomically claims cross-watcher issues and recovers deterministic materialization stages", () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
      )
      const projectID = Project.ID.make("materialization-project")
      const { db } = yield* Database.Service
      yield* db.insert(ProjectTable).values({
        id: projectID,
        worktree: AbsolutePath.make(root.path),
        sandboxes: [],
      }).run().pipe(Effect.orDie)
      const service = yield* IssueWatcher.Service
      const watchers = yield* Effect.all([
        service.create({ ...input, enabled: false, projectID, action: { ...input.action, mode: "awaiting_run" } }),
        service.create({ ...input, enabled: false, projectID, name: "Competing watcher", action: { ...input.action, mode: "awaiting_run" } }),
      ])
      const runIDs = watchers.map((_, index) => IssueWatcherSchema.RunID.make(`iwr_materialization-${index}`))
      yield* db.insert(IssueWatcherRunTable).values(watchers.map((watcher, index) => ({
        id: runIDs[index]!,
        watcher_id: watcher.id,
        started_at: 1,
        outcome: "ok" as const,
      }))).run().pipe(Effect.orDie)
      const matchIDs = watchers.map((_, index) => IssueMatch.ID.make(`imt_materialization-${index}`))
      yield* db.insert(IssueMatchTable).values(watchers.map((watcher, index) => ({
        id: matchIDs[index]!,
        watcher_id: watcher.id,
        integration_id: watcher.integrationID,
        connection_id: watcher.connectionID,
        external_id: issue.id,
        external_key: issue.key,
        external_url: issue.url,
        fingerprint: IssueWatcher.fingerprint(issue),
        external_updated_at: issue.updatedAt,
        state: "pending" as const,
        project_id: projectID,
        payload: issue,
      }))).run().pipe(Effect.orDie)
      yield* db.insert(IssueMatchObservationTable).values(matchIDs.map((matchID, index) => ({
        id: IssueMatch.ObservationID.make(`imo_materialization-${index}`),
        match_id: matchID,
        run_id: runIDs[index]!,
        fingerprint: IssueWatcher.fingerprint(issue),
        external_updated_at: issue.updatedAt,
        payload: issue,
      }))).run().pipe(Effect.orDie)

      const approvals = yield* Effect.forEach(matchIDs, (matchID) => service.approve(matchID, { mode: "awaiting_run" }).pipe(Effect.exit), {
        concurrency: "unbounded",
      })
      expect(approvals.filter(Exit.isSuccess)).toHaveLength(1)
      const duplicate = approvals.flatMap((exit) => Exit.isFailure(exit)
        ? Option.toArray(Cause.findErrorOption(exit.cause))
        : [])
      expect(duplicate).toHaveLength(1)
      expect(duplicate[0]).toMatchObject({ _tag: "IssueWatcher.MatchConflictError", detail: "Issue match is duplicate" })
      const materialized = yield* db.select().from(IssueMaterializationTable).get().pipe(Effect.orDie)
      if (!materialized) return yield* Effect.die("Expected winning materialization")
      expect(materialized).toMatchObject({ state: "prompt_admitted", mode: "awaiting_run", attempts: 0 })
      expect(yield* service.matches.materialize({ matchID: materialized.match_id })).toMatchObject({
        id: materialized.id,
        sessionID: materialized.session_id,
        messageID: materialized.message_id,
      })
      expect(yield* db.select().from(IssueSessionClaimTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect(yield* db.select().from(SessionTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect(yield* db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect(yield* db.select().from(IssueMatchSessionTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect(yield* db.select().from(SessionProvenanceTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect((yield* db.select().from(IssueMatchTable).where(eq(IssueMatchTable.state, "duplicate")).all().pipe(Effect.orDie))).toHaveLength(1)
      expect((yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, materialized.id)).all().pipe(Effect.orDie))
        .map((event) => event.type)).toEqual([`${IssueWatcher.Event.SessionMaterialized.type}.1`])
      expect((yield* service.inbox({})).items.map((item) => item.match.id)).not.toContain(materialized.match_id)
      expect((yield* service.summary()).pending).toBe(0)

      const missingAttemptID = SessionExecutionAttempt.ID.make("sea_materialization-missing")
      yield* db.update(SessionInputTable).set({ claimed_attempt_id: missingAttemptID })
        .where(eq(SessionInputTable.id, SessionMessage.ID.make(materialized.message_id))).run().pipe(Effect.orDie)
      yield* db.update(IssueMaterializationTable).set({
        mode: "run",
        state: "scheduled",
        provider_started: false,
        execution_attempt_id: missingAttemptID,
      }).where(eq(IssueMaterializationTable.id, materialized.id)).run().pipe(Effect.orDie)
      yield* service.matches.reconcile()
      const recovered = yield* db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.id, materialized.id)).get().pipe(Effect.orDie)
      expect(recovered).toMatchObject({
          state: "scheduled",
          provider_started: true,
        })
      expect(recovered?.execution_attempt_id).not.toBe(missingAttemptID)

      const oldAttemptID = SessionExecutionAttempt.ID.make(recovered!.execution_attempt_id!)
      yield* db.update(SessionExecutionAttemptTable).set({ status: "handoff_unknown" })
        .where(eq(SessionExecutionAttemptTable.id, oldAttemptID)).run().pipe(Effect.orDie)
      const successorAttemptID = SessionExecutionAttempt.ID.make("sea_materialization-successor")
      yield* (yield* SessionV2.Service).confirmHandoff({
        sessionID: SessionID.make(materialized.session_id),
        attemptID: oldAttemptID,
        newAttemptID: successorAttemptID,
      })
      expect(yield* db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.id, materialized.id)).get().pipe(Effect.orDie)).toMatchObject({
          state: "scheduled",
          execution_attempt_id: successorAttemptID,
          error: null,
        })
      expect(yield* SessionExecutionAttempt.find(db, oldAttemptID)).toMatchObject({
        status: "superseded",
        supersededByAttemptID: successorAttemptID,
      })

      const duplicateID = matchIDs.find((matchID) => matchID !== materialized.match_id)!
      const duplicateWatcher = watchers[matchIDs.indexOf(duplicateID)]!
      const continued = yield* service.resolveDuplicate(duplicateID, { action: "continue" })
      expect(continued).toEqual({ status: "continued", sessionID: SessionID.make(materialized.session_id) })
      const currentInput = (yield* db.select().from(SessionInputTable)
        .where(eq(SessionInputTable.session_id, SessionID.make(materialized.session_id))).all().pipe(Effect.orDie))
        .find((row) => row.id !== materialized.message_id)
      expect(currentInput?.prompt).toEqual({ text: "Fix {{issue}}" })

      const secondaryRoot = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
      )
      const secondaryProjectID = Project.ID.make("materialization-secondary-project")
      yield* db.insert(ProjectTable).values({
        id: secondaryProjectID,
        worktree: AbsolutePath.make(secondaryRoot.path),
        sandboxes: [],
      }).run().pipe(Effect.orDie)
      const second = yield* service.resolveDuplicate(duplicateID, {
        action: "create_second",
        mode: "awaiting_run",
        projectID: secondaryProjectID,
      })
      expect(second.status).toBe("created")
      if (second.status !== "created") return yield* Effect.die("Expected secondary materialization")
      expect(yield* db.select().from(IssueSessionClaimTable).all().pipe(Effect.orDie)).toHaveLength(1)
      expect(yield* db.select().from(IssueMatchSessionTable)
        .where(eq(IssueMatchSessionTable.session_id, second.sessionID)).get().pipe(Effect.orDie)).toMatchObject({
          is_primary: false,
          reason: "duplicate_override",
        })
      const secondary = yield* db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.session_id, second.sessionID)).get().pipe(Effect.orDie)
      if (!secondary) return yield* Effect.die("Expected secondary materialization row")
      yield* (yield* SessionV2.Service).cancelInput({
        sessionID: second.sessionID,
        messageID: SessionMessage.ID.make(secondary.message_id),
      })
      expect(yield* db.select().from(IssueMaterializationTable)
        .where(eq(IssueMaterializationTable.id, secondary.id)).get().pipe(Effect.orDie)).toMatchObject({ state: "cancelled" })
      yield* (yield* SessionV2.Service).remove(second.sessionID)
      expect(yield* db.select().from(IssueMatchSessionTable)
        .where(eq(IssueMatchSessionTable.session_id, second.sessionID)).get().pipe(Effect.orDie)).toMatchObject({
          is_primary: false,
          deleted_at: expect.any(Number),
        })
      expect(yield* service.matches.provenance(SessionID.make(materialized.session_id))).toMatchObject({
        externalKey: issue.key,
        matchID: materialized.match_id,
      })

      yield* service.routeMatch(duplicateID, { projectID: secondaryProjectID, persistMapping: true })
      expect((yield* service.get(duplicateWatcher.id)).routing.mappings).toContainEqual({
        key: { type: "component", value: issue.component! },
        projectID: secondaryProjectID,
      })
      yield* service.dismiss(duplicateID)
      const bulk = yield* service.bulk({
        matchIDs: [IssueMatch.ID.make("imt_missing"), duplicateID],
        action: "approve",
        mode: "awaiting_run",
      })
      expect(bulk.items[0]).toMatchObject({ status: "failed", error: { code: "not_found" } })
      expect(bulk.items[1]).toMatchObject({ status: "failed", error: { code: "invalid_state" } })
    }),
  )
})

describe("IssueWatcher ownership conflicts", () => {
  const it = testEffect(layer(disabledOwner))

  it.effect("rejects enabled creation and enabling without an active owner", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service

      const createError = yield* service.create(input).pipe(Effect.flip)
      expect(createError).toBeInstanceOf(IssueWatcher.OwnerConflictError)
      expect(createError.detail).toBe("disabled for test")
      expect(yield* service.list()).toEqual([])

      const watcher = yield* service.create({ ...input, enabled: false })
      const enableError = yield* service.enable(watcher.id, true).pipe(Effect.flip)
      expect(enableError).toBeInstanceOf(IssueWatcher.OwnerConflictError)
      expect((yield* service.get(watcher.id)).enabled).toBe(false)
    }),
  )

  it.effect("rejects manual run and runAll without an active owner", () =>
    Effect.gen(function* () {
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, enabled: false })

      expect(yield* service.run(watcher.id).pipe(Effect.flip)).toBeInstanceOf(IssueWatcher.OwnerConflictError)
      expect(yield* service.runAll().pipe(Effect.flip)).toBeInstanceOf(IssueWatcher.OwnerConflictError)
      expect((yield* service.history(watcher.id, {})).items).toEqual([])
    }),
  )
})

describe("IssueWatcher run capacity", () => {
  const it = testEffect(layer(
    activeOwner,
    Layer.succeed(GlobalConfig.Service, {
      getIssueWatcher: () => Effect.succeed({ pollInterval: 3600, concurrentRuns: 1, retryFailedRuns: "never" as const }),
      updateIssueWatcher: () => Effect.die("unused"),
    }),
    Layer.succeed(SessionExecution.Service, {
      active: Effect.succeed(new Set([SessionID.make("ses_active")])),
      ownerEpoch: "capacity-test",
      resume: () => Effect.void,
      wake: () => Effect.void,
      schedule: () => Effect.void,
      interrupt: () => Effect.void,
    }),
  ))

  it.effect("returns queued without creating materialization artifacts when capacity is full", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, enabled: false })
      const matchID = IssueMatch.ID.make("imt_capacity")
      yield* db.insert(IssueMatchTable).values({
        id: matchID,
        watcher_id: watcher.id,
        integration_id: watcher.integrationID,
        connection_id: watcher.connectionID,
        external_id: issue.id,
        external_key: issue.key,
        external_url: issue.url,
        fingerprint: IssueWatcher.fingerprint(issue),
        external_updated_at: issue.updatedAt,
        state: "pending",
        project_id: Project.ID.make("project-capacity"),
        payload: issue,
      }).run().pipe(Effect.orDie)

      expect(yield* service.matches.materialize({ matchID, mode: "run" })).toBeUndefined()
      expect(yield* db.select().from(IssueMaterializationTable).all().pipe(Effect.orDie)).toEqual([])
      expect(yield* db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual([])
    }),
  )

  it.effect("leaves startup reconciliation pending when run capacity is full", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const service = yield* IssueWatcher.Service
      const watcher = yield* service.create({ ...input, enabled: false })
      const matchID = IssueMatch.ID.make("imt_reconcile-capacity")
      const runID = IssueWatcherSchema.RunID.make("iwr_reconcile-capacity")
      const observationID = IssueMatch.ObservationID.make("imo_reconcile-capacity")
      yield* db.insert(IssueWatcherRunTable).values({ id: runID, watcher_id: watcher.id, started_at: 1, outcome: "ok" }).run().pipe(Effect.orDie)
      yield* db.insert(IssueMatchTable).values({
        id: matchID,
        watcher_id: watcher.id,
        integration_id: watcher.integrationID,
        connection_id: watcher.connectionID,
        external_id: "reconcile-capacity",
        external_key: issue.key,
        external_url: issue.url,
        fingerprint: IssueWatcher.fingerprint(issue),
        external_updated_at: issue.updatedAt,
        state: "pending",
        project_id: Project.ID.make("project-capacity"),
        payload: issue,
      }).run().pipe(Effect.orDie)
      yield* db.insert(IssueMatchObservationTable).values({
        id: observationID,
        match_id: matchID,
        run_id: runID,
        fingerprint: IssueWatcher.fingerprint(issue),
        external_updated_at: issue.updatedAt,
        payload: issue,
      }).run().pipe(Effect.orDie)
      yield* db.insert(IssueMaterializationTable).values({
        id: IssueMatch.MaterializationID.make("imz_reconcile-capacity"),
        match_id: matchID,
        mode: "run",
        project_id: Project.ID.make("project-capacity"),
        workspace: { type: "current" },
        baseline_observation_id: observationID,
        state: "pending",
        session_id: SessionID.make("ses_reconcile-capacity"),
        message_id: SessionMessage.ID.make("msg_reconcile-capacity"),
      }).run().pipe(Effect.orDie)

      yield* service.matches.reconcile()

      expect(yield* db.select().from(IssueMaterializationTable).where(eq(IssueMaterializationTable.match_id, matchID)).get().pipe(Effect.orDie))
        .toMatchObject({ state: "pending", provider_started: false, execution_attempt_id: null })
      expect(yield* db.select().from(SessionTable).where(eq(SessionTable.id, SessionID.make("ses_reconcile-capacity"))).get().pipe(Effect.orDie)).toBeUndefined()
    }),
  )
})
