export * as WorkspaceProvisioner from "./workspace-provisioner"

import { Schema } from "effect"
import { Location } from "./location"
import { Project } from "./project"
import { AbsolutePath, optional } from "./schema"

export const LeaseID = Schema.String.check(Schema.isStartsWith("wpl_")).pipe(
  Schema.brand("WorkspaceProvisioner.LeaseID"),
)
export type LeaseID = typeof LeaseID.Type

export const Strategy = Schema.Union([
  Schema.Struct({ type: Schema.Literal("branch"), pattern: Schema.String }),
  Schema.Struct({ type: Schema.Literal("current") }),
  Schema.Struct({ type: Schema.Literal("worktree") }),
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "WorkspaceProvisioner.Strategy" })
export type Strategy = typeof Strategy.Type

export interface ResolvedProject extends Schema.Schema.Type<typeof ResolvedProject> {}
export const ResolvedProject = Schema.Struct({
  id: Project.ID,
  directory: AbsolutePath,
  vcs: optional(Project.Vcs),
  sourceCommonDirectory: optional(AbsolutePath),
  baseRevision: optional(Schema.String),
  sourceBranch: optional(Schema.String),
  sourceDetached: optional(Schema.Boolean),
}).annotate({ identifier: "WorkspaceProvisioner.ResolvedProject" })

export interface ReserveInput extends Schema.Schema.Type<typeof ReserveInput> {}
export const ReserveInput = Schema.Struct({
  ownerID: Schema.String,
  inputKey: Schema.String,
  project: ResolvedProject,
  strategy: Strategy,
}).annotate({ identifier: "WorkspaceProvisioner.ReserveInput" })

export interface Lease extends Schema.Schema.Type<typeof Lease> {}
export const Lease = Schema.Struct({
  id: LeaseID,
  ownerID: Schema.String,
  inputKey: Schema.String,
  projectID: Project.ID,
  strategy: Strategy,
  sourceDirectory: AbsolutePath,
  sourceCommonDirectory: optional(AbsolutePath),
  location: Location.Ref,
  ownership: Schema.Literals(["borrowed", "branch", "worktree"]),
  baseRevision: optional(Schema.String),
  sourceBranch: optional(Schema.String),
  sourceDetached: optional(Schema.Boolean),
  branch: optional(Schema.String),
  cleanupToken: optional(Schema.String),
  setupCommand: optional(Schema.String),
}).annotate({ identifier: "WorkspaceProvisioner.Lease" })

export interface Result extends Schema.Schema.Type<typeof Result> {}
export const Result = Schema.Struct({
  lease: Lease,
  location: Location.Ref,
}).annotate({ identifier: "WorkspaceProvisioner.Result" })
