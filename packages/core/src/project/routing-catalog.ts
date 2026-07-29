export * as ProjectRoutingCatalog from "./routing-catalog"

import path from "path"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { WorkspaceProvisioner } from "@opencode-ai/schema/workspace-provisioner"
import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { Git } from "../git"
import { Repository } from "../repository"
import { AbsolutePath } from "../schema"
import { ProjectDirectoryTable, ProjectTable } from "./sql"

export interface Interface {
  readonly list: () => Effect.Effect<ReadonlyArray<IssueWatcher.ProjectRoutingSnapshot>>
  readonly resolve: (projectID: WorkspaceProvisioner.ResolvedProject["id"]) => Effect.Effect<WorkspaceProvisioner.ResolvedProject, ResolutionError>
}

export class ResolutionError extends Schema.TaggedErrorClass<ResolutionError>()("ProjectRoutingCatalog.ResolutionError", {
  detail: Schema.String,
}) {}

export class Service extends Context.Service<Service, Interface>()("@opencode/ProjectRoutingCatalog") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const git = yield* Git.Service

    const resolve = Effect.fn("ProjectRoutingCatalog.resolve")(function* (projectID: WorkspaceProvisioner.ResolvedProject["id"]) {
      const project = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get().pipe(Effect.orDie)
      if (!project || project.id === "global") return yield* new ResolutionError({ detail: "Selected project is not registered" })
      const directory = AbsolutePath.make(project.worktree)
      const repository = yield* git.repo.discover(directory)
      if (!project.vcs) {
        if (repository) return yield* new ResolutionError({ detail: "Non-Git project selection resolves to a Git checkout" })
        return { id: project.id, directory }
      }
      if (!repository || repository.worktree !== directory)
        return yield* new ResolutionError({ detail: "Selected Git project directory is not its exact checkout root" })
      const baseRevision = yield* git.history.head(repository)
      if (!baseRevision) return yield* new ResolutionError({ detail: "Selected Git project has no HEAD revision" })
      const sourceBranch = yield* git.history.branch(repository)
      return {
        id: project.id,
        directory,
        vcs: "git" as const,
        sourceCommonDirectory: repository.commonDirectory,
        baseRevision,
        ...(sourceBranch ? { sourceBranch } : {}),
        ...(!sourceBranch ? { sourceDetached: true } : {}),
      }
    })

    return Service.of({
      resolve,
      list: Effect.fn("ProjectRoutingCatalog.list")(function* () {
        const projects = (yield* db
          .select()
          .from(ProjectTable)
          .orderBy(asc(ProjectTable.time_created))
          .all()
          .pipe(Effect.orDie)).filter((project) => project.id !== "global")
        const storedDirectories = yield* db
          .select()
          .from(ProjectDirectoryTable)
          .orderBy(asc(ProjectDirectoryTable.time_created), asc(ProjectDirectoryTable.directory))
          .all()
          .pipe(Effect.orDie)
        return yield* Effect.forEach(projects, (project) =>
          Effect.gen(function* () {
            const directories = [
              project.worktree,
              ...project.sandboxes,
              ...storedDirectories.filter((item) => item.project_id === project.id).map((item) => item.directory),
            ].filter((directory, index, all) => all.indexOf(directory) === index)
            const remotes = (yield* Effect.forEach(directories, (directory) =>
              Effect.gen(function* () {
                const repository = yield* git.repo.discover(AbsolutePath.make(directory))
                if (!repository) return []
                return (yield* git.remote.list(repository)).flatMap((remote) => {
                  const parsed = Repository.parse(remote)
                  if (!parsed || Repository.isFile(parsed)) return []
                  return [{ host: parsed.host, path: parsed.path, label: parsed.label }]
                })
              }),
            )).flat()
            return {
              projectID: project.id,
              name: project.name ?? path.basename(project.worktree),
              directories,
              remotes: remotes.filter(
                (remote, index, all) =>
                  all.findIndex((item) => item.host === remote.host && item.path === remote.path) === index,
              ),
            }
          }),
        )
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, Git.node] })
