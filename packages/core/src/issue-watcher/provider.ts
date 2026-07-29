export * as IssueProvider from "./provider"

import { Integration } from "@opencode-ai/schema/integration"
import { Context, Effect, Layer, Ref, Scope } from "effect"
import { makeGlobalNode } from "../effect/app-node"

export interface Adapter {
  readonly integrationID: Integration.ID
}

export interface Interface {
  readonly list: () => Effect.Effect<ReadonlyArray<Adapter>>
  readonly get: (integrationID: Integration.ID) => Effect.Effect<Adapter | undefined>
  readonly register: (adapter: Adapter) => Effect.Effect<void, never, Scope.Scope>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/IssueProvider") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const adapters = yield* Ref.make<ReadonlyArray<Adapter>>([])

    return Service.of({
      list: Effect.fn("IssueProvider.list")(function* () {
        return yield* Ref.get(adapters)
      }),
      get: Effect.fn("IssueProvider.get")(function* (integrationID) {
        return (yield* Ref.get(adapters)).find((adapter) => adapter.integrationID === integrationID)
      }),
      register: Effect.fn("IssueProvider.register")(function* (adapter) {
        yield* Effect.acquireRelease(
          Ref.modify(adapters, (current) => {
            if (current.some((item) => item.integrationID === adapter.integrationID)) return [false, current]
            return [true, [...current, adapter]]
          }).pipe(
            Effect.flatMap((added) =>
              added ? Effect.void : Effect.die(`Duplicate issue provider: ${adapter.integrationID}`),
            ),
            Effect.as(adapter),
          ),
          (registered) => Ref.update(adapters, (current) => current.filter((item) => item !== registered)),
        )
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
