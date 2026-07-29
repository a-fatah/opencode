import { Cause, Effect, Exit, Layer, Scope } from "effect"
import { LocationServiceMap } from "../../location-service-map"
import { makeGlobalNode } from "../../effect/app-node"
import { SessionRunCoordinator } from "../run-coordinator"
import { SessionRunner } from "../runner"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { SessionExecution } from "../execution"
import { SessionExecutionAttempt } from "../execution-attempt"
import { Database } from "../../database/database"
import { EventV2 } from "../../event"
import { SessionEvent } from "../event"

export const make = (options: {
  readonly ownerEpoch: string
  readonly run: (
    sessionID: SessionSchema.ID,
    force: boolean,
    attempt?: SessionExecutionAttempt.Info,
  ) => Effect.Effect<void, SessionRunner.RunError>
  readonly publish: (
    definition:
      | typeof SessionEvent.Execution.Started
      | typeof SessionEvent.Execution.Completed
      | typeof SessionEvent.Execution.Failed
      | typeof SessionEvent.Execution.Interrupted,
    attempt: SessionExecutionAttempt.Info,
    detail?: SessionExecutionAttempt.Info["failure"] | SessionExecutionAttempt.Info["interruption"],
  ) => Effect.Effect<void>
}): Effect.Effect<SessionExecution.Interface, never, Scope.Scope> =>
  Effect.gen(function* () {
    const running = new Set<SessionSchema.ID>()
    let shuttingDown = false
    const coordinator = yield* SessionRunCoordinator.make<
      SessionSchema.ID,
      SessionRunner.RunError,
      SessionExecutionAttempt.Info
    >({
      valueEquals: (left, right) => left.id === right.id,
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force, attempt) {
        const run = Effect.sync(() => running.add(sessionID)).pipe(
          Effect.andThen(options.run(sessionID, force, attempt)),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
          Effect.ensuring(Effect.sync(() => running.delete(sessionID))),
        )
        if (!attempt) return yield* run
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            yield* options.publish(SessionEvent.Execution.Started, attempt)
            const exit = yield* restore(run).pipe(Effect.exit)
            if (Exit.isSuccess(exit)) {
              yield* options.publish(SessionEvent.Execution.Completed, attempt)
              return
            }
            if (Cause.hasInterruptsOnly(exit.cause)) {
              yield* options.publish(SessionEvent.Execution.Interrupted, attempt, {
                reason: shuttingDown ? "shutdown" : "user",
              })
              return yield* Effect.failCause(exit.cause)
            }
            const failure = Cause.squash(exit.cause)
            yield* options.publish(SessionEvent.Execution.Failed, attempt, {
              type: failure instanceof Error ? failure.name : "unknown",
              message: failure instanceof Error ? failure.message : String(failure),
              ...(failure instanceof SessionRunner.ProviderDeclaredFailure
                ? { type: failure.classification ?? "provider", retryable: failure.retryable }
                : {}),
            })
            return yield* Effect.failCause(exit.cause)
          }),
        )
      }),
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => (shuttingDown = true)))

    return SessionExecution.Service.of({
      active: Effect.sync(() => new Set(running)),
      ownerEpoch: options.ownerEpoch,
      interrupt: coordinator.interrupt,
      resume: coordinator.run,
      wake: coordinator.wake,
      schedule: (attempt) => coordinator.schedule(attempt.sessionID, attempt),
    })
  })

/** Current-process routing for implicit-local Locations. Future remote placement belongs here. */
const layer = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const events = yield* EventV2.Service
    const { db } = yield* Database.Service
    const ownerEpoch = crypto.randomUUID()
    yield* SessionExecutionAttempt.classifyOwner(db, ownerEpoch)
    return yield* make({
      ownerEpoch,
      run: Effect.fnUntraced(function* (sessionID, force, attempt) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) =>
          runner.run({ sessionID, force, claimedMessageID: attempt?.messageID }),
        ).pipe(
          Effect.provide(locations.get(session.location)),
        )
      }),
      publish: (definition, attempt, detail) => SessionExecutionAttempt.publish(events, definition, attempt, detail),
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecution.Service,
  layer,
  deps: [SessionStore.node, LocationServiceMap.node, Database.node, EventV2.node],
})

export * as SessionExecutionLocal from "./local"
