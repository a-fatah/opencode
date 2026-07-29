export * as SessionProvenance from "./session-provenance"

import { Schema } from "effect"
import { Integration } from "./integration"
import { IssueMatch } from "./issue-match"
import { IssueWatcher } from "./issue-watcher"
import { DateTimeUtcFromMillis, optional } from "./schema"
import { SessionID } from "./session-id"

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
  lastSyncedAt: optional(DateTimeUtcFromMillis),
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis,
}).annotate({ identifier: "SessionProvenance.Info" })
