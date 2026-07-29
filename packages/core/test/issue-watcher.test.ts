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
import { Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect"
import { Issue } from "@opencode-ai/schema/issue"
import { Project } from "@opencode-ai/schema/project"
import { testEffect } from "./lib/effect"
import { IssueMatchTable, IssueMaterializationTable, IssueWatcherIgnoreTable, IssueWatcherRunTable } from "@opencode-ai/core/issue-watcher/sql"
import { eq } from "drizzle-orm"
import { EventV2 } from "@opencode-ai/core/event"
import { IssueMatch } from "@opencode-ai/schema/issue-match"

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

function layer(owner = activeOwner) {
  return AppNodeBuilder.build(LayerNode.group([IssueWatcher.node, Credential.node, IssueProvider.node, Database.node, EventV2.node]), [
    [Database.node, Database.layerFromPath(":memory:")],
    [GlobalConfig.node, globalConfig],
    [IssueWatcherOwner.node, owner],
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
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
