import { $ } from "bun"
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Database } from "@opencode-ai/core/database/database"
import { Git } from "@opencode-ai/core/git"
import { Project } from "@opencode-ai/core/project"
import { ProjectDirectories } from "@opencode-ai/core/project/directories"
import { ProjectDirectoryTable, ProjectTable } from "@opencode-ai/core/project/sql"
import { WorkspaceProvisioner } from "@opencode-ai/core/workspace-provisioner"
import { WorkspaceProvisionerTable } from "@opencode-ai/core/workspace-provisioner.sql"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([WorkspaceProvisioner.node, Database.node, Git.node, Project.node, ProjectDirectories.node]),
  ),
)

function setup(command?: string) {
  return Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
    )
    yield* Effect.promise(async () => {
      await $`git init`.cwd(root.path).quiet()
      await $`git config commit.gpgsign false`.cwd(root.path).quiet()
      await $`git config user.email test@opencode.test`.cwd(root.path).quiet()
      await $`git config user.name Test`.cwd(root.path).quiet()
      await fs.writeFile(path.join(root.path, "README.md"), `${root.path}\n`)
      await $`git add .`.cwd(root.path).quiet()
      await $`git commit -m root`.cwd(root.path).quiet()
    })
    const directory = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(root.path)))
    const git = yield* Git.Service
    const repository = yield* git.repo.discover(directory)
    if (!repository) throw new Error("Repository not found")
    const baseRevision = yield* git.history.head(repository)
    if (!baseRevision) throw new Error("HEAD not found")
    const projectID = Project.ID.make(baseRevision)
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({
        id: projectID,
        worktree: directory,
        vcs: "git",
        sandboxes: [],
        commands: command ? { start: command } : undefined,
      })
      .run()
      .pipe(Effect.orDie)
    yield* db.insert(ProjectDirectoryTable).values({ project_id: projectID, directory }).run().pipe(Effect.orDie)
    return { directory, projectID, baseRevision, git, repository }
  })
}

