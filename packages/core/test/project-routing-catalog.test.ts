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
})
