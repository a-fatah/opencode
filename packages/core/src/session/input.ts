export * as SessionInput from "./input"

import { and, asc, eq, isNull, lte } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { Admitted, Delivery, Pending } from "@opencode-ai/schema/session-input"
import { SessionExecutionAttempt } from "@opencode-ai/schema/session-execution-attempt"
import type { Database } from "../database/database"
import type { EventV2 } from "../event"
import { SessionEvent } from "./event"
import { SessionMessage } from "./message"
import { Prompt } from "./prompt"
import { SessionSchema } from "./schema"
import { SessionInputTable, SessionMessageTable } from "./sql"

type DatabaseService = Database.Interface["db"]

export { Admitted, Delivery }

const decodePrompt = Schema.decodeUnknownSync(Prompt)
const encodePrompt = Schema.encodeSync(Prompt)

const fromRow = (row: typeof SessionInputTable.$inferSelect): Admitted =>
  Admitted.make({
    admittedSeq: row.admitted_seq,
    id: SessionMessage.ID.make(row.id),
    sessionID: SessionSchema.ID.make(row.session_id),
    prompt: decodePrompt(row.prompt),
    delivery: row.delivery,
    timeCreated: DateTime.makeUnsafe(row.time_created),
    ...(row.promoted_seq === null ? {} : { promotedSeq: row.promoted_seq }),
    ...(row.time_updated === null ? {} : { timeUpdated: DateTime.makeUnsafe(row.time_updated) }),
    ...(row.cancelled_at === null ? {} : { cancelledAt: DateTime.makeUnsafe(row.cancelled_at) }),
    ...(row.claimed_attempt_id === null ? {} : { claimedAttemptID: row.claimed_attempt_id }),
  })

const toPending = (row: typeof SessionInputTable.$inferSelect): Pending =>
  Pending.make({
    admittedSeq: row.admitted_seq,
    id: SessionMessage.ID.make(row.id),
    sessionID: SessionSchema.ID.make(row.session_id),
    prompt: decodePrompt(row.prompt),
    delivery: row.delivery,
    timeCreated: DateTime.makeUnsafe(row.time_created),
    ...(row.time_updated === null ? {} : { timeUpdated: DateTime.makeUnsafe(row.time_updated) }),
  })

export const find = Effect.fn("SessionInput.find")(function* (db: DatabaseService, id: SessionMessage.ID) {
  const row = yield* db.select().from(SessionInputTable).where(eq(SessionInputTable.id, id)).get().pipe(Effect.orDie)
  return row === undefined ? undefined : fromRow(row)
})

export const pending = Effect.fn("SessionInput.pending")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        isNull(SessionInputTable.cancelled_at),
        isNull(SessionInputTable.claimed_attempt_id),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return rows.map(toPending)
})

export const replace = Effect.fn("SessionInput.replace")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: SessionMessage.ID; readonly prompt: Prompt },
) {
  const stored = yield* find(db, input.messageID)
  if (!stored || stored.sessionID !== input.sessionID) return undefined
  if (stored.promotedSeq !== undefined || stored.cancelledAt || stored.claimedAttemptID)
    return yield* Effect.die(
      new LifecycleConflict({
        id: input.messageID,
        state: stored.promotedSeq !== undefined ? "promoted" : stored.cancelledAt ? "cancelled" : "claimed",
      }),
    )
  const timestamp = yield* DateTime.now
  yield* events.publish(SessionEvent.PromptReplaced, {
    sessionID: input.sessionID,
    messageID: input.messageID,
    timestamp,
    prompt: input.prompt,
    delivery: stored.delivery,
  })
  return Admitted.make({ ...stored, prompt: input.prompt, timeUpdated: timestamp })
})

export const cancel = Effect.fn("SessionInput.cancel")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  messageID: SessionMessage.ID,
) {
  const stored = yield* find(db, messageID)
  if (!stored || stored.sessionID !== sessionID) return false
  if (stored.promotedSeq !== undefined || stored.cancelledAt || stored.claimedAttemptID)
    return yield* Effect.die(
      new LifecycleConflict({
        id: messageID,
        state: stored.promotedSeq !== undefined ? "promoted" : stored.cancelledAt ? "cancelled" : "claimed",
      }),
    )
  yield* events.publish(SessionEvent.PromptCancelled, { sessionID, messageID, timestamp: yield* DateTime.now })
  return true
})

