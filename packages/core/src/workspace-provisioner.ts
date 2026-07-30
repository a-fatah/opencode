export * as WorkspaceProvisioner from "./workspace-provisioner"

import path from "path"
import { WorkspaceProvisioner } from "@opencode-ai/schema/workspace-provisioner"
import { WorkspaceID } from "@opencode-ai/schema/workspace-id"
import { and, eq, ne, or } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Git } from "./git"
import { Project } from "./project"
import { ProjectDirectories } from "./project/directories"
import { ProjectTable } from "./project/sql"
import { AppProcess } from "./process"
import { AbsolutePath } from "./schema"
import { EffectFlock } from "./util/effect-flock"
import { Hash } from "./util/hash"
import { WorkspaceProvisionerTable } from "./workspace-provisioner.sql"

export const LeaseID = WorkspaceProvisioner.LeaseID
export type LeaseID = WorkspaceProvisioner.LeaseID
export const Strategy = WorkspaceProvisioner.Strategy
export type Strategy = WorkspaceProvisioner.Strategy
export const ResolvedProject = WorkspaceProvisioner.ResolvedProject
export type ResolvedProject = WorkspaceProvisioner.ResolvedProject
export const ReserveInput = WorkspaceProvisioner.ReserveInput
export type ReserveInput = WorkspaceProvisioner.ReserveInput
export const Lease = WorkspaceProvisioner.Lease
export type Lease = WorkspaceProvisioner.Lease
export const Result = WorkspaceProvisioner.Result
export type Result = WorkspaceProvisioner.Result

export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "WorkspaceProvisioner.InvalidRequestError",
  { detail: Schema.String },
) {}

export class CollisionError extends Schema.TaggedErrorClass<CollisionError>()("WorkspaceProvisioner.CollisionError", {
  detail: Schema.String,
}) {}

export class NotReadyError extends Schema.TaggedErrorClass<NotReadyError>()("WorkspaceProvisioner.NotReadyError", {
  detail: Schema.String,
}) {}

export class OwnershipError extends Schema.TaggedErrorClass<OwnershipError>()("WorkspaceProvisioner.OwnershipError", {
  detail: Schema.String,
}) {}

export class SetupAmbiguousError extends Schema.TaggedErrorClass<SetupAmbiguousError>()(
  "WorkspaceProvisioner.SetupAmbiguousError",
  { detail: Schema.String },
) {}

export type Error =
  | InvalidRequestError
  | CollisionError
  | NotReadyError
  | OwnershipError
  | SetupAmbiguousError
  | Git.OperationError
  | Git.WorktreeError
  | EffectFlock.LockError

export interface Interface {
  readonly reserve: (input: ReserveInput) => Effect.Effect<Lease, InvalidRequestError | CollisionError>
  readonly provision: (lease: Lease) => Effect.Effect<Result, Error>
  readonly reconcileSetup: (lease: Lease, outcome: "completed" | "retry") => Effect.Effect<void, Error>
  readonly cleanup: (lease: Lease) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WorkspaceProvisioner") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const projects = yield* Project.Service
    const directories = yield* ProjectDirectories.Service
    const proc = yield* AppProcess.Service
    const flock = yield* EffectFlock.Service

