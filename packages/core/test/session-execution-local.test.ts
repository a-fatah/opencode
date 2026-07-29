import { describe, expect } from "bun:test"
import { DateTime, Deferred, Effect, Layer } from "effect"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionExecutionAttempt } from "@opencode-ai/core/session/execution-attempt"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionExecutionLocal } from "@opencode-ai/core/session/execution/local"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionV2 } from "@opencode-ai/core/session"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const attempt = (sessionID: SessionV2.ID) =>
  SessionExecutionAttempt.Info.make({
    id: SessionExecutionAttempt.ID.create(),
    sessionID,
    messageID: SessionMessage.ID.create(),
    ownerEpoch: "test",
    status: "scheduled",
    timeScheduled: DateTime.makeUnsafe(0),
  })

describe("SessionExecutionLocal", () => {
  it.effect("clears running status before terminal observers refetch", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const completed = yield* Deferred.make<void>()
        const ready = yield* Deferred.make<SessionExecution.Interface>()
        let active: ReadonlySet<SessionV2.ID> = new Set()
        const execution = yield* SessionExecutionLocal.make({
          ownerEpoch: "test",
          run: () => Effect.void,
          publish: (definition) =>
            definition === SessionEvent.Execution.Completed
              ? Effect.gen(function* () {
                  active = yield* (yield* Deferred.await(ready)).active
                  yield* Deferred.succeed(completed, undefined)
                })
              : Effect.void,
        })
        yield* Deferred.succeed(ready, execution)

        yield* execution.schedule(attempt(SessionV2.ID.make("ses_terminal")))
        yield* Deferred.await(completed)

        expect(Array.from(active)).toEqual([])
      }),
    ),
  )

  it.effect("runs attempts for different sessions concurrently", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bothStarted = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        let active = 0
        const execution = yield* SessionExecutionLocal.make({
          ownerEpoch: "test",
          run: () =>
            Effect.sync(() => ++active).pipe(
              Effect.tap(() => (active === 2 ? Deferred.succeed(bothStarted, undefined) : Effect.void)),
              Effect.andThen(Deferred.await(gate)),
            ),
          publish: () => Effect.void,
        })

        yield* execution.schedule(attempt(SessionV2.ID.make("ses_first")))
        yield* execution.schedule(attempt(SessionV2.ID.make("ses_second")))
        yield* Deferred.await(bothStarted)
        yield* Deferred.succeed(gate, undefined)
      }),
    ),
  )

  it.effect("records shutdown when its scope interrupts an attempt", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<SessionExecutionAttempt.Interruption>()

      yield* Effect.scoped(
        Effect.gen(function* () {
          const execution = yield* SessionExecutionLocal.make({
            ownerEpoch: "test",
            run: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
            publish: (definition, _attempt, detail) =>
              definition === SessionEvent.Execution.Interrupted && detail && "reason" in detail
                ? Deferred.succeed(interrupted, detail)
                : Effect.void,
          })
          yield* execution.schedule(attempt(SessionV2.ID.make("ses_shutdown")))
          yield* Deferred.await(started)
        }),
      )

      expect(yield* Deferred.await(interrupted)).toEqual({ reason: "shutdown" })
    }),
  )
})
