export * as SessionInput from "./session-input"

import { Schema } from "effect"
import { optional } from "./schema"
import { Prompt } from "./prompt"
import { DateTimeUtcFromMillis, NonNegativeInt } from "./schema"
import { SessionDelivery } from "./session-delivery"
import { SessionExecutionAttempt } from "./session-execution-attempt"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"

export const Delivery = SessionDelivery.Delivery
export type Delivery = SessionDelivery.Delivery

export interface Admitted extends Schema.Schema.Type<typeof Admitted> {}
export const Admitted = Schema.Struct({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: SessionID,
  prompt: Prompt,
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: NonNegativeInt.pipe(optional),
  timeUpdated: DateTimeUtcFromMillis.pipe(optional),
  cancelledAt: DateTimeUtcFromMillis.pipe(optional),
  claimedAttemptID: SessionExecutionAttempt.ID.pipe(optional),
}).annotate({ identifier: "SessionInput.Admitted" })

export interface Pending extends Schema.Schema.Type<typeof Pending> {}
export const Pending = Schema.Struct({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: SessionID,
  prompt: Prompt,
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  timeUpdated: DateTimeUtcFromMillis.pipe(optional),
}).annotate({ identifier: "SessionInput.Pending" })

export interface ReplaceInput extends Schema.Schema.Type<typeof ReplaceInput> {}
export const ReplaceInput = Schema.Struct({ prompt: Prompt }).annotate({ identifier: "SessionInput.ReplaceInput" })

export interface ResumeInput extends Schema.Schema.Type<typeof ResumeInput> {}
export const ResumeInput = Schema.Struct({
  expectedMessageID: SessionMessage.ID,
  attemptID: SessionExecutionAttempt.ID.pipe(optional),
}).annotate({ identifier: "SessionInput.ResumeInput" })

export interface ResumeResult extends Schema.Schema.Type<typeof ResumeResult> {}
export const ResumeResult = Schema.Struct({ attemptID: SessionExecutionAttempt.ID }).annotate({
  identifier: "SessionInput.ResumeResult",
})

export interface ConfirmHandoffInput extends Schema.Schema.Type<typeof ConfirmHandoffInput> {}
export const ConfirmHandoffInput = Schema.Struct({
  attemptID: SessionExecutionAttempt.ID,
  newAttemptID: SessionExecutionAttempt.ID,
}).annotate({ identifier: "SessionInput.ConfirmHandoffInput" })

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>("SessionInputNotFoundError")(
  "SessionInput.NotFoundError",
  {
    sessionID: SessionID,
    messageID: SessionMessage.ID,
  },
) {}

export class LifecycleConflictError extends Schema.TaggedErrorClass<LifecycleConflictError>(
  "SessionInputLifecycleConflictError",
)(
  "SessionInput.LifecycleConflictError",
  {
    sessionID: SessionID,
    messageID: SessionMessage.ID,
    state: Schema.Literals(["promoted", "cancelled", "claimed"]),
  },
) {}

export class PendingConflictError extends Schema.TaggedErrorClass<PendingConflictError>("SessionInputPendingConflictError")(
  "SessionInput.PendingConflictError",
  {
    sessionID: SessionID,
    expectedMessageID: SessionMessage.ID,
    pendingMessageIDs: Schema.Array(SessionMessage.ID),
  },
) {}

export class AttemptConflictError extends Schema.TaggedErrorClass<AttemptConflictError>("SessionInputAttemptConflictError")(
  "SessionInput.AttemptConflictError",
  {
    sessionID: SessionID,
    messageID: SessionMessage.ID,
    attemptID: SessionExecutionAttempt.ID,
  },
) {}
