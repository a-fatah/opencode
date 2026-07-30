export * as SessionExecutionAttempt from "./execution-attempt"

import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { DateTime, Effect } from "effect"
import { SessionExecutionAttempt } from "@opencode-ai/schema/session-execution-attempt"
import type { Database } from "../database/database"
import type { EventV2 } from "../event"
import { SessionEvent } from "./event"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionExecutionAttemptTable } from "./sql"

type DatabaseService = Database.Interface["db"]

export const ID = SessionExecutionAttempt.ID
export type ID = SessionExecutionAttempt.ID
export const Info = SessionExecutionAttempt.Info
export type Info = SessionExecutionAttempt.Info
export const Interruption = SessionExecutionAttempt.Interruption
export type Interruption = SessionExecutionAttempt.Interruption

const fromRow = (row: typeof SessionExecutionAttemptTable.$inferSelect) =>
  SessionExecutionAttempt.Info.make({
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
    ownerEpoch: row.owner_epoch,
    status: row.status,
    timeScheduled: DateTime.makeUnsafe(row.scheduled_at),
    ...(row.started_at === null ? {} : { timeStarted: DateTime.makeUnsafe(row.started_at) }),
    ...(row.completed_at === null ? {} : { timeCompleted: DateTime.makeUnsafe(row.completed_at) }),
    ...(row.superseded_by_attempt_id === null ? {} : { supersededByAttemptID: row.superseded_by_attempt_id }),
    ...(row.failure === null ? {} : { failure: row.failure }),
    ...(row.interruption === null ? {} : { interruption: row.interruption }),
  })

export const find = Effect.fn("SessionExecutionAttempt.find")(function* (db: DatabaseService, id: ID) {
  const row = yield* db
    .select()
    .from(SessionExecutionAttemptTable)
    .where(eq(SessionExecutionAttemptTable.id, id))
    .get()
    .pipe(Effect.orDie)
  return row ? fromRow(row) : undefined
})

export const supersededBy = Effect.fn("SessionExecutionAttempt.supersededBy")(function* (db: DatabaseService, id: ID) {
  const row = yield* db
    .select({ id: SessionExecutionAttemptTable.superseded_by_attempt_id })
    .from(SessionExecutionAttemptTable)
    .where(eq(SessionExecutionAttemptTable.id, id))
    .get()
    .pipe(Effect.orDie)
  return row?.id ?? undefined
})

export const latestOpen = Effect.fn("SessionExecutionAttempt.latestOpen")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionExecutionAttemptTable)
    .where(
      and(
        eq(SessionExecutionAttemptTable.session_id, sessionID),
        inArray(SessionExecutionAttemptTable.status, ["scheduled", "running", "handoff_unknown"]),
      ),
    )
    .orderBy(desc(SessionExecutionAttemptTable.scheduled_at))
    .get()
    .pipe(Effect.orDie)
  return row ? fromRow(row) : undefined
})

export const classifyOwner = Effect.fn("SessionExecutionAttempt.classifyOwner")(function* (
  db: DatabaseService,
  ownerEpoch: string,
) {
  yield* db
    .update(SessionExecutionAttemptTable)
    .set({ status: "handoff_unknown" })
    .where(
      and(
        inArray(SessionExecutionAttemptTable.status, ["scheduled", "running"]),
        ne(SessionExecutionAttemptTable.owner_epoch, ownerEpoch),
      ),
    )
    .run()
    .pipe(Effect.orDie)
})

