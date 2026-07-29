import { IssueWatcher } from "@opencode-ai/core/issue-watcher"
import {
  InvalidRequestError,
  IssueIntegrationAuthenticationError,
  IssueIntegrationConnectionNotFoundError,
  IssueIntegrationNotFoundError,
  IssueIntegrationProviderError,
  IssueIntegrationTenantConflict,
  IssueWatcherNotFoundError,
  IssueWatcherOwnerConflict,
} from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

const notFound = (watcherID: string) =>
  new IssueWatcherNotFoundError({
    watcherID,
    message: `Issue watcher not found: ${watcherID}`,
  })

const ownerConflict = (detail: string) =>
  new IssueWatcherOwnerConflict({
    message: detail,
  })

const sourceError = (error: IssueWatcher.SourceNotFoundError | IssueWatcher.ConnectionNotFoundError | IssueWatcher.VerificationModeError | import("@opencode-ai/core/issue-watcher/provider").IssueProvider.Error) => {
  if (error._tag === "IssueWatcher.SourceNotFoundError") {
    return new IssueIntegrationNotFoundError({ integrationID: error.integrationID, message: "Issue source not found" })
  }
  if (error._tag === "IssueWatcher.ConnectionNotFoundError") {
    return new IssueIntegrationConnectionNotFoundError({ connectionID: error.connectionID, message: "Issue source connection not found" })
  }
  if (error._tag === "IssueProvider.AuthenticationError") {
    return new IssueIntegrationAuthenticationError({ message: error.detail })
  }
  if (error._tag === "IssueWatcher.VerificationModeError" || error._tag === "IssueProvider.InvalidInputError") {
    return new InvalidRequestError({ message: error.detail, kind: "issue_integration" })
  }
  return new IssueIntegrationProviderError({
    message: error._tag === "IssueProvider.NotImplementedError" ? `${error.operation} is not implemented` : error.detail,
  })
}

export const IssueWatcherHandler = HttpApiBuilder.group(Api, "server.issueWatcher", (handlers) =>
  Effect.gen(function* () {
    const service = yield* IssueWatcher.Service

    return handlers
      .handle("issueWatcher.sources", () => service.source.list())
      .handle("issueWatcher.verifySource", (ctx) =>
        service.source.verify(ctx.params.integrationID, ctx.payload).pipe(Effect.mapError(sourceError)),
      )
      .handle("issueWatcher.createConnection", (ctx) =>
        service.source.create(ctx.params.integrationID, ctx.payload).pipe(Effect.mapError(sourceError)),
      )
      .handle("issueWatcher.rotateConnection", (ctx) =>
        service.source.rotate(ctx.params.integrationID, ctx.params.connectionID, ctx.payload).pipe(
          Effect.mapError((error) =>
            error._tag === "IssueWatcher.TenantConflictError"
              ? new IssueIntegrationTenantConflict({ connectionID: error.connectionID, message: "Tenant identity cannot be changed" })
              : sourceError(error),
          ),
        ),
      )
      .handle("issueWatcher.preview", (ctx) => service.preview(ctx.payload).pipe(Effect.mapError(sourceError)))
      .handle("issueWatcher.getSettings", () => service.settings.get())
      .handle("issueWatcher.updateSettings", (ctx) => service.settings.update(ctx.payload))
      .handle("issueWatcher.list", () => service.list())
      .handle("issueWatcher.create", (ctx) =>
        service.create(ctx.payload).pipe(
          Effect.catchTag("IssueWatcher.OwnerConflictError", (error) => ownerConflict(error.detail)),
        ),
      )
      .handle("issueWatcher.get", (ctx) =>
        service.get(ctx.params.watcherID).pipe(
          Effect.catchTag("IssueWatcher.NotFoundError", () => notFound(ctx.params.watcherID)),
        ),
      )
      .handle("issueWatcher.update", (ctx) =>
        service.update(ctx.params.watcherID, ctx.payload).pipe(
          Effect.catchTags({
            "IssueWatcher.NotFoundError": () => notFound(ctx.params.watcherID),
            "IssueWatcher.ArchivedError": () => notFound(ctx.params.watcherID),
          }),
        ),
      )
      .handle("issueWatcher.archive", (ctx) =>
        service.archive(ctx.params.watcherID).pipe(
          Effect.catchTag("IssueWatcher.NotFoundError", () => notFound(ctx.params.watcherID)),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("issueWatcher.enable", (ctx) =>
        service.enable(ctx.params.watcherID, ctx.payload.enabled).pipe(
          Effect.catchTags({
            "IssueWatcher.NotFoundError": () => notFound(ctx.params.watcherID),
            "IssueWatcher.ArchivedError": () => notFound(ctx.params.watcherID),
            "IssueWatcher.OwnerConflictError": (error) =>
              ownerConflict(error.detail),
          }),
        ),
      )
  }),
)
