export * as IssueWatcherOwner from "./owner"

import { Context, Effect, Layer, Schema } from "effect"
import path from "path"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { Flock } from "../util/flock"

export const Status = Schema.Union([
  Schema.Struct({ status: Schema.Literal("active") }),
  Schema.Struct({ status: Schema.Literal("owner_conflict"), detail: Schema.String }),
  Schema.Struct({ status: Schema.Literal("disabled"), detail: Schema.optional(Schema.String) }),
]).pipe(Schema.toTaggedUnion("status"))
export type Status = typeof Status.Type

export interface Interface {
  readonly status: () => Status
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/IssueWatcherOwner") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.filename === ":memory:") return Service.of({ status: () => ({ status: "active" }) })

    const lock = yield* Effect.tryPromise({
      try: () =>
        Flock.acquire(`issue-watcher:${path.resolve(database.filename)}`, {
          dir: path.dirname(path.resolve(database.filename)),
          timeoutMs: 0,
          baseDelayMs: 1,
          maxDelayMs: 1,
        }),
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause)),
    }).pipe(Effect.result)

    if (lock._tag === "Failure") {
      const conflict = lock.failure.message.startsWith("Timed out waiting for lock:")
      return Service.of({
        status: () => conflict
          ? {
              status: "owner_conflict",
              detail: `Another process owns issue watching for ${database.filename}`,
            }
          : { status: "disabled", detail: lock.failure.message },
      })
    }
    yield* Effect.addFinalizer(() => Effect.promise(() => lock.success.release()).pipe(Effect.orDie))
    return Service.of({ status: () => ({ status: "active" }) })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
