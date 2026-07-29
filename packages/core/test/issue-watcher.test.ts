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
import { Effect, Exit, Layer, Scope } from "effect"
import { Issue } from "@opencode-ai/schema/issue"
import { Project } from "@opencode-ai/schema/project"
import { testEffect } from "./lib/effect"

const activeOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "active" }),
})
const disabledOwner = Layer.succeed(IssueWatcherOwner.Service, {
  status: () => ({ status: "disabled", detail: "disabled for test" }),
})
const globalConfig = Layer.succeed(GlobalConfig.Service, {
  getIssueWatcher: () => Effect.die("unused"),
  updateIssueWatcher: () => Effect.die("unused"),
})

function layer(owner = activeOwner) {
  return AppNodeBuilder.build(LayerNode.group([IssueWatcher.node, Credential.node, IssueProvider.node]), [
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
      expect(yield* service.list()).toEqual([created])

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
})