export const projectReplaced = Effect.fn("SessionInput.projectReplaced")(function* (
  db: DatabaseService,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: SessionMessage.ID; readonly prompt: Prompt; readonly timestamp: DateTime.Utc },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ prompt: encodePrompt(input.prompt), time_updated: DateTime.toEpochMillis(input.timestamp) })
    .where(and(eq(SessionInputTable.id, input.messageID), eq(SessionInputTable.session_id, input.sessionID), isNull(SessionInputTable.promoted_seq), isNull(SessionInputTable.cancelled_at), isNull(SessionInputTable.claimed_attempt_id)))
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* lifecycleConflict(db, input.messageID)
})

export const projectCancelled = Effect.fn("SessionInput.projectCancelled")(function* (
  db: DatabaseService,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: SessionMessage.ID; readonly timestamp: DateTime.Utc },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ cancelled_at: DateTime.toEpochMillis(input.timestamp), time_updated: DateTime.toEpochMillis(input.timestamp) })
    .where(and(eq(SessionInputTable.id, input.messageID), eq(SessionInputTable.session_id, input.sessionID), isNull(SessionInputTable.promoted_seq), isNull(SessionInputTable.cancelled_at), isNull(SessionInputTable.claimed_attempt_id)))
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* lifecycleConflict(db, input.messageID)
})

export const projectClaimed = Effect.fn("SessionInput.projectClaimed")(function* (
  db: DatabaseService,
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: SessionMessage.ID; readonly attemptID: SessionExecutionAttempt.ID; readonly timestamp: DateTime.Utc },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ claimed_attempt_id: input.attemptID, time_updated: DateTime.toEpochMillis(input.timestamp) })
    .where(and(eq(SessionInputTable.id, input.messageID), eq(SessionInputTable.session_id, input.sessionID), isNull(SessionInputTable.promoted_seq), isNull(SessionInputTable.cancelled_at), isNull(SessionInputTable.claimed_attempt_id)))
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* lifecycleConflict(db, input.messageID)
})

export class LifecycleConflict extends Schema.TaggedErrorClass<LifecycleConflict>()("SessionInput.LifecycleConflict", {
  id: SessionMessage.ID,
  state: Schema.Literals(["promoted", "cancelled", "claimed"]),
}) {}

const lifecycleConflict = Effect.fn("SessionInput.lifecycleConflict")(function* (
  db: DatabaseService,
  id: SessionMessage.ID,
) {
  const stored = yield* find(db, id)
  return yield* Effect.die(
    new LifecycleConflict({
      id,
      state: stored?.promotedSeq !== undefined ? "promoted" : stored?.cancelledAt ? "cancelled" : "claimed",
    }),
  )
})

export class PendingConflict extends Schema.TaggedErrorClass<PendingConflict>()("SessionInput.PendingConflict", {
  expectedMessageID: SessionMessage.ID,
  pendingMessageIDs: Schema.Array(SessionMessage.ID),
}) {}

export const validateOnlyPending = Effect.fn("SessionInput.validateOnlyPending")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  expectedMessageID: SessionMessage.ID,
) {
  const rows = yield* pending(db, sessionID)
  if (rows.length !== 1 || rows[0]?.id !== expectedMessageID)
    return yield* Effect.die(
      new PendingConflict({ expectedMessageID, pendingMessageIDs: rows.map((row) => row.id) }),
    )
})

export const admit = Effect.fn("SessionInput.admit")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) {
  const existing = yield* find(db, input.id)
  if (existing !== undefined) return existing
  const timestamp = yield* DateTime.now
  return yield* events
    .publish(SessionEvent.PromptAdmitted, {
      messageID: input.id,
      sessionID: input.sessionID,
      timestamp,
      prompt: input.prompt,
      delivery: input.delivery,
    })
    .pipe(
      Effect.flatMap((event) =>
        event.durable === undefined
          ? Effect.die("Prompt admission event is missing aggregate sequence")
          : Effect.succeed(
              Admitted.make({
                admittedSeq: event.durable.seq,
                id: input.id,
                sessionID: input.sessionID,
                prompt: input.prompt,
                delivery: input.delivery,
                timeCreated: timestamp,
              }),
            ),
      ),
      Effect.catchDefect((defect) =>
        find(db, input.id).pipe(Effect.flatMap((stored) => (stored ? Effect.succeed(stored) : Effect.die(defect)))),
      ),
    )
})

