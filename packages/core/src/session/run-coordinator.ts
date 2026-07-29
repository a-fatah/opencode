export * as SessionRunCoordinator from "./run-coordinator"

import { Deferred, Effect, Exit, Fiber, FiberSet, Scope } from "effect"

/** Serializes execution for each key while allowing different keys to run concurrently. */
export interface Coordinator<Key, E, Value = never> {
  /** Snapshots keys with an execution owned by this coordinator. */
  readonly active: Effect.Effect<ReadonlySet<Key>>
  /** Starts execution while idle or joins the active execution. */
  readonly run: (key: Key) => Effect.Effect<void, E>
  /** Registers one coalesced follow-up after newly recorded work. */
  readonly wake: (key: Key) => Effect.Effect<void>
  /** Starts a non-blocking explicit drain carrying one durable value. */
  readonly schedule: (key: Key, value: Value) => Effect.Effect<void>
  /** Stops active execution and waits for its cleanup. */
  readonly interrupt: (key: Key) => Effect.Effect<void>
}

type Entry<E, Value> = {
  readonly done: Deferred.Deferred<void, E>
  owner?: Fiber.Fiber<void, never>
  pendingWake: boolean
  readonly pendingValues: Value[]
  stopping: boolean
  readonly value?: Value
}

export const make = <Key, E, Value = never>(options: {
  readonly drain: (key: Key, force: boolean, value?: Value) => Effect.Effect<void, E>
  readonly valueEquals?: (left: Value, right: Value) => boolean
}): Effect.Effect<Coordinator<Key, E, Value>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const active = new Map<Key, Entry<E, Value>>()
    const fork = yield* FiberSet.makeRuntime<never, void, never>()

    const makeEntry = (value?: Value): Entry<E, Value> => ({
      done: Deferred.makeUnsafe<void, E>(),
      pendingWake: false,
      pendingValues: [],
      stopping: false,
      value,
    })

    const start = (key: Key, entry: Entry<E, Value>, force: boolean, successor = false) => {
      const ready = Deferred.makeUnsafe<void>()
      const owner = fork(
        (successor ? Effect.yieldNow : Deferred.await(ready)).pipe(
          Effect.andThen(Effect.suspend(() => options.drain(key, force, entry.value))),
          Effect.onExit((exit) => Effect.sync(() => settle(key, entry, exit))),
          Effect.exit,
          Effect.asVoid,
        ),
      )
      entry.owner = owner
      if (!successor) Deferred.doneUnsafe(ready, Effect.void)
    }

    const settle = (key: Key, entry: Entry<E, Value>, exit: Exit.Exit<void, E>) => {
      if (entry.pendingValues.length > 0) {
        const successor = makeEntry(entry.pendingValues.shift())
        successor.pendingValues.push(...entry.pendingValues)
        successor.pendingWake = entry.pendingWake
        active.set(key, successor)
        start(key, successor, true, true)
        Deferred.doneUnsafe(entry.done, exit)
        return
      }
      if (Exit.isSuccess(exit) && !entry.stopping && entry.pendingWake) {
        if (entry.value !== undefined) {
          const successor = makeEntry()
          active.set(key, successor)
          start(key, successor, false, true)
          Deferred.doneUnsafe(entry.done, exit)
          return
        }
        entry.pendingWake = false
        start(key, entry, false, true)
        return
      }

      const successor = entry.pendingWake ? makeEntry() : undefined
      if (successor === undefined) active.delete(key)
      else {
        active.set(key, successor)
        start(key, successor, false, true)
      }
      Deferred.doneUnsafe(entry.done, exit)
    }

    const run = (key: Key): Effect.Effect<void, E> =>
      Effect.uninterruptibleMask((restore) => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (entry.stopping) return restore(Deferred.await(entry.done).pipe(Effect.andThen(run(key))))
          return restore(Deferred.await(entry.done))
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, true)
        return restore(Deferred.await(next.done))
      })

    const wake = (key: Key) =>
      Effect.sync(() => {
        const entry = active.get(key)
        if (entry !== undefined) {
          entry.pendingWake = true
          return
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, false)
      })

    const schedule = (key: Key, value: Value) =>
      Effect.sync(() => {
        const entry = active.get(key)
        if (entry) {
          if (entry.value !== undefined && (options.valueEquals?.(entry.value, value) ?? entry.value === value)) return
          if (
            entry.pendingValues.some((pending) => options.valueEquals?.(pending, value) ?? pending === value)
          )
            return
          entry.pendingValues.push(value)
          return
        }
        const next = makeEntry(value)
        active.set(key, next)
        start(key, next, true)
      })

    const interrupt = (key: Key): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        if (entry?.owner === undefined) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return { active: Effect.sync(() => new Set(active.keys())), run, wake, schedule, interrupt }
  })
