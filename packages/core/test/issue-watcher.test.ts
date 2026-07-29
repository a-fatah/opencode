import { describe, expect } from "bun:test"
import { Integration } from "@opencode-ai/schema/integration"
import { IssueWatcher as IssueWatcherSchema } from "@opencode-ai/schema/issue-watcher"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Database } from "@opencode-ai/core/database/database"
import { GlobalConfig } from "@opencode-ai/core/global-config"
import { IssueWatcher } from "@opencode-ai/core/issue-watcher"
import { IssueWatcherOwner } from "@opencode-ai/core/issue-watcher/owner"
import { Effect, Layer } from "effect"
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
  return AppNodeBuilder.build(IssueWatcher.node, [
    [Database.node, Database.layerFromPath(":memory:")],
    [GlobalConfig.node, globalConfig],
    [IssueWatcherOwner.node, owner],
  ])
}

const input = {
  integrationID: Integration.ID.make("github"),
  connectionID: IssueWatcherSchema.ConnectionID.make("connection"),
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
