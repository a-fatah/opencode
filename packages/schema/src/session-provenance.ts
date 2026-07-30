export * as SessionProvenance from "./session-provenance"

import { Schema } from "effect"
import { Integration } from "./integration"
import { Issue } from "./issue"
import { IssueMatch } from "./issue-match"
import { IssueWatcher } from "./issue-watcher"
import { Location } from "./location"
import { DateTimeUtcFromMillis, optional } from "./schema"
import { SessionID } from "./session-id"
import { SessionExecutionAttempt } from "./session-execution-attempt"

export interface IssueRef extends Schema.Schema.Type<typeof IssueRef> {}
export const IssueRef = Schema.Struct({
  type: Schema.Literal("issue"),
  integrationID: Integration.ID,
  externalKey: Schema.String,
  externalUrl: Schema.String,
  watcherID: optional(Schema.suspend(() => IssueWatcher.ID)),
  watcherName: Schema.String,
  branch: optional(Schema.String),
}).annotate({ identifier: "SessionProvenance.IssueRef" })

export const Ref = Schema.Union([IssueRef])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "SessionProvenance.Ref" })
export type Ref = typeof Ref.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  sessionID: SessionID,
  kind: Schema.Literal("issue"),
  watcherID: optional(Schema.suspend(() => IssueWatcher.ID)),
  matchID: optional(Schema.suspend(() => IssueMatch.ID)),
  integrationID: Integration.ID,
  connectionID: Schema.suspend(() => IssueWatcher.ConnectionID),
  externalKey: Schema.String,
  externalUrl: Schema.String,
  watcherName: Schema.String,
  branch: optional(Schema.String),
  writeback: IssueWatcher.WritebackPlan,
  lastSyncedAt: optional(DateTimeUtcFromMillis),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "SessionProvenance.Info" })

export interface SourceSnapshot extends Schema.Schema.Type<typeof SourceSnapshot> {}
export const SourceSnapshot = Schema.Struct({
  integrationID: Integration.ID,
  name: Schema.String,
  glyph: Schema.String,
}).annotate({ identifier: "SessionProvenance.SourceSnapshot" })

export interface WatcherSnapshot extends Schema.Schema.Type<typeof WatcherSnapshot> {}
export const WatcherSnapshot = Schema.Struct({
  id: optional(Schema.suspend(() => IssueWatcher.ID)),
  name: Schema.String,
}).annotate({ identifier: "SessionProvenance.WatcherSnapshot" })

export interface Detail extends Schema.Schema.Type<typeof Detail> {}
export const Detail = Schema.Struct({
  provenance: Info,
  issue: Issue.Info,
  source: SourceSnapshot,
  watcher: WatcherSnapshot,
  branch: optional(Schema.String),
  workspace: optional(Location.Ref),
  sessions: Schema.Array(IssueMatch.SessionLink),
  materialization: optional(IssueMatch.Materialization),
  latestExecution: optional(SessionExecutionAttempt.Info),
  writebacks: Schema.Array(IssueMatch.WritebackOperation),
  lastSyncedAt: optional(DateTimeUtcFromMillis),
}).annotate({ identifier: "SessionProvenance.Detail" })