    const reserve = Effect.fn("WorkspaceProvisioner.reserve")(function* (input: ReserveInput) {
      if (!input.ownerID.trim()) return yield* new InvalidRequestError({ detail: "Owner ID must not be empty" })
      if (!input.inputKey.trim()) return yield* new InvalidRequestError({ detail: "Input key must not be empty" })
      const digest = Hash.sha256(
        `${input.ownerID}\0${input.inputKey}\0${input.project.id}\0${JSON.stringify(input.strategy)}`,
      ).slice(0, 20)
      const id = LeaseID.make(`wpl_${digest}`)
      const existing = yield* db
        .select({ lease: WorkspaceProvisionerTable.lease, state: WorkspaceProvisionerTable.state })
        .from(WorkspaceProvisionerTable)
        .where(eq(WorkspaceProvisionerTable.id, id))
        .get()
        .pipe(Effect.orDie)
      if (existing) {
        if (
          existing.lease.ownerID !== input.ownerID ||
          existing.lease.inputKey !== input.inputKey ||
          existing.lease.projectID !== input.project.id ||
          JSON.stringify(existing.lease.strategy) !== JSON.stringify(input.strategy)
        )
          return yield* new CollisionError({ detail: "Lease ID is already reserved for different inputs" })
        if (existing.state === "cleaned") {
          const conflict = yield* db
            .select({ id: WorkspaceProvisionerTable.id })
            .from(WorkspaceProvisionerTable)
            .where(
              and(
                ne(WorkspaceProvisionerTable.state, "cleaned"),
                or(
                  eq(WorkspaceProvisionerTable.directory, existing.lease.location.directory),
                  existing.lease.branch
                    ? and(
                        eq(WorkspaceProvisionerTable.project_id, existing.lease.projectID),
                        eq(WorkspaceProvisionerTable.branch, existing.lease.branch),
                      )
                    : undefined,
                ),
              ),
            )
            .get()
            .pipe(Effect.orDie)
          if (conflict)
            return yield* new CollisionError({ detail: "Cleaned lease resources are reserved by another lease" })
          const reactivated = yield* db
            .update(WorkspaceProvisionerTable)
            .set({ state: "reserved", setup_state: existing.lease.setupCommand ? "pending" : null })
            .where(and(eq(WorkspaceProvisionerTable.id, id), eq(WorkspaceProvisionerTable.state, "cleaned")))
            .returning({ id: WorkspaceProvisionerTable.id })
            .get()
            .pipe(
              Effect.mapError(
                () => new CollisionError({ detail: "Cleaned lease resources are reserved by another lease" }),
              ),
            )
          if (!reactivated)
            return yield* new CollisionError({ detail: "Cleaned lease changed while being reactivated" })
        }
        return existing.lease
      }
      if (input.project.vcs === "git" && (!input.project.sourceCommonDirectory || !input.project.baseRevision))
        return yield* new InvalidRequestError({ detail: "Git projects require an exact repository identity and HEAD" })
      if (input.project.vcs === "git" && Boolean(input.project.sourceBranch) === Boolean(input.project.sourceDetached))
        return yield* new InvalidRequestError({ detail: "Git projects require exactly one original checkout state" })
      if (input.strategy.type !== "current" && (!input.project.vcs || !input.project.baseRevision))
        return yield* new InvalidRequestError({ detail: `${input.strategy.type} requires an exact Git base revision` })
      if (input.strategy.type !== "current" && !input.project.sourceCommonDirectory)
        return yield* new InvalidRequestError({ detail: `${input.strategy.type} requires an exact Git repository identity` })
      const branch = input.strategy.type === "current" ? undefined : branchName(input.strategy, input.inputKey, digest)
      const directory =
        input.strategy.type === "worktree"
          ? AbsolutePath.make(
              path.join(
                path.dirname(input.project.directory),
                ".opencode-worktrees",
                Hash.sha256(input.project.id).slice(0, 20),
                digest,
              ),
            )
          : input.project.directory
      const project = yield* db
        .select({ commands: ProjectTable.commands, worktree: ProjectTable.worktree, sandboxes: ProjectTable.sandboxes, vcs: ProjectTable.vcs })
        .from(ProjectTable)
        .where(eq(ProjectTable.id, input.project.id))
        .get()
        .pipe(Effect.orDie)
      if (!project) return yield* new InvalidRequestError({ detail: "Project is not registered" })
      const registered = project.worktree === input.project.directory || project.sandboxes.includes(input.project.directory) ||
        (yield* directories.contains({ projectID: input.project.id, directory: input.project.directory }))
      if (!registered)
        return yield* new InvalidRequestError({ detail: "Selected source directory does not match the registered project" })
      if (input.project.vcs !== (project.vcs ?? undefined))
        return yield* new InvalidRequestError({ detail: "Selected source repository does not match the registered project" })
      const lease: Lease = {
        id,
        ownerID: input.ownerID,
        inputKey: input.inputKey,
        projectID: input.project.id,
        strategy: input.strategy,
        sourceDirectory: input.project.directory,
        ...(input.project.sourceCommonDirectory
          ? { sourceCommonDirectory: input.project.sourceCommonDirectory }
          : {}),
        location: {
          directory,
          ...(input.strategy.type === "worktree" ? { workspaceID: WorkspaceID.make(`wrk_${digest}`) } : {}),
        },
        ownership: input.strategy.type === "current" ? "borrowed" : input.strategy.type,
        ...(input.project.baseRevision ? { baseRevision: input.project.baseRevision } : {}),
        ...(input.project.sourceBranch ? { sourceBranch: input.project.sourceBranch } : {}),
        ...(input.project.sourceDetached ? { sourceDetached: true } : {}),
        ...(branch ? { branch } : {}),
        ...(input.strategy.type === "current" ? {} : { cleanupToken: Hash.sha256(`cleanup\0${id}`) }),
        ...(input.strategy.type === "worktree" && project.commands?.start?.trim()
          ? { setupCommand: project.commands.start.trim() }
          : {}),
      }
      const inserted = yield* db
        .insert(WorkspaceProvisionerTable)
        .values({
          id,
          owner_id: input.ownerID,
          project_id: input.project.id,
          directory,
          branch,
          lease,
          state: "reserved",
          setup_state: lease.setupCommand ? "pending" : null,
        })
        .onConflictDoNothing()
        .returning({ id: WorkspaceProvisionerTable.id })
        .get()
        .pipe(Effect.orDie)
      if (!inserted) {
        const reconciled = yield* db
          .select({ lease: WorkspaceProvisionerTable.lease })
          .from(WorkspaceProvisionerTable)
          .where(eq(WorkspaceProvisionerTable.id, id))
          .get()
          .pipe(Effect.orDie)
        if (
          reconciled &&
          reconciled.lease.ownerID === input.ownerID &&
          reconciled.lease.inputKey === input.inputKey &&
          reconciled.lease.projectID === input.project.id &&
          JSON.stringify(reconciled.lease.strategy) === JSON.stringify(input.strategy)
        )
          return reconciled.lease
        return yield* new CollisionError({ detail: "Reserved branch or directory collides with another lease" })
      }
      return lease
    })

