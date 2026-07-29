import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { Integration } from "@opencode-ai/schema/integration"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import {
  InvalidRequestError,
  IssueIntegrationAuthenticationError,
  IssueIntegrationConnectionNotFoundError,
  IssueIntegrationNotFoundError,
  IssueIntegrationProviderError,
  IssueIntegrationTenantConflict,
  IssueWatcherNotFoundError,
  IssueWatcherOwnerConflict,
} from "../errors"

const SourceErrors = [
  InvalidRequestError,
  IssueIntegrationNotFoundError,
  IssueIntegrationConnectionNotFoundError,
  IssueIntegrationAuthenticationError,
  IssueIntegrationProviderError,
] as const

const IssueWatcherUpdatePayload = Schema.Struct({
  ...IssueWatcher.UpdateInput.fields,
  integrationID: Schema.optional(Schema.Never),
  connectionID: Schema.optional(Schema.Never),
}).check(Schema.isMinProperties(1))

export const IssueWatcherGroup = HttpApiGroup.make("server.issueWatcher")
  .add(
    HttpApiEndpoint.get("issueWatcher.sources", "/api/issue-watcher/integrations", {
      success: Schema.Array(IssueWatcher.IntegrationSummary),
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.integration.list", summary: "List issue sources" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.verifySource", "/api/issue-watcher/integrations/:integrationID/verify", {
      params: { integrationID: Integration.ID },
      payload: IssueWatcher.VerificationInput,
      success: IssueWatcher.VerificationResult,
      error: SourceErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.integration.verify", summary: "Verify issue source credentials" })),
  )
  .add(
    HttpApiEndpoint.put("issueWatcher.createConnection", "/api/issue-watcher/integrations/:integrationID/connection", {
      params: { integrationID: Integration.ID },
      payload: IssueWatcher.ConnectionCreateInput,
      success: IssueWatcher.IntegrationSummary,
      error: SourceErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.integration.create", summary: "Create issue source connection" })),
  )
  .add(
    HttpApiEndpoint.patch("issueWatcher.rotateConnection", "/api/issue-watcher/integrations/:integrationID/connection/:connectionID", {
      params: { integrationID: Integration.ID, connectionID: IssueWatcher.ConnectionID },
      payload: IssueWatcher.ConnectionRotateInput,
      success: IssueWatcher.IntegrationSummary,
      error: [...SourceErrors, IssueIntegrationTenantConflict],
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.integration.rotate", summary: "Rotate issue source credentials" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.getSettings", "/api/issue-watcher/settings", {
      success: IssueWatcher.Settings,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.settings.get", summary: "Get issue watcher settings" })),
  )
  .add(
    HttpApiEndpoint.patch("issueWatcher.updateSettings", "/api/issue-watcher/settings", {
      payload: IssueWatcher.SettingsInput,
      success: IssueWatcher.Settings,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.settings.update", summary: "Update issue watcher settings" })),
  )
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
