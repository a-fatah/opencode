export * as SessionExecutionAttempt from "./session-execution-attempt"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { DateTimeUtcFromMillis, optional, statics } from "./schema"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export const ID = Schema.String.check(Schema.isStartsWith("sea_")).pipe(
  Schema.brand("SessionExecutionAttempt.ID"),
  statics((schema) => ({ create: () => schema.make("sea_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Status = Schema.Literals([
  "scheduled",
  "running",
  "completed",
  "failed",
  "interrupted",
  "superseded",
  "handoff_unknown",
]).annotate({ identifier: "SessionExecutionAttempt.Status" })
export type Status = typeof Status.Type

export interface Failure extends Schema.Schema.Type<typeof Failure> {}
export const Failure = Schema.Struct({
  type: Schema.String,
  message: Schema.String,
  retryable: optional(Schema.Boolean),
}).annotate({ identifier: "SessionExecutionAttempt.Failure" })

export interface Interruption extends Schema.Schema.Type<typeof Interruption> {}
export const Interruption = Schema.Struct({
  reason: Schema.Literals(["user", "shutdown", "superseded"]),
  detail: optional(Schema.String),
}).annotate({ identifier: "SessionExecutionAttempt.Interruption" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  messageID: SessionMessage.ID,
  ownerEpoch: Schema.String,
  status: Status,
  supersededByAttemptID: optional(ID),
  failure: optional(Failure),
  interruption: optional(Interruption),
  timeScheduled: DateTimeUtcFromMillis,
  timeStarted: optional(DateTimeUtcFromMillis),
  timeCompleted: optional(DateTimeUtcFromMillis),
}).annotate({ identifier: "SessionExecutionAttempt.Info" })
