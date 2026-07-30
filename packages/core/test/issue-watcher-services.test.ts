import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Integration } from "@opencode-ai/schema/integration"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Database } from "@opencode-ai/core/database/database"
import { Global } from "@opencode-ai/core/global"
import { GlobalConfig } from "@opencode-ai/core/global-config"
import { IssueProvider } from "@opencode-ai/core/issue-watcher/provider"
import { IssueWatcherOwner } from "@opencode-ai/core/issue-watcher/owner"
import { Context, Effect, Exit, Layer, Scope } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

describe("IssueProvider", () => {
  const provider = testEffect(AppNodeBuilder.build(IssueProvider.node))

  provider.effect("starts empty and removes scoped registrations on release", () =>
    Effect.gen(function* () {
      const service = yield* IssueProvider.Service
      const integrationID = Integration.ID.make("github")

      expect((yield* service.list()).map((item) => item.integrationID)).toEqual([Integration.ID.make("jira")])
      expect(yield* service.get(integrationID)).toBeUndefined()

      const scope = yield* Scope.make()
      const adapter: IssueProvider.Adapter = {
        integrationID,
        name: "GitHub",
        method: { type: "key" },
        tenantIdentity: () => Effect.succeed("github.com"),
        verify: () => Effect.succeed({ ok: true, detail: "connected" }),
        metadata: () => Effect.succeed({ projects: [], users: [], labels: [], statuses: [], components: [], issueTypes: [], fields: [] }),
        search: () => Effect.succeed({ issues: [], cursor: "cursor" }),
        get: () => Effect.die("unused"),
        comment: () => new IssueProvider.NotImplementedError({ operation: "comment" }),
        transition: () => new IssueProvider.NotImplementedError({ operation: "transition" }),
      }
      yield* service.register(adapter).pipe(Scope.provide(scope))
      expect((yield* service.list()).map((item) => item.integrationID)).toEqual([
        Integration.ID.make("jira"),
        integrationID,
      ])
      expect(yield* service.get(integrationID)).toBe(adapter)

      yield* Scope.close(scope, Exit.void)
      expect((yield* service.list()).map((item) => item.integrationID)).toEqual([Integration.ID.make("jira")])
      expect(yield* service.get(integrationID)).toBeUndefined()
    }),
  )
})

describe("IssueWatcherOwner", () => {
  it.live("is active for an in-memory database", () =>
    Effect.gen(function* () {
      const layer = AppNodeBuilder.build(IssueWatcherOwner.node, [
        [Database.node, Database.layerFromPath(":memory:")],
      ])
      const context = yield* Layer.build(layer)
      expect(Context.get(context, IssueWatcherOwner.Service).status()).toEqual({ status: "active" })
    }),
  )

  it.live("detects file contention and releases ownership with its scope", () =>
    Effect.acquireUseRelease(
      Effect.promise(tmpdir),
      (tmp) =>
        Effect.gen(function* () {
          const filename = path.join(tmp.path, "core.sqlite")
          const ownerLayer = () =>
            AppNodeBuilder.build(IssueWatcherOwner.node, [[Database.node, Database.layerFromPath(filename)]])
          const firstScope = yield* Scope.make()
          const secondScope = yield* Scope.make()
          const first = Context.get(
            yield* Layer.buildWithMemoMap(ownerLayer(), Layer.makeMemoMapUnsafe(), firstScope),
            IssueWatcherOwner.Service,
          )
          const second = Context.get(
            yield* Layer.buildWithMemoMap(ownerLayer(), Layer.makeMemoMapUnsafe(), secondScope),
            IssueWatcherOwner.Service,
          )

          expect(first.status()).toEqual({ status: "active" })
          expect(second.status()).toEqual({
            status: "owner_conflict",
            detail: `Another process owns issue watching for ${filename}`,
          })

          yield* Scope.close(firstScope, Exit.void)
          const thirdScope = yield* Scope.make()
          const third = Context.get(
            yield* Layer.buildWithMemoMap(ownerLayer(), Layer.makeMemoMapUnsafe(), thirdScope),
            IssueWatcherOwner.Service,
          )
          expect(third.status()).toEqual({ status: "active" })

          yield* Scope.close(secondScope, Exit.void)
          yield* Scope.close(thirdScope, Exit.void)
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})

describe("GlobalConfig", () => {
  it.live("returns issue watcher defaults when configuration is absent", () =>
    Effect.acquireUseRelease(
      Effect.promise(tmpdir),
      (tmp) =>
        Effect.gen(function* () {
          const layer = AppNodeBuilder.build(GlobalConfig.node, [[Global.node, Global.layerWith({ config: tmp.path })]])
          yield* GlobalConfig.Service.use((config) => config.getIssueWatcher()).pipe(
            Effect.tap((value) =>
              Effect.sync(() =>
                expect(value).toEqual({
                  pollInterval: 120,
                  concurrentRuns: 3,
                  retryFailedRuns: "once",
                }),
              ),
            ),
            Effect.provide(layer),
          )
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("updates issue watcher settings while preserving unrelated configuration", () =>
    Effect.acquireUseRelease(
      Effect.promise(tmpdir),
      (tmp) =>
        Effect.gen(function* () {
          const filename = path.join(tmp.path, "opencode.json")
          yield* Effect.promise(() =>
            fs.writeFile(filename, '{\n  // retained input\n  "model": "anthropic/claude",\n  "custom": { "keep": true }\n}\n'),
          )
          const layer = AppNodeBuilder.build(GlobalConfig.node, [[Global.node, Global.layerWith({ config: tmp.path })]])
          const updated = { pollInterval: 30, concurrentRuns: 2, retryFailedRuns: "never" as const }
          yield* GlobalConfig.Service.use((config) => config.updateIssueWatcher(updated)).pipe(Effect.provide(layer))

          expect(JSON.parse(yield* Effect.promise(() => fs.readFile(filename, "utf8")))).toEqual({
            model: "anthropic/claude",
            custom: { keep: true },
            issueWatcher: updated,
          })
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})
