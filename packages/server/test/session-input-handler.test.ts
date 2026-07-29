import { describe, expect, test } from "bun:test"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Context, DateTime, Effect, Layer } from "effect"
import { Api } from "../src/api"
import { SessionHandler } from "../src/handlers/session"
import { SessionLocationMiddleware } from "../src/middleware/session-location"
import { Authorization } from "@opencode-ai/protocol/middleware/authorization"
import { SchemaErrorMiddleware } from "@opencode-ai/protocol/middleware/schema-error"

const sessionID = SessionV2.ID.make("ses_handler")
const messageID = SessionMessage.ID.make("msg_handler")
const pending: Effect.Success<ReturnType<SessionV2.Interface["pendingInputs"]>>[number] = {
  admittedSeq: 1,
  id: messageID,
  sessionID,
  prompt: { text: "Pending" },
  delivery: "steer" as const,
  timeCreated: DateTime.makeUnsafe(1),
}
const admitted: Effect.Success<ReturnType<SessionV2.Interface["replaceInput"]>> = pending

type HandlerInput = {
  readonly params: { readonly sessionID: SessionV2.ID; readonly messageID?: SessionMessage.ID }
  readonly payload?: { readonly prompt: typeof pending.prompt }
}

class SessionGroupService extends Context.Service<
  SessionGroupService,
  { readonly handlers: ReadonlyMap<string, { readonly handler: (input: HandlerInput) => Effect.Effect<unknown, unknown> }> }
>()("effect/httpapi/HttpApiGroup/server.session") {}

describe("session input handlers", () => {
  test("forwards pending and replacement inputs to core", async () => {
    const calls: Array<unknown> = []
    const layer = SessionHandler.pipe(
      Layer.provide(
        Layer.mock(SessionV2.Service)({
          pendingInputs: (value) => Effect.sync(() => (calls.push(value), [pending])),
          replaceInput: (value) => Effect.sync(() => (calls.push(value), admitted)),
          revert: {
            stage: () => Effect.die("not implemented"),
            clear: () => Effect.die("not implemented"),
            commit: () => Effect.die("not implemented"),
          },
        }),
      ),
      Layer.provide(Layer.succeed(SessionLocationMiddleware, SessionLocationMiddleware.of(() => Effect.die("unused")))),
      Layer.provide(Layer.succeed(Authorization, Authorization.of((effect) => effect))),
      Layer.provide(Layer.succeed(SchemaErrorMiddleware, SchemaErrorMiddleware.of((effect) => effect))),
    )

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const handlers = Context.getUnsafe(yield* Layer.build(layer), SessionGroupService)
          const pendingHandler = handlers.handlers.get("session.input.pending")!
          const replaceHandler = handlers.handlers.get("session.input.replace")!

          expect(yield* pendingHandler.handler({ params: { sessionID } })).toEqual([pending])
          expect(
            yield* replaceHandler.handler({
              params: { sessionID, messageID },
              payload: { prompt: { text: "Replaced" } },
            }),
          ).toEqual(admitted)
        }),
      ),
    )

    expect(calls).toEqual([sessionID, { sessionID, messageID, prompt: { text: "Replaced" } }])
  })
})
