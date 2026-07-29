export * as IssueMatch from "./issue-match"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { Integration } from "./integration"
import { Issue } from "./issue"
import { IssueWatcher } from "./issue-watcher"
import { Location } from "./location"
import { Project } from "./project"
import { DateTimeUtcFromMillis, NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export const ID = Schema.String.check(Schema.isStartsWith("imt_")).pipe(
  Schema.brand("IssueMatch.ID"),
  statics((schema) => ({ create: () => schema.make("imt_" + ascending()) })),
)
export type ID = typeof ID.Type

export const ObservationID = Schema.String.check(Schema.isStartsWith("imo_")).pipe(
  Schema.brand("IssueMatch.ObservationID"),
  statics((schema) => ({ create: () => schema.make("imo_" + ascending()) })),
)
export type ObservationID = typeof ObservationID.Type

export const SessionLinkID = Schema.String.check(Schema.isStartsWith("ims_")).pipe(
  Schema.brand("IssueMatch.SessionLinkID"),
  statics((schema) => ({ create: () => schema.make("ims_" + ascending()) })),
)
export type SessionLinkID = typeof SessionLinkID.Type

export const MaterializationID = Schema.String.check(Schema.isStartsWith("imz_")).pipe(
  Schema.brand("IssueMatch.MaterializationID"),
  statics((schema) => ({ create: () => schema.make("imz_" + ascending()) })),
)
export type MaterializationID = typeof MaterializationID.Type

export const WritebackOperationID = Schema.String.check(Schema.isStartsWith("iwo_")).pipe(
  Schema.brand("IssueMatch.WritebackOperationID"),
  statics((schema) => ({ create: () => schema.make("iwo_" + ascending()) })),
)
export type WritebackOperationID = typeof WritebackOperationID.Type

const WatcherID = Schema.suspend(() => IssueWatcher.ID)

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  watcherID: WatcherID,
  integrationID: Integration.ID,
  connectionID: Schema.suspend(() => IssueWatcher.ConnectionID),
  externalID: Schema.String,
  externalKey: Schema.String,
  externalUrl: Schema.String,
  fingerprint: Schema.String,
  externalUpdatedAt: DateTimeUtcFromMillis,
  state: Schema.Literals(["pending", "skipped", "dismissed", "duplicate", "unrouted"]),
  projectID: optional(Project.ID),
  routeReason: optional(Schema.String),
  payload: Issue.Info,
  error: optional(Schema.String),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.Info" })

export interface Observation extends Schema.Schema.Type<typeof Observation> {}
export const Observation = Schema.Struct({
  id: ObservationID,
  matchID: ID,
  runID: Schema.suspend(() => IssueWatcher.RunID),
  fingerprint: Schema.String,
  externalUpdatedAt: DateTimeUtcFromMillis,
  payload: Issue.Info,
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.Observation" })

export interface SessionLink extends Schema.Schema.Type<typeof SessionLink> {}
export const SessionLink = Schema.Struct({
  id: SessionLinkID,
  matchID: ID,
  sessionID: SessionID,
  isPrimary: Schema.Boolean,
  reason: Schema.Literals(["materialized", "continued", "duplicate_override"]),
  deletedAt: optional(DateTimeUtcFromMillis),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.SessionLink" })

export interface SessionClaim extends Schema.Schema.Type<typeof SessionClaim> {}
export const SessionClaim = Schema.Struct({
  connectionID: Schema.suspend(() => IssueWatcher.ConnectionID),
  externalID: Schema.String,
  primarySessionID: optional(SessionID),
  materializationID: MaterializationID,
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.SessionClaim" })

export interface Materialization extends Schema.Schema.Type<typeof Materialization> {}
export const Materialization = Schema.Struct({
  id: MaterializationID,
  matchID: ID,
  mode: Schema.Literals(["awaiting_run", "run"]),
  projectID: Project.ID,
  workspace: Schema.suspend(() => IssueWatcher.Workspace),
  resolvedLocation: optional(Location.Ref),
  workspaceLease: optional(Schema.Json),
  baselineObservationID: ObservationID,
  state: Schema.Literals([
    "pending",
    "provisioning",
    "session_created",
    "prompt_admitted",
    "scheduled",
    "handoff_unknown",
    "completed",
    "failed",
    "cancelled",
  ]),
  sessionID: SessionID,
  messageID: SessionMessage.ID,
  executionAttemptID: optional(Schema.String),
  providerStarted: Schema.Boolean,
  attempts: NonNegativeInt,
  error: optional(Schema.String),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.Materialization" })

export interface WritebackOperation extends Schema.Schema.Type<typeof WritebackOperation> {}
export const WritebackOperation = Schema.Struct({
  id: WritebackOperationID,
  sessionID: SessionID,
  kind: Schema.Literals(["comment_created", "transition_started", "comment_failed"]),
  triggerID: Schema.String,
  request: Schema.Json,
  state: Schema.Literals(["pending", "applying", "applied", "unknown", "failed"]),
  providerResultID: optional(Schema.String),
  attempts: NonNegativeInt,
  error: optional(Schema.String),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "IssueMatch.WritebackOperation" })
