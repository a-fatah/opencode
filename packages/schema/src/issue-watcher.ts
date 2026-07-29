export * as IssueWatcher from "./issue-watcher"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { ascending } from "./identifier"
import { Integration } from "./integration"
import { IssueMatch } from "./issue-match"
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

export const ConnectionID = Schema.String.pipe(Schema.brand("IssueWatcher.ConnectionID"))
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
