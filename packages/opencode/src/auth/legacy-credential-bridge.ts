import { Credential } from "@opencode-ai/core/credential"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Integration } from "@opencode-ai/schema/integration"
import { Effect, Layer } from "effect"
import { Auth } from "."

const integrationID = Integration.ID.make("github-copilot")

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const credentials = yield* Credential.Service
    const legacy = yield* auth.get(integrationID).pipe(Effect.orDie)
    if (!legacy || legacy.type !== "oauth") return
    const current = (yield* credentials.list(integrationID)).find((item) => item.label === "legacy-auth")
    const value = Credential.Key.make({ type: "key", key: legacy.refresh })
    if (current) {
      if (current.value.type !== "key" || current.value.key !== value.key) {
        yield* credentials.update(current.id, { value })
      }
      return
    }
    yield* credentials.create({ integrationID, label: "legacy-auth", value })
  }),
)

export const node = LayerNode.make({
  name: "legacy-provider-credential-bridge",
  layer,
  deps: [Auth.node, Credential.node],
})