describe("WorkspaceProvisioner", () => {
  test("constructs setup commands for the host shell", () => {
    const cwd = AbsolutePath.make(path.resolve("workspace"))
    const windows = WorkspaceProvisioner.makeSetupCommand("bun install", cwd, "win32")
    const posix = WorkspaceProvisioner.makeSetupCommand("bun install", cwd, "linux")

    expect(windows).toMatchObject({ command: "cmd", args: ["/c", "bun install"], options: { cwd, stdin: "ignore" } })
    expect(posix).toMatchObject({ command: "sh", args: ["-lc", "bun install"], options: { cwd, stdin: "ignore" } })
  })

  it.live("derives managed worktree paths only from fixed-width hashes", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const hostileID = Project.ID.make("../../../../tmp/escaped-project")
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: hostileID, worktree: fixture.directory, vcs: "git", sandboxes: [] })
        .run()
        .pipe(Effect.orDie)
      const lease = yield* (yield* WorkspaceProvisioner.Service).reserve({
        ownerID: "hostile-id",
        inputKey: "HOSTILE-ID",
        project: {
          id: hostileID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })
      const relative = path.relative(path.dirname(fixture.directory), lease.location.directory).split(path.sep)
      expect(relative).toEqual([".opencode-worktrees", expect.stringMatching(/^[a-f0-9]{20}$/), expect.stringMatching(/^[a-f0-9]{20}$/)])
      expect(lease.location.directory).not.toContain("escaped-project")
      expect(lease.location.workspaceID).toBeUndefined()
    }),
  )

  it.live("reserves deterministically and rejects a dirty current checkout", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const input = {
        ownerID: "issue-42",
        inputKey: "ISSUE-42",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git" as const,
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "current" as const },
      }
      const first = yield* service.reserve(input)
      expect(yield* service.reserve(input)).toEqual(first)
      expect(
        yield* service.reserve({
          ...input,
          project: { ...input.project, baseRevision: "mutable-value-ignored-on-retry" },
        }),
      ).toEqual(first)
      const concurrent = yield* Effect.all([service.reserve(input), service.reserve(input)], { concurrency: 2 })
      expect(concurrent).toEqual([first, first])

      const collision = yield* service
        .reserve({ ...input, ownerID: "another-owner" })
        .pipe(Effect.flip)
      expect(collision).toBeInstanceOf(WorkspaceProvisioner.CollisionError)

      yield* Effect.promise(() => Bun.write(path.join(fixture.directory, "dirty.txt"), "dirty"))
      const error = yield* service.provision(first).pipe(Effect.flip)
      expect(error).toMatchObject({
        _tag: "WorkspaceProvisioner.NotReadyError",
        detail: `Current checkout has uncommitted changes: ${fixture.directory}`,
      })
      yield* Effect.promise(() => fs.rm(path.join(fixture.directory, "dirty.txt")))

      expect((yield* service.provision(first)).location).toEqual(first.location)
      yield* service.cleanup(first)
      expect(yield* fixture.git.repo.discover(fixture.directory)).toBeDefined()
      expect(yield* service.reserve(input)).toEqual(first)
    }),
  )

  it.live("reconciles a ready worktree, runs setup once, and cleans only owned resources", () =>
    Effect.gen(function* () {
      const fixture = yield* setup('printf setup >> "$(git rev-parse --git-dir)/setup.log"')
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "issue-99",
        inputKey: "ISSUE-99",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })

      yield* Effect.all([service.provision(lease), service.provision(lease)], { concurrency: 2 })
      yield* service.provision(lease)
      const target = yield* fixture.git.repo.discover(lease.location.directory)
      if (!target) throw new Error("Provisioned worktree not found")
      expect(yield* Effect.promise(() => Bun.file(path.join(target.gitDirectory, "setup.log")).text())).toBe("setup")
      expect(yield* fixture.git.history.branch(fixture.repository)).not.toBe(lease.branch)

      yield* Effect.promise(() => Bun.write(path.join(lease.location.directory, "dirty.txt"), "dirty"))
      const dirty = yield* service.cleanup(lease).pipe(Effect.flip)
      expect(dirty).toBeInstanceOf(Git.WorktreeError)
      yield* Effect.promise(() => fs.rm(path.join(lease.location.directory, "dirty.txt")))
      yield* service.cleanup(lease)
      yield* service.cleanup(lease)
      expect(yield* Effect.promise(() => Bun.file(lease.location.directory).exists())).toBe(false)
      if (!lease.branch) throw new Error("Reserved worktree branch not found")
      expect(yield* fixture.git.history.branchExists(fixture.repository, lease.branch)).toBe(false)
      expect(yield* Effect.promise(() => fs.stat(fixture.directory).then((item) => item.isDirectory()))).toBe(true)
    }),
  )

  it.live("creates the reserved branch at the exact base and removes it without deleting the checkout", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "issue-branch",
        inputKey: "ISSUE-42",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "branch", pattern: "issues/{{issue.key}}" },
      })
      if (!lease.branch) throw new Error("Reserved branch not found")

      yield* service.provision(lease)
      expect(yield* fixture.git.history.branch(fixture.repository)).toBe("issues/ISSUE-42")
      expect(yield* fixture.git.history.head(fixture.repository)).toBe(fixture.baseRevision)

      yield* service.cleanup(lease)
      expect(yield* fixture.git.history.branch(fixture.repository)).toBe(lease.sourceBranch)
      expect(yield* fixture.git.history.head(fixture.repository)).toBe(fixture.baseRevision)
      expect(yield* fixture.git.history.branchExists(fixture.repository, lease.branch)).toBe(false)
      expect(yield* Effect.promise(() => fs.stat(fixture.directory).then((item) => item.isDirectory()))).toBe(true)
    }),
  )

  it.live("rejects an existing unowned branch without deleting it", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "collision",
        inputKey: "COLLISION-1",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "branch", pattern: "issues/{{issue.key}}" },
      })
      if (!lease.branch) throw new Error("Reserved branch not found")
      yield* fixture.git.sync.createBranch(fixture.repository, lease.branch, fixture.baseRevision)

      expect(yield* service.provision(lease).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.CollisionError)
      yield* service.cleanup(lease)
      expect(yield* fixture.git.history.branchExists(fixture.repository, lease.branch)).toBe(true)
    }),
  )

  it.live("rejects mismatched repositories and invalid Git branch names", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const mismatch = yield* service
        .reserve({
          ownerID: "mismatch",
          inputKey: "MISMATCH",
          project: {
            id: fixture.projectID,
            directory: AbsolutePath.make(path.join(fixture.directory, "nested")),
            vcs: "git",
            sourceCommonDirectory: fixture.repository.commonDirectory,
            baseRevision: fixture.baseRevision,
            sourceBranch: yield* fixture.git.history.branch(fixture.repository),
          },
          strategy: { type: "worktree" },
        })
        .pipe(Effect.flip)
      expect(mismatch).toBeInstanceOf(WorkspaceProvisioner.InvalidRequestError)

      for (const pattern of ["bad name", "bad..name", "bad.lock", ".bad", "bad/"]) {
        const invalidLease = yield* service.reserve({
          ownerID: `invalid-${pattern}`,
          inputKey: `INVALID-${pattern}`,
          project: {
            id: fixture.projectID,
            directory: fixture.directory,
            vcs: "git",
            sourceCommonDirectory: fixture.repository.commonDirectory,
            baseRevision: fixture.baseRevision,
            sourceBranch: yield* fixture.git.history.branch(fixture.repository),
          },
          strategy: { type: "branch", pattern },
        })
        const invalid = yield* service.provision(invalidLease).pipe(Effect.flip)
        expect(invalid).toBeInstanceOf(WorkspaceProvisioner.InvalidRequestError)
        const { db } = yield* Database.Service
        expect(
          yield* db
            .select({ state: WorkspaceProvisionerTable.state })
            .from(WorkspaceProvisionerTable)
            .where(eq(WorkspaceProvisionerTable.id, invalidLease.id))
            .get()
            .pipe(Effect.orDie),
        ).toEqual({ state: "reserved" })
        yield* service.cleanup(invalidLease)
      }
    }),
  )

  it.live("reconciles interrupted provisioning and setup from exact owned state", () =>
    Effect.gen(function* () {
      const fixture = yield* setup("true")
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "ambiguous",
        inputKey: "AMBIGUOUS",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })
      const { db } = yield* Database.Service
      if (!lease.branch || !lease.baseRevision) throw new Error("Incomplete worktree lease")
      yield* fixture.git.worktree.create({
        repository: fixture.repository,
        directory: lease.location.directory,
        branch: lease.branch,
        revision: lease.baseRevision,
      })
      yield* db
        .update(WorkspaceProvisionerTable)
        .set({ setup_state: "running", state: "provisioning" })
        .where(eq(WorkspaceProvisionerTable.id, lease.id))
        .run()
        .pipe(Effect.orDie)
      const ambiguous = yield* service.provision(lease).pipe(Effect.flip)
      expect(ambiguous).toBeInstanceOf(WorkspaceProvisioner.SetupAmbiguousError)
      expect(
        yield* db
          .select({ setup: WorkspaceProvisionerTable.setup_state })
          .from(WorkspaceProvisionerTable)
          .where(eq(WorkspaceProvisionerTable.id, lease.id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ setup: "ambiguous" })
      yield* service.reconcileSetup(lease, "completed")
      expect((yield* service.provision(lease)).location).toEqual(lease.location)
      const target = yield* fixture.git.repo.discover(lease.location.directory)
      if (!target) throw new Error("Provisioned worktree not found")
      yield* db
        .update(WorkspaceProvisionerTable)
        .set({ state: "cleaning" })
        .where(eq(WorkspaceProvisionerTable.id, lease.id))
        .run()
        .pipe(Effect.orDie)
      yield* fixture.git.worktree.remove({ repository: target, directory: lease.location.directory, force: false })
      yield* service.cleanup(lease)
      expect(yield* Effect.promise(() => Bun.file(lease.location.directory).exists())).toBe(false)
    }),
  )

  it.live("reruns ambiguous setup only after explicit retry", () =>
    Effect.gen(function* () {
      const fixture = yield* setup('printf setup >> "$(git rev-parse --git-dir)/setup.log"')
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "retry-setup",
        inputKey: "RETRY-SETUP",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })
      const { db } = yield* Database.Service
      yield* db.update(WorkspaceProvisionerTable).set({ state: "provisioning", setup_state: "ambiguous" })
        .where(eq(WorkspaceProvisionerTable.id, lease.id)).run().pipe(Effect.orDie)
      if (!lease.branch || !lease.baseRevision) throw new Error("Incomplete worktree lease")
      yield* fixture.git.worktree.create({
        repository: fixture.repository,
        directory: lease.location.directory,
        branch: lease.branch,
        revision: lease.baseRevision,
      })
      expect(yield* service.provision(lease).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.SetupAmbiguousError)
      yield* service.reconcileSetup(lease, "retry")
      yield* service.provision(lease)
      const target = yield* fixture.git.repo.discover(lease.location.directory)
      if (!target) throw new Error("Provisioned worktree not found")
      expect(yield* Effect.promise(() => Bun.file(path.join(target.gitDirectory, "setup.log")).text())).toBe("setup")
    }),
  )

  it.live("rejects ready checkouts that become dirty or move from their owned revision", () =>
    Effect.gen(function* () {
      const currentFixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const current = yield* service.reserve({
        ownerID: "ready-current",
        inputKey: "READY-CURRENT",
        project: {
          id: currentFixture.projectID,
          directory: currentFixture.directory,
          vcs: "git",
          sourceCommonDirectory: currentFixture.repository.commonDirectory,
          baseRevision: currentFixture.baseRevision,
          sourceBranch: yield* currentFixture.git.history.branch(currentFixture.repository),
        },
        strategy: { type: "current" },
      })
      yield* service.provision(current)
      yield* Effect.promise(() => Bun.write(path.join(current.location.directory, "dirty.txt"), "dirty"))
      expect(yield* service.provision(current).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.NotReadyError)

      const branchFixture = yield* setup()
      const branch = yield* service.reserve({
        ownerID: "ready-branch",
        inputKey: "READY-BRANCH",
        project: {
          id: branchFixture.projectID,
          directory: branchFixture.directory,
          vcs: "git",
          sourceCommonDirectory: branchFixture.repository.commonDirectory,
          baseRevision: branchFixture.baseRevision,
          sourceBranch: yield* branchFixture.git.history.branch(branchFixture.repository),
        },
        strategy: { type: "branch", pattern: "ready/{{issue.key}}" },
      })
      yield* service.provision(branch)
      yield* Effect.promise(async () => {
        await Bun.write(path.join(branch.location.directory, "committed.txt"), "moved")
        await $`git add .`.cwd(branch.location.directory).quiet()
        await $`git commit -m moved`.cwd(branch.location.directory).quiet()
      })
      expect(yield* service.provision(branch).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.NotReadyError)

      const worktreeFixture = yield* setup()
      const worktree = yield* service.reserve({
        ownerID: "ready-worktree",
        inputKey: "READY-WORKTREE",
        project: {
          id: worktreeFixture.projectID,
          directory: worktreeFixture.directory,
          vcs: "git",
          sourceCommonDirectory: worktreeFixture.repository.commonDirectory,
          baseRevision: worktreeFixture.baseRevision,
          sourceBranch: yield* worktreeFixture.git.history.branch(worktreeFixture.repository),
        },
        strategy: { type: "worktree" },
      })
      yield* service.provision(worktree)
      yield* Effect.promise(async () => {
        await Bun.write(path.join(worktree.location.directory, "committed.txt"), "moved")
        await $`git add .`.cwd(worktree.location.directory).quiet()
        await $`git commit -m moved`.cwd(worktree.location.directory).quiet()
      })
      expect(yield* service.provision(worktree).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.NotReadyError)
    }),
  )

  it.live("refuses cleanup for diverged branches and replacement repositories", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "diverged",
        inputKey: "DIVERGED",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })
      yield* service.provision(lease)
      yield* Effect.promise(async () => {
        await Bun.write(path.join(lease.location.directory, "change.txt"), "change")
        await $`git add .`.cwd(lease.location.directory).quiet()
        await $`git commit -m diverged`.cwd(lease.location.directory).quiet()
      })
      expect(yield* service.cleanup(lease).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.OwnershipError)
      expect(yield* Effect.promise(() => fs.stat(lease.location.directory).then(() => true, () => false))).toBe(true)

      const replacementLease = yield* service.reserve({
        ownerID: "replacement",
        inputKey: "REPLACEMENT",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "worktree" },
      })
      yield* service.provision(replacementLease)
      yield* Effect.promise(async () => {
        await fs.rm(replacementLease.location.directory, { recursive: true })
        await fs.mkdir(replacementLease.location.directory, { recursive: true })
        await $`git init`.cwd(replacementLease.location.directory).quiet()
      })
      expect(yield* service.cleanup(replacementLease).pipe(Effect.flip)).toBeInstanceOf(
        WorkspaceProvisioner.OwnershipError,
      )
      expect(yield* Effect.promise(() => fs.stat(replacementLease.location.directory).then(() => true, () => false))).toBe(true)
    }),
  )

  it.live("retains lease ownership records when a project is deleted", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const lease = yield* service.reserve({
        ownerID: "retained",
        inputKey: "RETAINED",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git",
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "current" },
      })
      const { db } = yield* Database.Service
      yield* db.delete(ProjectTable).where(eq(ProjectTable.id, fixture.projectID)).run().pipe(Effect.orDie)
      expect(
        yield* db
          .select({ id: WorkspaceProvisionerTable.id })
          .from(WorkspaceProvisionerTable)
          .where(eq(WorkspaceProvisionerTable.id, lease.id))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ id: lease.id })
    }),
  )

  it.live("reserves without filesystem access and reports cleaned reacquisition conflicts", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const service = yield* WorkspaceProvisioner.Service
      const firstInput = {
        ownerID: "first-owner",
        inputKey: "FIRST-1",
        project: {
          id: fixture.projectID,
          directory: fixture.directory,
          vcs: "git" as const,
          sourceCommonDirectory: fixture.repository.commonDirectory,
          baseRevision: fixture.baseRevision,
          sourceBranch: yield* fixture.git.history.branch(fixture.repository),
        },
        strategy: { type: "current" as const },
      }
      const first = yield* service.reserve(firstInput)
      yield* service.cleanup(first)
      const second = yield* service.reserve({ ...firstInput, ownerID: "second-owner", inputKey: "SECOND-2" })

      expect(yield* service.reserve(firstInput).pipe(Effect.flip)).toBeInstanceOf(WorkspaceProvisioner.CollisionError)
      yield* service.cleanup(second)

      yield* Effect.promise(() => fs.rm(fixture.directory, { recursive: true }))
      expect((yield* service.reserve(firstInput)).id).toBe(first.id)
    }),
  )

  it.live("supports non-Git current projects and rejects Git-only strategies", () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
      )
      const directory = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(root.path)))
      const projectID = Project.ID.make("non-git-project")
      const { db } = yield* Database.Service
      yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run().pipe(Effect.orDie)
      const service = yield* WorkspaceProvisioner.Service
      const project = { id: projectID, directory }
      const lease = yield* service.reserve({ ownerID: "plain", inputKey: "PLAIN", project, strategy: { type: "current" } })
      expect((yield* service.provision(lease)).location.directory).toBe(directory)
      for (const strategy of [{ type: "branch" as const, pattern: "issues/{{issue.key}}" }, { type: "worktree" as const }])
        expect(
          yield* service.reserve({ ownerID: strategy.type, inputKey: strategy.type, project, strategy }).pipe(Effect.flip),
        ).toBeInstanceOf(WorkspaceProvisioner.InvalidRequestError)
    }),
  )
})
