import { IssueWatcher } from "@opencode-ai/core/issue-watcher"
import {
  InvalidRequestError,
  InvalidCursorError,
  IssueIntegrationAuthenticationError,
  IssueIntegrationConnectionNotFoundError,
  IssueIntegrationNotFoundError,
  IssueIntegrationProviderError,
  IssueIntegrationTenantConflict,
  IssueWatcherNotFoundError,
  IssueWatcherOwnerConflict,
  IssueWatcherRunConflict,
} from "@opencode-ai/protocol/errors"
import {
  IssueMatchConflictError,
  IssueMatchNotFoundError,
  IssueWatcherProjectNotFoundError,
  IssueWatcherSessionNotFoundError,
} from "@opencode-ai/protocol/groups/issue-watcher"
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

const runConflict = (error: IssueWatcher.RunConflictError) =>
  new IssueWatcherRunConflict({
    watcherID: error.id,
    message: error.detail,
  })

const matchNotFound = (matchID: string) =>
  new IssueMatchNotFoundError({ matchID, message: `Issue match not found: ${matchID}` })

const matchConflict = (matchID: string, detail: string) =>
  new IssueMatchConflictError({ matchID, message: detail })

const projectNotFound = (projectID: string) =>
  new IssueWatcherProjectNotFoundError({ projectID, message: `Project not found: ${projectID}` })

const provenanceNotFound = (sessionID: string) =>
  new IssueWatcherSessionNotFoundError({ sessionID, message: `Issue provenance not found: ${sessionID}` })

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
      .handle("issueWatcher.metadata", (ctx) =>
        service.source.metadata(ctx.params.integrationID, ctx.params.connectionID, ctx.payload).pipe(
          Effect.mapError(sourceError),
        ),
      )
      .handle("issueWatcher.preview", (ctx) => service.preview(ctx.payload).pipe(Effect.mapError(sourceError)))
      .handle("issueWatcher.getSettings", () => service.settings.get())
      .handle("issueWatcher.updateSettings", (ctx) => service.settings.update(ctx.payload))
      .handle("issueWatcher.list", () => service.list())
      .handle("issueWatcher.runAll", () => service.runAll().pipe(
        Effect.catchTags({
          "IssueWatcher.OwnerConflictError": (error) => ownerConflict(error.detail),
          "IssueWatcher.RunConflictError": runConflict,
        }),
      ))
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
      .handle("issueWatcher.run", (ctx) =>
        service.run(ctx.params.watcherID).pipe(
          Effect.catchTags({
            "IssueWatcher.NotFoundError": () => notFound(ctx.params.watcherID),
            "IssueWatcher.OwnerConflictError": (error) => ownerConflict(error.detail),
            "IssueWatcher.RunConflictError": runConflict,
          }),
        ),
      )
      .handle("issueWatcher.history", (ctx) =>
        service.history(ctx.params.watcherID, ctx.query).pipe(
          Effect.catchTags({
            "IssueWatcher.NotFoundError": () => notFound(ctx.params.watcherID),
            "IssueWatcher.InvalidCursorError": (error) => new InvalidCursorError({ message: error.detail }),
          }),
        ),
      )
      .handle("issueWatcher.ignores", (ctx) =>
        service.ignores(ctx.params.watcherID).pipe(
          Effect.catchTag("IssueWatcher.NotFoundError", () => notFound(ctx.params.watcherID)),
        ),
      )
      .handle("issueWatcher.inbox", (ctx) =>
        service.inbox(ctx.query).pipe(
          Effect.catchTag("IssueWatcher.InvalidCursorError", (error) => new InvalidCursorError({ message: error.detail })),
        ),
      )
      .handle("issueWatcher.inboxSummary", () => service.summary())
      .handle("issueWatcher.bulk", (ctx) => service.bulk(ctx.payload))
      .handle("issueWatcher.approve", (ctx) =>
        service.approve(ctx.params.matchID, ctx.payload).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
            "IssueWatcher.ProjectNotFoundError": (error) => projectNotFound(error.id),
          }),
        ),
      )
      .handle("issueWatcher.routeMatch", (ctx) =>
        service.routeMatch(ctx.params.matchID, ctx.payload).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
            "IssueWatcher.ProjectNotFoundError": (error) => projectNotFound(error.id),
          }),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("issueWatcher.skip", (ctx) =>
        service.skip(ctx.params.matchID).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
          }),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("issueWatcher.dismiss", (ctx) =>
        service.dismiss(ctx.params.matchID).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
          }),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("issueWatcher.rematerialize", (ctx) =>
        service.rematerialize(ctx.params.matchID, ctx.payload).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
            "IssueWatcher.ProjectNotFoundError": (error) => projectNotFound(error.id),
          }),
        ),
      )
      .handle("issueWatcher.duplicateDetail", (ctx) =>
        service.duplicateDetail(ctx.params.matchID).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
          }),
        ),
      )
      .handle("issueWatcher.resolveDuplicate", (ctx) =>
        service.resolveDuplicate(ctx.params.matchID, ctx.payload).pipe(
          Effect.catchTags({
            "IssueWatcher.MatchNotFoundError": () => matchNotFound(ctx.params.matchID),
            "IssueWatcher.MatchConflictError": (error) => matchConflict(ctx.params.matchID, error.detail),
            "IssueWatcher.ProjectNotFoundError": (error) => projectNotFound(error.id),
          }),
        ),
      )
      .handle("issueWatcher.addIgnore", (ctx) =>
        service.addIgnore(ctx.params.watcherID, ctx.payload).pipe(
          Effect.catchTag("IssueWatcher.NotFoundError", () => notFound(ctx.params.watcherID)),
        ),
      )
      .handle("issueWatcher.removeIgnore", (ctx) =>
        service.removeIgnore(ctx.params.watcherID, ctx.params.externalID).pipe(
          Effect.catchTag("IssueWatcher.NotFoundError", () => notFound(ctx.params.watcherID)),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("issueWatcher.provenanceDetail", (ctx) =>
        service.provenanceDetail(ctx.params.sessionID).pipe(
          Effect.catchTag("IssueWatcher.ProvenanceNotFoundError", () => provenanceNotFound(ctx.params.sessionID)),
        ),
      )
      .handle("issueWatcher.syncProvenance", (ctx) =>
        service.syncProvenance(ctx.params.sessionID).pipe(
          Effect.catchTags({
            "IssueWatcher.ProvenanceNotFoundError": () => provenanceNotFound(ctx.params.sessionID),
            "IssueWatcher.SourceNotFoundError": sourceError,
            "IssueWatcher.ConnectionNotFoundError": sourceError,
            "IssueProvider.AuthenticationError": sourceError,
            "IssueProvider.InvalidInputError": sourceError,
            "IssueProvider.NotImplementedError": sourceError,
            "IssueProvider.PaginationError": sourceError,
            "IssueProvider.RequestError": sourceError,
          }),
        ),
      )
  }),
)
