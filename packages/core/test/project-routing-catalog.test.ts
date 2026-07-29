import { $ } from "bun"
import { describe, expect } from "bun:test"
import path from "path"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectRoutingCatalog } from "@opencode-ai/core/project/routing-catalog"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { Project } from "@opencode-ai/schema/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect } from "effect"
import fs from "fs/promises"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, ProjectRoutingCatalog.node])))

describe("ProjectRoutingCatalog", () => {
  it.live("lists project directories and normalized git remotes", () =>
    Effect.acquireUseRelease(
      Effect.promise(tmpdir),
      (tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await $`git init`.cwd(tmp.path).quiet()
            await $`git remote add origin git@github.com:OpenCode-AI/opencode.git`.cwd(tmp.path).quiet()
            await $`git remote add mirror https://git.example.com/platform/opencode.git`.cwd(tmp.path).quiet()
          })
          const projectID = Project.ID.make("project-routing")
          yield* Database.Service.use(({ db }) =>
            db.insert(ProjectTable).values({
              id: projectID,
              worktree: AbsolutePath.make(tmp.path),
              name: "OpenCode",
              sandboxes: [],
              time_created: 1,
              time_updated: 1,
            }).run().pipe(Effect.orDie),
          )

          expect(yield* ProjectRoutingCatalog.Service.use((catalog) => catalog.list())).toEqual([{
            projectID,
            name: "OpenCode",
            directories: [tmp.path],
            remotes: [
              { host: "git.example.com", path: "platform/opencode", label: "git.example.com/platform/opencode" },
              { host: "github.com", path: "OpenCode-AI/opencode", label: "OpenCode-AI/opencode" },
            ],
          }])
          expect(path.isAbsolute(tmp.path)).toBe(true)
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("resolves Git and non-Git routing selections for provisioning", () =>
    Effect.acquireUseRelease(
      Effect.promise(tmpdir),
      (tmp) =>
        Effect.gen(function* () {
          const gitDirectory = AbsolutePath.make(path.join(tmp.path, "git"))
          const plainDirectory = AbsolutePath.make(path.join(tmp.path, "plain"))
          yield* Effect.promise(async () => {
            await fs.mkdir(gitDirectory)
            await fs.mkdir(plainDirectory)
            await $`git init`.cwd(gitDirectory).quiet()
            await $`git config commit.gpgsign false`.cwd(gitDirectory).quiet()
            await $`git config user.email test@opencode.test`.cwd(gitDirectory).quiet()
            await $`git config user.name Test`.cwd(gitDirectory).quiet()
            await Bun.write(path.join(gitDirectory, "README.md"), "ready\n")
            await $`git add .`.cwd(gitDirectory).quiet()
            await $`git commit -m root`.cwd(gitDirectory).quiet()
          })
          const gitID = Project.ID.make("routing-git")
          const plainID = Project.ID.make("routing-plain")
          yield* Database.Service.use(({ db }) =>
            db.insert(ProjectTable).values([
              { id: gitID, worktree: gitDirectory, vcs: "git", sandboxes: [] },
              { id: plainID, worktree: plainDirectory, sandboxes: [] },
            ]).run().pipe(Effect.orDie),
          )
          const catalog = yield* ProjectRoutingCatalog.Service
          const git = yield* catalog.resolve(gitID)
          expect(git.id).toBe(gitID)
          expect(git.directory).toBe(gitDirectory)
          expect(git.vcs).toBe("git")
          expect(git.sourceCommonDirectory).toBeDefined()
          expect(git.baseRevision).toMatch(/^[0-9a-f]{40}$/)
          expect(git.sourceBranch).toBeDefined()
          expect(yield* catalog.resolve(plainID)).toEqual({ id: plainID, directory: plainDirectory })
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})