    const owned = Effect.fnUntraced(function* (lease: Lease) {
      const row = yield* db
        .select()
        .from(WorkspaceProvisionerTable)
        .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.owner_id, lease.ownerID)))
        .get()
        .pipe(Effect.orDie)
      if (!row || JSON.stringify(row.lease) !== JSON.stringify(lease))
        return yield* new OwnershipError({ detail: "Lease is not owned by this reservation" })
      return row
    })

    const validate = Effect.fnUntraced(function* (lease: Lease) {
      if (!(yield* fs.isDir(lease.location.directory)))
        return yield* new NotReadyError({ detail: "Workspace directory is unavailable" })
      const repository = yield* git.repo.discover(lease.location.directory)
      if (repository || lease.sourceCommonDirectory || lease.baseRevision) {
        const resolved = yield* projects.resolve(lease.location.directory)
        if (resolved.id !== lease.projectID)
          return yield* new NotReadyError({ detail: "Workspace does not belong to the reserved project" })
      }
      if (repository && !lease.sourceCommonDirectory)
        return yield* new NotReadyError({ detail: "Workspace became a Git checkout after reservation" })
      if (lease.baseRevision && !repository)
        return yield* new NotReadyError({ detail: "Workspace is not a Git checkout" })
      if (repository && lease.branch && (yield* git.history.branch(repository)) !== lease.branch)
        return yield* new NotReadyError({ detail: "Workspace is checked out on a different branch" })
      if (repository && lease.sourceCommonDirectory && repository.commonDirectory !== lease.sourceCommonDirectory)
        return yield* new NotReadyError({ detail: "Workspace repository identity has changed" })
      if (repository && repository.worktree !== lease.location.directory)
        return yield* new NotReadyError({ detail: "Workspace path is not the reserved Git checkout" })
      if (repository && !(yield* git.change.clean(repository)))
        return yield* new NotReadyError({ detail: "Workspace checkout has uncommitted changes" })
      if (lease.strategy.type === "current" && repository) {
        if ((yield* git.history.head(repository)) !== lease.baseRevision)
          return yield* new NotReadyError({ detail: "Current Git checkout HEAD changed from the reservation" })
        if ((yield* git.history.branch(repository)) !== lease.sourceBranch)
          return yield* new NotReadyError({ detail: "Current Git checkout branch changed from the reservation" })
      }
      if (lease.strategy.type !== "current" && repository) {
        if (!lease.branch || !lease.baseRevision)
          return yield* new NotReadyError({ detail: "Owned Git lease is incomplete" })
        if ((yield* git.history.head(repository)) !== lease.baseRevision)
          return yield* new NotReadyError({ detail: "Owned Git checkout moved from the reserved base revision" })
        if ((yield* git.history.revision(repository, lease.branch)) !== lease.baseRevision)
          return yield* new NotReadyError({ detail: "Owned Git branch moved from the reserved base revision" })
      }
      return repository
    })

    const provisionUnlocked = Effect.fnUntraced(function* (lease: Lease) {
      const row = yield* owned(lease)
      if (row.state === "cleaned") return yield* new OwnershipError({ detail: "Lease has already been cleaned" })
      if (row.state === "ready") {
        yield* validate(lease)
        return { lease, location: lease.location }
      }
      if (row.state === "cleaning")
        return yield* new NotReadyError({ detail: "Workspace cleanup is in progress" })
      const source = yield* git.repo.discover(lease.sourceDirectory)
      if (source || lease.sourceCommonDirectory || lease.baseRevision) {
        const resolved = yield* projects.resolve(lease.sourceDirectory)
        if (resolved.id !== lease.projectID)
          return yield* new NotReadyError({ detail: "Selected source repository resolves to a different project" })
      }
      if (source && !lease.sourceCommonDirectory)
        return yield* new OwnershipError({ detail: "Selected source became a Git checkout after reservation" })
      if (lease.strategy.type !== "current" && (!source || source.worktree !== lease.sourceDirectory))
        return yield* new NotReadyError({ detail: "Selected source directory is not the registered Git checkout" })
      if (lease.sourceCommonDirectory && source?.commonDirectory !== lease.sourceCommonDirectory)
        return yield* new OwnershipError({ detail: "Source repository identity has changed" })
      if (lease.baseRevision && (!source || !(yield* git.history.revisionExists(source, lease.baseRevision))))
        return yield* new NotReadyError({ detail: "Reserved Git base revision is unavailable" })
      if (lease.branch && source && !(yield* git.history.branchValid(source, lease.branch)))
        return yield* new InvalidRequestError({ detail: "Branch pattern does not produce a valid Git branch name" })

      if (lease.strategy.type === "current") {
        if (source && (!lease.sourceCommonDirectory || !lease.baseRevision))
          return yield* new OwnershipError({ detail: "Current Git lease has no exact repository identity" })
        if (source && (yield* git.history.head(source)) !== lease.baseRevision)
          return yield* new OwnershipError({ detail: "Current Git checkout HEAD changed from the reservation" })
        if (source && (yield* git.history.branch(source)) !== lease.sourceBranch)
          return yield* new OwnershipError({ detail: "Current Git checkout branch changed from the reservation" })
        if (source && !(yield* git.change.clean(source)))
          return yield* new NotReadyError({ detail: `Current checkout has uncommitted changes: ${source.worktree}` })
      }
      const target = lease.strategy.type === "worktree" ? yield* git.repo.discover(lease.location.directory) : undefined
      if (target && target.worktree !== lease.location.directory)
        return yield* new CollisionError({ detail: "Reserved worktree path resolves to an enclosing repository" })
      if (target && lease.sourceCommonDirectory && target.commonDirectory !== lease.sourceCommonDirectory)
        return yield* new OwnershipError({ detail: "Worktree no longer belongs to the reserved repository" })
      if (lease.strategy.type === "branch") {
        if (!source || !lease.branch || !lease.baseRevision)
          return yield* new NotReadyError({ detail: "Branch lease is incomplete" })
        const current = yield* git.history.branch(source)
        const exists = yield* git.history.branchExists(source, lease.branch)
        if (exists) {
          if (
            row.state !== "provisioning" ||
            current !== lease.branch ||
            (yield* git.history.revision(source, lease.branch)) !== lease.baseRevision
          )
            return yield* new CollisionError({ detail: "Reserved branch is not the exact interrupted lease branch" })
          if (!(yield* git.change.clean(source)))
            return yield* new OwnershipError({ detail: "Interrupted branch contains uncommitted changes" })
        } else {
          if (!(yield* git.change.clean(source)))
            return yield* new NotReadyError({ detail: `Current checkout has uncommitted changes: ${source.worktree}` })
        }
      }
      if (lease.strategy.type === "worktree") {
        if (!source || !lease.branch || !lease.baseRevision)
          return yield* new NotReadyError({ detail: "Worktree lease is incomplete" })
        if (target) {
          if (
            row.state !== "provisioning" ||
            (yield* git.history.branch(target)) !== lease.branch ||
            (yield* git.history.revision(source, lease.branch)) !== lease.baseRevision
          )
            return yield* new CollisionError({ detail: "Reserved path is not the exact interrupted lease worktree" })
        } else {
          if (yield* fs.existsSafe(lease.location.directory))
            return yield* new CollisionError({ detail: "Reserved worktree path contains an unrelated entry" })
          if (yield* git.history.branchExists(source, lease.branch)) {
            if (
              row.state !== "provisioning" ||
              (yield* git.history.revision(source, lease.branch)) !== lease.baseRevision
            )
              return yield* new CollisionError({ detail: "Reserved worktree branch exists without its owned worktree" })
            yield* git.sync.deleteBranch(source, lease.branch)
          }
        }
      }
      if (row.state === "reserved") {
        const claimed = yield* db
          .update(WorkspaceProvisionerTable)
          .set({ state: "provisioning" })
          .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.state, "reserved")))
          .returning({ id: WorkspaceProvisionerTable.id })
          .get()
          .pipe(Effect.orDie)
        if (!claimed) return yield* new NotReadyError({ detail: "Workspace lease state changed concurrently" })
      }
      if (lease.strategy.type === "branch") {
        if (!source || !lease.branch || !lease.baseRevision)
          return yield* new NotReadyError({ detail: "Branch lease is incomplete" })
        if (!(yield* git.history.branchExists(source, lease.branch)))
          yield* git.sync.createBranch(source, lease.branch, lease.baseRevision)
      }
      if (lease.strategy.type === "worktree") {
        if (!source || !lease.branch || !lease.baseRevision)
          return yield* new NotReadyError({ detail: "Worktree lease is incomplete" })
        if (!target) {
          yield* fs.ensureDir(path.dirname(lease.location.directory)).pipe(Effect.orDie)
          yield* git.worktree.create({
            repository: source,
            directory: lease.location.directory,
            revision: lease.baseRevision,
            branch: lease.branch,
          })
        }
        yield* validate(lease)
        if (lease.setupCommand && row.setup_state === "running") {
          yield* db
            .update(WorkspaceProvisionerTable)
            .set({ setup_state: "ambiguous" })
            .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.setup_state, "running")))
            .run()
            .pipe(Effect.orDie)
          return yield* new SetupAmbiguousError({
            detail: "Workspace setup may have run before interruption; confirm completion or explicitly retry",
          })
        }
        if (lease.setupCommand && row.setup_state === "ambiguous")
          return yield* new SetupAmbiguousError({
            detail: "Workspace setup requires explicit completion confirmation or retry",
          })
        if (lease.setupCommand && row.setup_state !== "completed") {
          yield* db
            .update(WorkspaceProvisionerTable)
            .set({ setup_state: "running" })
            .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.state, "provisioning")))
            .run()
            .pipe(Effect.orDie)
          const result = yield* proc
            .run(makeSetupCommand(lease.setupCommand, lease.location.directory))
            .pipe(
              Effect.tapError(() =>
                db
                  .update(WorkspaceProvisionerTable)
                  .set({ setup_state: "pending" })
                  .where(eq(WorkspaceProvisionerTable.id, lease.id))
                  .run()
                  .pipe(Effect.orDie),
              ),
              Effect.mapError((error) => new NotReadyError({ detail: error.message })),
            )
          if (result.exitCode !== 0) {
            yield* db
              .update(WorkspaceProvisionerTable)
              .set({ setup_state: "pending" })
              .where(eq(WorkspaceProvisionerTable.id, lease.id))
              .run()
              .pipe(Effect.orDie)
            return yield* new NotReadyError({ detail: result.stderr.toString("utf8").trim() || "Workspace setup failed" })
          }
          yield* db
            .update(WorkspaceProvisionerTable)
            .set({ setup_state: "completed" })
            .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.setup_state, "running")))
            .run()
            .pipe(Effect.orDie)
        }
        yield* directories.create({
          projectID: lease.projectID,
          directory: lease.location.directory,
          strategy: "workspace_provisioner",
          behavior: "replace",
        })
      }
      yield* validate(lease)
      yield* db
        .update(WorkspaceProvisionerTable)
        .set({ state: "ready" })
        .where(eq(WorkspaceProvisionerTable.id, lease.id))
        .run()
        .pipe(Effect.orDie)
      return { lease, location: lease.location }
    })

    const provision = Effect.fn("WorkspaceProvisioner.provision")((lease: Lease) =>
      flock.withLock(provisionUnlocked(lease), `workspace-provisioner:${lease.id}`),
    )

    const reconcileSetup = Effect.fn("WorkspaceProvisioner.reconcileSetup")((lease: Lease, outcome: "completed" | "retry") =>
      flock.withLock(
        Effect.gen(function* () {
          const row = yield* owned(lease)
          if (!lease.setupCommand) return yield* new InvalidRequestError({ detail: "Lease has no setup command" })
          if (row.state === "cleaned" || row.state === "cleaning")
            return yield* new OwnershipError({ detail: "Lease is not available for setup recovery" })
          if (row.setup_state !== "ambiguous")
            return yield* new InvalidRequestError({ detail: "Workspace setup is not ambiguous" })
          const updated = yield* db
            .update(WorkspaceProvisionerTable)
            .set({ setup_state: outcome === "completed" ? "completed" : "pending" })
            .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.setup_state, "ambiguous")))
            .returning({ id: WorkspaceProvisionerTable.id })
            .get()
            .pipe(Effect.orDie)
          if (!updated) return yield* new NotReadyError({ detail: "Workspace setup state changed concurrently" })
        }),
        `workspace-provisioner:${lease.id}`,
      ),
    )

    const cleanupUnlocked = Effect.fnUntraced(function* (lease: Lease) {
      const row = yield* owned(lease)
      if (row.state === "cleaned") return
      if (row.state === "reserved") {
        yield* db
          .update(WorkspaceProvisionerTable)
          .set({ state: "cleaned" })
          .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.state, "reserved")))
          .run()
          .pipe(Effect.orDie)
        return
      }
      if (lease.ownership === "borrowed") {
        yield* db
          .update(WorkspaceProvisionerTable)
          .set({ state: "cleaned" })
          .where(eq(WorkspaceProvisionerTable.id, lease.id))
          .run()
          .pipe(Effect.orDie)
        return
      }
      if (!lease.cleanupToken || row.lease.cleanupToken !== lease.cleanupToken)
        return yield* new OwnershipError({ detail: "Cleanup token does not match the reservation" })
      const source = yield* git.repo.discover(lease.sourceDirectory)
      if (!source || !lease.branch) return yield* new NotReadyError({ detail: "Owned Git workspace is unavailable" })
      if (lease.sourceCommonDirectory && source.commonDirectory !== lease.sourceCommonDirectory)
        return yield* new OwnershipError({ detail: "Source repository identity has changed" })
      if (!lease.baseRevision) return yield* new OwnershipError({ detail: "Lease has no cleanup revision" })
      if (yield* git.history.branchExists(source, lease.branch)) {
        if ((yield* git.history.revision(source, lease.branch)) !== lease.baseRevision)
          return yield* new OwnershipError({ detail: "Refusing to clean a branch that diverged from its reserved revision" })
      }
      const target = lease.ownership === "worktree" ? yield* git.repo.discover(lease.location.directory) : undefined
      if (target && target.worktree !== lease.location.directory)
        return yield* new OwnershipError({ detail: "Reserved worktree path no longer contains the owned worktree" })
      if (target && target.commonDirectory !== source.commonDirectory)
        return yield* new OwnershipError({ detail: "Worktree no longer belongs to the reserved repository" })
      if (lease.ownership === "worktree" && !target && (yield* fs.existsSafe(lease.location.directory)))
        return yield* new OwnershipError({ detail: "Reserved worktree path contains an unrelated entry" })
      if (row.state !== "cleaning") {
        const claimed = yield* db
          .update(WorkspaceProvisionerTable)
          .set({ state: "cleaning" })
          .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.state, row.state)))
          .returning({ id: WorkspaceProvisionerTable.id })
          .get()
          .pipe(Effect.orDie)
        if (!claimed) return yield* new NotReadyError({ detail: "Workspace lease state changed concurrently" })
      }
      if (lease.ownership === "worktree") {
        if (target) {
          yield* git.worktree.remove({ repository: target, directory: lease.location.directory, force: false }).pipe(
            Effect.tapError(() =>
              db
                .update(WorkspaceProvisionerTable)
                .set({ state: row.state })
                .where(and(eq(WorkspaceProvisionerTable.id, lease.id), eq(WorkspaceProvisionerTable.state, "cleaning")))
                .run()
                .pipe(Effect.orDie),
            ),
          )
        }
        yield* directories.remove({ projectID: lease.projectID, directory: lease.location.directory })
      }
      if (yield* git.history.branchExists(source, lease.branch)) {
        if ((yield* git.history.branch(source)) === lease.branch) {
          if (!(yield* git.change.clean(source)))
            return yield* new OwnershipError({ detail: "Refusing to clean a branch with uncommitted changes" })
          if (lease.sourceBranch) {
            if (!(yield* git.history.branchExists(source, lease.sourceBranch)))
              return yield* new OwnershipError({ detail: "Original checkout branch no longer exists" })
            if ((yield* git.history.revision(source, lease.sourceBranch)) !== lease.baseRevision)
              return yield* new OwnershipError({ detail: "Original checkout branch moved from its recorded HEAD" })
            yield* git.sync.checkoutBranch(source, lease.sourceBranch)
          } else if (lease.sourceDetached) {
            yield* git.sync.checkoutDetached(source, lease.baseRevision)
          } else {
            return yield* new OwnershipError({ detail: "Lease has no recorded original checkout state" })
          }
        } else {
          const current = yield* git.history.branch(source)
          const restored = lease.sourceBranch
            ? current === lease.sourceBranch && (yield* git.history.revision(source, lease.sourceBranch)) === lease.baseRevision
            : lease.sourceDetached && current === undefined && (yield* git.history.head(source)) === lease.baseRevision
          if (!restored) return yield* new OwnershipError({ detail: "Source checkout changed outside this lease" })
        }
        yield* git.sync.deleteBranch(source, lease.branch)
      }
      yield* db
        .update(WorkspaceProvisionerTable)
        .set({ state: "cleaned" })
        .where(eq(WorkspaceProvisionerTable.id, lease.id))
        .run()
        .pipe(Effect.orDie)
    })

    const cleanup = Effect.fn("WorkspaceProvisioner.cleanup")((lease: Lease) =>
      flock.withLock(cleanupUnlocked(lease), `workspace-provisioner:${lease.id}`),
    )

    return Service.of({ reserve, provision, reconcileSetup, cleanup })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Database.node, FSUtil.node, Git.node, Project.node, ProjectDirectories.node, AppProcess.node, EffectFlock.node],
})

function branchName(strategy: Strategy, inputKey: string, digest: string) {
  return strategy.type === "branch" ? strategy.pattern.replaceAll("{{issue.key}}", inputKey) : `opencode/${digest}`
}

export function makeSetupCommand(command: string, cwd: AbsolutePath, platform: NodeJS.Platform = process.platform) {
  const options = { cwd, extendEnv: true, stdin: "ignore" as const }
  return platform === "win32"
    ? ChildProcess.make("cmd", ["/c", command], options)
    : ChildProcess.make("sh", ["-lc", command], options)
}