export const publish = (
  events: EventV2.Interface,
  definition:
    | typeof SessionEvent.Execution.Started
    | typeof SessionEvent.Execution.Completed
    | typeof SessionEvent.Execution.Failed
    | typeof SessionEvent.Execution.Interrupted,
  attempt: Info,
  detail?: SessionExecutionAttempt.Failure | SessionExecutionAttempt.Interruption,
) =>
  DateTime.now.pipe(
    Effect.flatMap((timestamp) =>
      events.publish(definition, {
        sessionID: attempt.sessionID,
        attemptID: attempt.id,
        messageID: attempt.messageID,
        ownerEpoch: attempt.ownerEpoch,
        timestamp,
      ...(definition === SessionEvent.Execution.Failed ? { failure: detail as SessionExecutionAttempt.Failure } : {}),
        ...(definition === SessionEvent.Execution.Interrupted
          ? { interruption: detail as SessionExecutionAttempt.Interruption }
          : {}),
      }),
    ),
  )

export const projectScheduled = Effect.fn("SessionExecutionAttempt.projectScheduled")(function* (
  db: DatabaseService,
  data: typeof SessionEvent.Execution.Scheduled.Type["data"],
) {
  yield* db
    .insert(SessionExecutionAttemptTable)
    .values({
      id: data.attemptID,
      session_id: data.sessionID,
      message_id: data.messageID,
      owner_epoch: data.ownerEpoch,
      status: "scheduled",
      scheduled_at: DateTime.toEpochMillis(data.timestamp),
    })
    .run()
    .pipe(Effect.orDie)
})

export const projectLifecycle = Effect.fn("SessionExecutionAttempt.projectLifecycle")(function* (
  db: DatabaseService,
  event:
    | typeof SessionEvent.Execution.Started.Type
    | typeof SessionEvent.Execution.Completed.Type
    | typeof SessionEvent.Execution.Failed.Type
    | typeof SessionEvent.Execution.Interrupted.Type
    | typeof SessionEvent.Execution.Superseded.Type,
) {
  const stored = yield* db
    .select()
    .from(SessionExecutionAttemptTable)
    .where(eq(SessionExecutionAttemptTable.id, event.data.attemptID))
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(`Execution attempt not found: ${event.data.attemptID}`)
  if (
    stored.session_id !== event.data.sessionID ||
    stored.message_id !== event.data.messageID ||
    stored.owner_epoch !== event.data.ownerEpoch
  )
    return yield* Effect.die(`Execution attempt identity mismatch: ${event.data.attemptID}`)
  const timestamp = DateTime.toEpochMillis(event.data.timestamp)
  const status =
    event.type === SessionEvent.Execution.Started.type
      ? "running"
      : event.type === SessionEvent.Execution.Completed.type
        ? "completed"
        : event.type === SessionEvent.Execution.Failed.type
          ? "failed"
          : event.type === SessionEvent.Execution.Interrupted.type
            ? "interrupted"
            : "superseded"
  const allowed =
    status === "running"
      ? stored.status === "scheduled"
      : status === "superseded"
        ? stored.status === "handoff_unknown"
        : stored.status === "running"
  if (!allowed)
    return yield* Effect.die(`Illegal execution attempt transition: ${stored.status} -> ${status}`)
  if (
    event.type === SessionEvent.Execution.Superseded.type &&
    event.data.supersededByAttemptID === event.data.attemptID
  )
    return yield* Effect.die(`Execution attempt cannot supersede itself: ${event.data.attemptID}`)
  const updated = yield* db
    .update(SessionExecutionAttemptTable)
    .set({
      status,
      ...(status === "running" ? { started_at: timestamp } : {}),
      ...(status !== "running" ? { completed_at: timestamp } : {}),
      ...(event.type === SessionEvent.Execution.Failed.type ? { failure: event.data.failure } : {}),
      ...(event.type === SessionEvent.Execution.Interrupted.type ? { interruption: event.data.interruption } : {}),
      ...(event.type === SessionEvent.Execution.Superseded.type
        ? { superseded_by_attempt_id: event.data.supersededByAttemptID }
        : {}),
    })
    .where(and(eq(SessionExecutionAttemptTable.id, event.data.attemptID), eq(SessionExecutionAttemptTable.status, stored.status)))
    .returning({ id: SessionExecutionAttemptTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die(`Concurrent execution attempt transition: ${event.data.attemptID}`)
})
