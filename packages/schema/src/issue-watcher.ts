export * as IssueWatcher from "./issue-watcher"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { ascending } from "./identifier"
import { Integration } from "./integration"
import { Credential } from "./credential"
import { IssueMatch } from "./issue-match"
import { Issue } from "./issue"
import { Project } from "./project"
import { DateTimeUtcFromMillis, NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"

export const ID = Schema.String.check(Schema.isStartsWith("iwt_")).pipe(
  Schema.brand("IssueWatcher.ID"),
  statics((schema) => ({ create: () => schema.make("iwt_" + ascending()) })),
)
export type ID = typeof ID.Type

export const RunID = Schema.String.check(Schema.isStartsWith("iwr_")).pipe(
  Schema.brand("IssueWatcher.RunID"),
  statics((schema) => ({ create: () => schema.make("iwr_" + ascending()) })),
)
export type RunID = typeof RunID.Type

export const ConnectionID = Credential.ConnectionID
export type ConnectionID = typeof ConnectionID.Type

export const Assignee = Schema.Union([
  Schema.Literal("me"),
  Schema.Struct({ id: Schema.String }),
]).annotate({ identifier: "IssueWatcher.Assignee" })
export type Assignee = typeof Assignee.Type

export interface Escape extends Schema.Schema.Type<typeof Escape> {}
export const Escape = Schema.Struct({
  language: Schema.Literals(["jql", "linear-filter", "github-search"]),
  query: Schema.String,
}).annotate({ identifier: "IssueWatcher.Escape" })

export interface Criteria extends Schema.Schema.Type<typeof Criteria> {}
export const Criteria = Schema.Struct({
  issueProjects: Schema.Array(Schema.String),
  assignee: optional(Assignee),
  labels: optional(Schema.Array(Schema.String)),
  statuses: optional(Schema.Array(Schema.String)),
  watchUpdates: Schema.Boolean,
  escape: optional(Escape),
}).annotate({ identifier: "IssueWatcher.Criteria" })

export interface MappingKey extends Schema.Schema.Type<typeof MappingKey> {}
export const MappingKey = Schema.Struct({
  type: Schema.Literals(["label", "component", "issueProject"]),
  value: Schema.String,
}).annotate({ identifier: "IssueWatcher.MappingKey" })

export interface Mapping extends Schema.Schema.Type<typeof Mapping> {}
export const Mapping = Schema.Struct({
  key: MappingKey,
  projectID: Project.ID,
}).annotate({ identifier: "IssueWatcher.Mapping" })

export const Workspace = Schema.Union([
  Schema.Struct({ type: Schema.Literal("branch"), pattern: Schema.String }),
  Schema.Struct({ type: Schema.Literal("current") }),
  Schema.Struct({ type: Schema.Literal("worktree") }),
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "IssueWatcher.Workspace" })
export type Workspace = typeof Workspace.Type

export interface Routing extends Schema.Schema.Type<typeof Routing> {}
export const Routing = Schema.Struct({
  repoField: optional(Schema.Struct({ fieldName: Schema.String })),
  mappings: Schema.Array(Mapping),
  fallback: Schema.Literal("inbox"),
  workspace: Workspace,
}).annotate({ identifier: "IssueWatcher.Routing" })

export interface Writeback extends Schema.Schema.Type<typeof Writeback> {}
export const Writeback = Schema.Struct({
  comment: Schema.Boolean,
  transitionOnStart: optional(Schema.String),
  commentOnFailure: Schema.Boolean,
}).annotate({ identifier: "IssueWatcher.Writeback" })

export interface Action extends Schema.Schema.Type<typeof Action> {}
export const Action = Schema.Struct({
  mode: Schema.Literals(["inbox", "awaiting_run", "run"]),
  promptTemplate: Schema.String,
  writeback: Writeback,
}).annotate({ identifier: "IssueWatcher.Action" })

export interface ProjectRemote extends Schema.Schema.Type<typeof ProjectRemote> {}
export const ProjectRemote = Schema.Struct({
  host: Schema.String,
  path: Schema.String,
  label: Schema.String,
}).annotate({ identifier: "IssueWatcher.ProjectRemote" })

export interface ProjectRoutingSnapshot extends Schema.Schema.Type<typeof ProjectRoutingSnapshot> {}
export const ProjectRoutingSnapshot = Schema.Struct({
  projectID: Project.ID,
  name: Schema.String,
  directories: Schema.Array(Schema.String),
  remotes: Schema.Array(ProjectRemote),
}).annotate({ identifier: "IssueWatcher.ProjectRoutingSnapshot" })

export const Route = Schema.Union([
  Schema.Struct({ projectID: Project.ID, reason: Schema.String }),
  Schema.Struct({ unrouted: Schema.Literal(true), reason: Schema.String, suggestion: optional(Project.ID) }),
]).annotate({ identifier: "IssueWatcher.Route" })
export type Route = typeof Route.Type

export interface WritebackPlan extends Schema.Schema.Type<typeof WritebackPlan> {}
export const WritebackPlan = Schema.Struct({
  comment: optional(Schema.String),
  transitionOnStart: optional(Schema.String),
  commentOnFailure: optional(Schema.String),
}).annotate({ identifier: "IssueWatcher.WritebackPlan" })

export interface PreviewInput extends Schema.Schema.Type<typeof PreviewInput> {}
export const PreviewInput = Schema.Struct({
  integrationID: Integration.ID,
  connectionID: ConnectionID,
  criteria: Criteria,
  routing: Routing,
  action: Action,
}).annotate({ identifier: "IssueWatcher.PreviewInput" })

export interface PreviewMatch extends Schema.Schema.Type<typeof PreviewMatch> {}
export const PreviewMatch = Schema.Struct({
  issue: Issue.Info,
  route: Route,
  prompt: Schema.String,
  writeback: WritebackPlan,
}).annotate({ identifier: "IssueWatcher.PreviewMatch" })

export interface Preview extends Schema.Schema.Type<typeof Preview> {}
export const Preview = Schema.Struct({
  matches: Schema.Array(PreviewMatch),
  truncated: Schema.Boolean,
}).annotate({ identifier: "IssueWatcher.Preview" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  integrationID: Integration.ID,
  connectionID: ConnectionID,
  name: Schema.String,
  enabled: Schema.Boolean,
  projectID: optional(Project.ID),
  criteria: Criteria,
  routing: Routing,
  action: Action,
  cursor: optional(Schema.String),
  lastRunAt: optional(DateTimeUtcFromMillis),
  lastError: optional(Schema.String),
  archivedAt: optional(DateTimeUtcFromMillis),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueWatcher.Info" })

export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  integrationID: Integration.ID,
  connectionID: ConnectionID,
  name: Schema.String,
  enabled: optional(Schema.Boolean),
  projectID: optional(Project.ID),
  criteria: Criteria,
  routing: Routing,
  action: Action,
}).annotate({ identifier: "IssueWatcher.CreateInput" })

export interface UpdateInput extends Schema.Schema.Type<typeof UpdateInput> {}
export const UpdateInput = Schema.Struct({
  name: optional(Schema.String),
  projectID: optional(Project.ID),
  criteria: optional(Criteria),
  routing: optional(Routing),
  action: optional(Action),
}).annotate({ identifier: "IssueWatcher.UpdateInput" })

export interface EnableInput extends Schema.Schema.Type<typeof EnableInput> {}
export const EnableInput = Schema.Struct({ enabled: Schema.Boolean }).annotate({
  identifier: "IssueWatcher.EnableInput",
})

export interface Run extends Schema.Schema.Type<typeof Run> {}
export const Run = Schema.Struct({
  id: RunID,
  watcherID: ID,
  startedAt: DateTimeUtcFromMillis,
  finishedAt: optional(DateTimeUtcFromMillis),
  outcome: Schema.Literals(["ok", "throttled", "auth_failed", "error"]),
  scanned: NonNegativeInt,
  matched: NonNegativeInt,
  created: NonNegativeInt,
  queued: NonNegativeInt,
  unrouted: NonNegativeInt,
  skipped: NonNegativeInt,
  failed: NonNegativeInt,
  cursor: optional(Schema.String),
  error: optional(Schema.String),
}).annotate({ identifier: "IssueWatcher.Run" })

export interface Ignore extends Schema.Schema.Type<typeof Ignore> {}
export const Ignore = Schema.Struct({
  watcherID: ID,
  externalID: Schema.String,
  reason: optional(Schema.String),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueWatcher.Ignore" })

export interface InboxSummary extends Schema.Schema.Type<typeof InboxSummary> {}
export const InboxSummary = Schema.Struct({
  pending: NonNegativeInt,
  unrouted: NonNegativeInt,
  duplicate: NonNegativeInt,
  failedMaterializations: NonNegativeInt,
  sessionsOpenedThisWeek: NonNegativeInt,
  failedRuns: NonNegativeInt,
}).annotate({ identifier: "IssueWatcher.InboxSummary" })

export interface OwnerStatus extends Schema.Schema.Type<typeof OwnerStatus> {}
export const OwnerStatus = Schema.Struct({
  status: Schema.Literals(["active", "owner_conflict", "disabled"]),
  detail: optional(Schema.String),
}).annotate({ identifier: "IssueWatcher.OwnerStatus" })

export interface ConnectionSummary extends Schema.Schema.Type<typeof ConnectionSummary> {}
export const ConnectionSummary = Schema.Struct({
  id: ConnectionID,
  label: Schema.String,
  tenantIdentity: Schema.String,
  inputs: Integration.Inputs,
  verification: Credential.Verification,
}).annotate({ identifier: "IssueWatcher.ConnectionSummary" })

export interface IntegrationSummary extends Schema.Schema.Type<typeof IntegrationSummary> {}
export const IntegrationSummary = Schema.Struct({
  integration: Integration.Info,
  connection: optional(ConnectionSummary),
  watcherCount: NonNegativeInt,
  lastPollAt: optional(DateTimeUtcFromMillis),
  owner: OwnerStatus,
}).annotate({ identifier: "IssueWatcher.IntegrationSummary" })

export interface VerificationInput extends Schema.Schema.Type<typeof VerificationInput> {}
export const VerificationInput = Schema.Struct({
  key: optional(Schema.String),
  inputs: Integration.Inputs,
  useSavedConnection: optional(Schema.Boolean),
}).annotate({ identifier: "IssueWatcher.VerificationInput" })

export interface VerificationResult extends Schema.Schema.Type<typeof VerificationResult> {}
export const VerificationResult = Schema.Struct({
  ok: Schema.Boolean,
  detail: Schema.String,
}).annotate({ identifier: "IssueWatcher.VerificationResult" })

export interface ConnectionCreateInput extends Schema.Schema.Type<typeof ConnectionCreateInput> {}
export const ConnectionCreateInput = Schema.Struct({
  key: Schema.String,
  inputs: Integration.Inputs,
  label: optional(Schema.String),
}).annotate({ identifier: "IssueWatcher.ConnectionCreateInput" })

export interface ConnectionRotateInput extends Schema.Schema.Type<typeof ConnectionRotateInput> {}
export const ConnectionRotateInput = Schema.Struct({
  key: optional(Schema.String),
  inputs: Integration.Inputs,
  label: optional(Schema.String),
}).annotate({ identifier: "IssueWatcher.ConnectionRotateInput" })

export interface SettingsInput extends Schema.Schema.Type<typeof SettingsInput> {}
export const SettingsInput = Schema.Struct({
  pollInterval: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
  concurrentRuns: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThan(0))),
  retryFailedRuns: Schema.Literals(["never", "once"]),
}).annotate({ identifier: "IssueWatcher.SettingsInput" })

export interface Settings extends Schema.Schema.Type<typeof Settings> {}
export const Settings = Schema.Struct({
  ...SettingsInput.fields,
  owner: OwnerStatus,
}).annotate({ identifier: "IssueWatcher.Settings" })

const Updated = define({ type: "issue_watcher.updated", schema: { watcher: Info } })
const RunCompleted = define({ type: "issue_watcher.run.completed", schema: { run: Run } })
const MatchCreated = define({ type: "issue_match.created", schema: { match: Schema.suspend(() => IssueMatch.Info) } })
const MatchUpdated = define({ type: "issue_match.updated", schema: { match: Schema.suspend(() => IssueMatch.Info) } })
const InboxChanged = define({ type: "issue_watcher.inbox.changed", schema: InboxSummary.fields })
const SessionMaterialized = define({
  type: "issue_watcher.session.materialized",
  durable: { aggregate: "materializationID", version: 1 },
  schema: {
    materializationID: Schema.suspend(() => IssueMatch.MaterializationID),
    matchID: Schema.suspend(() => IssueMatch.ID),
    sessionID: SessionID,
  },
})
const DurableDefinitions = inventory(SessionMaterialized)
const Definitions = inventory(
  Updated,
  RunCompleted,
  MatchCreated,
  MatchUpdated,
  InboxChanged,
  SessionMaterialized,
)
export const Event = {
  Updated,
  RunCompleted,
  MatchCreated,
  MatchUpdated,
  InboxChanged,
  SessionMaterialized,
  DurableDefinitions,
  Definitions,
}
