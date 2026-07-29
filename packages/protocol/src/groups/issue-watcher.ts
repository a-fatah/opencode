import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { IssueWatcherNotFoundError, IssueWatcherOwnerConflict } from "../errors"

const IssueWatcherUpdatePayload = Schema.Struct({
  ...IssueWatcher.UpdateInput.fields,
  integrationID: Schema.optional(Schema.Never),
  connectionID: Schema.optional(Schema.Never),
}).check(Schema.isMinProperties(1))

export const IssueWatcherGroup = HttpApiGroup.make("server.issueWatcher")
  .add(
    HttpApiEndpoint.get("issueWatcher.list", "/api/issue-watcher/watchers", {
      success: Schema.Array(IssueWatcher.Info),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.list",
        summary: "List issue watchers",
        description: "List active issue watcher rules.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.create", "/api/issue-watcher/watchers", {
      payload: IssueWatcher.CreateInput,
      success: IssueWatcher.Info,
      error: IssueWatcherOwnerConflict,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.create",
        summary: "Create issue watcher",
        description: "Create an issue watcher rule.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.get", "/api/issue-watcher/watchers/:watcherID", {
      params: { watcherID: IssueWatcher.ID },
      success: IssueWatcher.Info,
      error: IssueWatcherNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.get",
        summary: "Get issue watcher",
        description: "Get one issue watcher rule.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.patch("issueWatcher.update", "/api/issue-watcher/watchers/:watcherID", {
      params: { watcherID: IssueWatcher.ID },
      payload: IssueWatcherUpdatePayload,
      success: IssueWatcher.Info,
      error: IssueWatcherNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.update",
        summary: "Update issue watcher",
        description: "Update an issue watcher rule.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.delete("issueWatcher.archive", "/api/issue-watcher/watchers/:watcherID", {
      params: { watcherID: IssueWatcher.ID },
      success: HttpApiSchema.NoContent,
      error: IssueWatcherNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.archive",
        summary: "Archive issue watcher",
        description: "Disable and archive an issue watcher rule.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.enable", "/api/issue-watcher/watchers/:watcherID/enable", {
      params: { watcherID: IssueWatcher.ID },
      payload: IssueWatcher.EnableInput,
      success: IssueWatcher.Info,
      error: [IssueWatcherNotFoundError, IssueWatcherOwnerConflict],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.enable",
        summary: "Enable issue watcher",
        description: "Enable or disable an issue watcher rule.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({ title: "issue watchers", description: "Global issue watcher rule management routes." }),
  )
