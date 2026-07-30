import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"
import { IssueMatch } from "@opencode-ai/schema/issue-match"
import { Integration } from "@opencode-ai/schema/integration"
import { SessionProvenance } from "@opencode-ai/schema/session-provenance"
import { SessionID } from "@opencode-ai/schema/session-id"
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
  IssueWatcherRunConflict,
  InvalidCursorError,
} from "../errors"

export class IssueMatchNotFoundError extends Schema.TaggedErrorClass<IssueMatchNotFoundError>()(
  "IssueMatchNotFoundError",
  { matchID: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class IssueMatchConflictError extends Schema.TaggedErrorClass<IssueMatchConflictError>()(
  "IssueMatchConflictError",
  { matchID: Schema.String, message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class IssueWatcherProjectNotFoundError extends Schema.TaggedErrorClass<IssueWatcherProjectNotFoundError>()(
  "IssueWatcherProjectNotFoundError",
  { projectID: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class IssueWatcherSessionNotFoundError extends Schema.TaggedErrorClass<IssueWatcherSessionNotFoundError>()(
  "IssueWatcherSessionNotFoundError",
  { sessionID: Schema.String, message: Schema.String },
  { httpApiStatus: 404 },
) {}

const MatchErrors = [IssueMatchNotFoundError, IssueMatchConflictError] as const
const MaterializationErrors = [...MatchErrors, IssueWatcherProjectNotFoundError] as const

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

const PageLimit = Schema.NumberFromString.pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(100))),
  Schema.optional,
)

const PageQuery = Schema.Struct({ cursor: IssueWatcher.PageCursor.pipe(Schema.optional), limit: PageLimit })

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
    HttpApiEndpoint.post("issueWatcher.metadata", "/api/issue-watcher/integrations/:integrationID/connection/:connectionID/metadata", {
      params: { integrationID: Integration.ID, connectionID: IssueWatcher.ConnectionID },
      payload: IssueWatcher.MetadataInput,
      success: IssueWatcher.Metadata,
      error: SourceErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.integration.metadata", summary: "List issue source metadata" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.preview", "/api/issue-watcher/preview", {
      payload: IssueWatcher.PreviewInput,
      success: IssueWatcher.Preview,
      error: SourceErrors,
    }).annotateMerge(OpenApi.annotations({
      identifier: "v2.issueWatcher.preview",
      summary: "Preview an issue watcher",
      description: "Search and preview at most 100 issues without persisting watcher state or advancing a cursor.",
    })),
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
      success: Schema.Array(IssueWatcher.Summary),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.issueWatcher.list",
        summary: "List issue watchers",
        description: "List active issue watcher rules.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.runAll", "/api/issue-watcher/watchers/run", {
      success: Schema.Array(IssueWatcher.Run),
      error: [IssueWatcherOwnerConflict, IssueWatcherRunConflict],
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.runAll", summary: "Run all issue watchers" })),
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
    HttpApiEndpoint.post("issueWatcher.run", "/api/issue-watcher/watchers/:watcherID/run", {
      params: { watcherID: IssueWatcher.ID },
      success: IssueWatcher.Run,
      error: [IssueWatcherNotFoundError, IssueWatcherOwnerConflict, IssueWatcherRunConflict],
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.run", summary: "Run an issue watcher" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.history", "/api/issue-watcher/watchers/:watcherID/history", {
      params: { watcherID: IssueWatcher.ID },
      query: PageQuery,
      success: IssueWatcher.HistoryPage,
      error: [IssueWatcherNotFoundError, InvalidCursorError],
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.history", summary: "Get issue watcher history" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.ignores", "/api/issue-watcher/watchers/:watcherID/ignore", {
      params: { watcherID: IssueWatcher.ID },
      success: Schema.Array(IssueWatcher.Ignore),
      error: IssueWatcherNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.ignore.list", summary: "List ignored issues" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.inbox", "/api/issue-watcher/inbox", {
      query: Schema.Struct({
        ...PageQuery.fields,
        state: IssueMatch.Info.fields.state.pipe(Schema.optional),
        integrationID: Integration.ID.pipe(Schema.optional),
        filter: IssueWatcher.InboxFilter.pipe(Schema.optional),
      }),
      success: IssueWatcher.InboxPage,
      error: InvalidCursorError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox", summary: "List issue watcher inbox" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.inboxSummary", "/api/issue-watcher/inbox/summary", {
      success: IssueWatcher.InboxSummary,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.summary", summary: "Get issue watcher inbox summary" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.bulk", "/api/issue-watcher/inbox/bulk", {
      payload: IssueWatcher.BulkInput,
      success: IssueWatcher.BulkResult,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.bulk", summary: "Apply a bulk inbox action" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.approve", "/api/issue-watcher/inbox/:matchID/approve", {
      params: { matchID: IssueMatch.ID },
      payload: IssueWatcher.MaterializeInput,
      success: IssueWatcher.MaterializeResult,
      error: MaterializationErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.approve", summary: "Approve an inbox match" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.routeMatch", "/api/issue-watcher/inbox/:matchID/route", {
      params: { matchID: IssueMatch.ID },
      payload: IssueWatcher.RouteInput,
      success: HttpApiSchema.NoContent,
      error: MaterializationErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.route", summary: "Route an inbox match" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.skip", "/api/issue-watcher/inbox/:matchID/skip", {
      params: { matchID: IssueMatch.ID },
      success: HttpApiSchema.NoContent,
      error: MatchErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.skip", summary: "Skip an inbox match" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.dismiss", "/api/issue-watcher/inbox/:matchID/dismiss", {
      params: { matchID: IssueMatch.ID },
      success: HttpApiSchema.NoContent,
      error: MatchErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.dismiss", summary: "Dismiss an inbox match" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.rematerialize", "/api/issue-watcher/inbox/:matchID/rematerialize", {
      params: { matchID: IssueMatch.ID },
      payload: IssueWatcher.MaterializeInput,
      success: IssueWatcher.MaterializeResult,
      error: MaterializationErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.rematerialize", summary: "Rematerialize an inbox match" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.duplicateDetail", "/api/issue-watcher/inbox/:matchID/duplicate", {
      params: { matchID: IssueMatch.ID },
      success: IssueWatcher.DuplicateDetail,
      error: MatchErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.duplicate.get", summary: "Get duplicate match detail" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.resolveDuplicate", "/api/issue-watcher/inbox/:matchID/duplicate", {
      params: { matchID: IssueMatch.ID },
      payload: IssueWatcher.DuplicateResolutionInput,
      success: IssueWatcher.DuplicateResolutionResult,
      error: MaterializationErrors,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.inbox.duplicate.resolve", summary: "Resolve a duplicate match" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.addIgnore", "/api/issue-watcher/watchers/:watcherID/ignore", {
      params: { watcherID: IssueWatcher.ID },
      payload: IssueWatcher.IgnoreInput,
      success: IssueWatcher.Ignore,
      error: IssueWatcherNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.ignore.add", summary: "Ignore an issue" })),
  )
  .add(
    HttpApiEndpoint.delete("issueWatcher.removeIgnore", "/api/issue-watcher/watchers/:watcherID/ignore/:externalID", {
      params: { watcherID: IssueWatcher.ID, externalID: Schema.String },
      success: HttpApiSchema.NoContent,
      error: IssueWatcherNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.ignore.remove", summary: "Remove an ignored issue" })),
  )
  .add(
    HttpApiEndpoint.get("issueWatcher.provenanceDetail", "/api/issue-watcher/sessions/:sessionID", {
      params: { sessionID: SessionID },
      success: SessionProvenance.Detail,
      error: IssueWatcherSessionNotFoundError,
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.session.get", summary: "Get session issue provenance" })),
  )
  .add(
    HttpApiEndpoint.post("issueWatcher.syncProvenance", "/api/issue-watcher/sessions/:sessionID/sync", {
      params: { sessionID: SessionID },
      success: SessionProvenance.Detail,
      error: [IssueWatcherSessionNotFoundError, ...SourceErrors],
    }).annotateMerge(OpenApi.annotations({ identifier: "v2.issueWatcher.session.sync", summary: "Sync session issue provenance" })),
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