export const projectAdmitted = Effect.fn("SessionInput.projectAdmitted")(function* (
  db: DatabaseService,
  input: {
    readonly admittedSeq: number
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) {
  const message = yield* db
    .select({ id: SessionMessageTable.id })
    .from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, input.id))
    .get()
    .pipe(Effect.orDie)
  if (message !== undefined) return yield* Effect.die(new LifecycleConflict({ id: input.id, state: "promoted" }))
  const stored = yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      admitted_seq: input.admittedSeq,
      prompt: encodePrompt(input.prompt),
      delivery: input.delivery,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .onConflictDoNothing()
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(new LifecycleConflict({ id: input.id, state: "claimed" }))
})

export const projectPrompted = Effect.fn("SessionInput.projectPrompted")(function* (
  db: DatabaseService,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
    readonly promotedSeq: number
  },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ promoted_seq: input.promotedSeq })
    .where(
      and(
        eq(SessionInputTable.id, input.id),
        eq(SessionInputTable.session_id, input.sessionID),
        isNull(SessionInputTable.promoted_seq),
        isNull(SessionInputTable.cancelled_at),
      ),
    )
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (updated) {
    const stored = fromRow(updated)
    if (!matchesProjection(stored, input))
      return yield* Effect.die(new LifecycleConflict({ id: input.id, state: "promoted" }))
    return
  }

  const stored = yield* find(db, input.id)
  if (stored) {
    if (!matchesProjection(stored, input) || stored.promotedSeq !== input.promotedSeq)
      return yield* Effect.die(new LifecycleConflict({ id: input.id, state: "promoted" }))
    return
  }

  yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      prompt: encodePrompt(input.prompt),
      delivery: input.delivery,
      admitted_seq: input.promotedSeq,
      promoted_seq: input.promotedSeq,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .run()
    .pipe(Effect.orDie)
})

export const promoteClaimed = Effect.fn("SessionInput.promoteClaimed")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  messageID: SessionMessage.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(and(eq(SessionInputTable.id, messageID), eq(SessionInputTable.session_id, sessionID), isNull(SessionInputTable.promoted_seq), isNull(SessionInputTable.cancelled_at)))
    .get()
    .pipe(Effect.orDie)
  if (!row?.claimed_attempt_id) {
    const promoted = yield* find(db, messageID)
    return promoted?.sessionID === sessionID && promoted.promotedSeq !== undefined && promoted.claimedAttemptID !== undefined
  }
  return yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
})

export const hasPending = Effect.fn("SessionInput.hasPending")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  delivery: Delivery,
) {
  const row = yield* db
    .select({ id: SessionInputTable.id })
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        isNull(SessionInputTable.cancelled_at),
        isNull(SessionInputTable.claimed_attempt_id),
        eq(SessionInputTable.delivery, delivery),
      ),
    )
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row !== undefined
})

export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
  input.sessionID === expected.sessionID &&
  JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))

const matchesProjection = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) =>
  equivalent(input, expected) &&
  DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)

const publish = Effect.fn("SessionInput.publish")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  rows: ReadonlyArray<typeof SessionInputTable.$inferSelect>,
) {
  for (const row of rows) {
    const id = SessionMessage.ID.make(row.id)
    yield* events
      .publish(SessionEvent.Prompted, {
        sessionID,
        timestamp: DateTime.makeUnsafe(row.time_created),
        messageID: id,
        prompt: decodePrompt(row.prompt),
        delivery: row.delivery,
      })
      .pipe(
        Effect.catchDefect((defect) =>
          defect instanceof LifecycleConflict
            ? find(db, id).pipe(
                Effect.flatMap((stored) => (stored?.promotedSeq === undefined ? Effect.die(defect) : Effect.void)),
              )
            : Effect.die(defect),
        ),
      )
  }
  return rows.length
})

export const promoteSteers = Effect.fn("SessionInput.promoteSteers")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  cutoff: number,
) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        isNull(SessionInputTable.cancelled_at),
        isNull(SessionInputTable.claimed_attempt_id),
        eq(SessionInputTable.delivery, "steer"),
        lte(SessionInputTable.admitted_seq, cutoff),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return yield* publish(db, events, sessionID, rows)
})

export const promoteNextQueued = Effect.fn("SessionInput.promoteNextQueued")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        isNull(SessionInputTable.cancelled_at),
        isNull(SessionInputTable.claimed_attempt_id),
        eq(SessionInputTable.delivery, "queue"),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row === undefined ? false : yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
})
