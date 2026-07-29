import { IssueWatcher } from "@opencode-ai/core/issue-watcher"
import { IssueWatcherNotFoundError, IssueWatcherOwnerConflict } from "@opencode-ai/protocol/errors"
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

export const IssueWatcherHandler = HttpApiBuilder.group(Api, "server.issueWatcher", (handlers) =>
  Effect.gen(function* () {
    const service = yield* IssueWatcher.Service

    return handlers
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
