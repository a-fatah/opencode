export * as IssueProvider from "./provider"

import { Credential } from "@opencode-ai/schema/credential"
import { Integration } from "@opencode-ai/schema/integration"
import { Issue } from "@opencode-ai/schema/issue"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Context, Effect, Layer, Ref, Schema, Scope } from "effect"
import { HttpClient } from "effect/unstable/http"
import { makeGlobalNode } from "../effect/app-node"
import { httpClient } from "../effect/app-node-platform"
import { makeJira } from "./provider-jira"

export class InvalidInputError extends Schema.TaggedErrorClass<InvalidInputError>()("IssueProvider.InvalidInputError", {
  detail: Schema.String,
}) {}

export class AuthenticationError extends Schema.TaggedErrorClass<AuthenticationError>()(
  "IssueProvider.AuthenticationError",
  { detail: Schema.String },
) {}

export class RequestError extends Schema.TaggedErrorClass<RequestError>()("IssueProvider.RequestError", {
  detail: Schema.String,
}) {}

export class PaginationError extends Schema.TaggedErrorClass<PaginationError>()("IssueProvider.PaginationError", {
  detail: Schema.String,
}) {}

export class NotImplementedError extends Schema.TaggedErrorClass<NotImplementedError>()(
  "IssueProvider.NotImplementedError",
  { operation: Schema.String },
) {}

export type Error = InvalidInputError | AuthenticationError | RequestError | PaginationError | NotImplementedError

export interface SearchResult {
  readonly issues: ReadonlyArray<Issue.Info>
  readonly nextPage?: string
  readonly cursor: string
}

export interface Adapter {
  readonly integrationID: Integration.ID
  readonly name: string
  readonly method: Integration.KeyMethod
  readonly tenantIdentity: (inputs: Integration.Inputs) => Effect.Effect<string, InvalidInputError>
  readonly verify: (credential: Credential.Key) => Effect.Effect<IssueWatcher.VerificationResult, Error>
  readonly search: (input: {
    readonly credential: Credential.Key
    readonly criteria: IssueWatcher.Criteria
    readonly cursor?: string
    readonly page?: string
  }) => Effect.Effect<SearchResult, Error>
  readonly get: (credential: Credential.Key, key: string) => Effect.Effect<Issue.Info, Error>
  readonly comment: () => Effect.Effect<never, NotImplementedError>
  readonly transition: () => Effect.Effect<never, NotImplementedError>
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
    const jira = makeJira(yield* HttpClient.HttpClient)
    const adapters = yield* Ref.make<ReadonlyArray<Adapter>>([jira])
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
            Effect.flatMap((added) => added ? Effect.void : Effect.die(`Duplicate issue provider: ${adapter.integrationID}`)),
            Effect.as(adapter),
          ),
          (registered) => Ref.update(adapters, (current) => current.filter((item) => item !== registered)),
        )
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [httpClient] })
