import type { OpenCodeEventEncoded } from "@opencode-ai/protocol/groups/event"

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export type UnauthorizedError = { readonly _tag: "UnauthorizedError"; readonly message: string }
export const isUnauthorizedError = (value: unknown): value is UnauthorizedError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnauthorizedError"

export type InvalidRequestError = {
  readonly _tag: "InvalidRequestError"
  readonly message: string
  readonly kind?: string | undefined
  readonly field?: string | undefined
}
export const isInvalidRequestError = (value: unknown): value is InvalidRequestError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidRequestError"

export type IssueIntegrationNotFoundError = {
  readonly _tag: "IssueIntegrationNotFoundError"
  readonly integrationID: string
  readonly message: string
}
export const isIssueIntegrationNotFoundError = (value: unknown): value is IssueIntegrationNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueIntegrationNotFoundError"

export type IssueIntegrationConnectionNotFoundError = {
  readonly _tag: "IssueIntegrationConnectionNotFoundError"
  readonly connectionID: string
  readonly message: string
}
export const isIssueIntegrationConnectionNotFoundError = (
  value: unknown,
): value is IssueIntegrationConnectionNotFoundError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value["_tag"] === "IssueIntegrationConnectionNotFoundError"

export type IssueIntegrationAuthenticationError = {
  readonly _tag: "IssueIntegrationAuthenticationError"
  readonly message: string
}
export const isIssueIntegrationAuthenticationError = (value: unknown): value is IssueIntegrationAuthenticationError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value["_tag"] === "IssueIntegrationAuthenticationError"

export type IssueIntegrationProviderError = { readonly _tag: "IssueIntegrationProviderError"; readonly message: string }
export const isIssueIntegrationProviderError = (value: unknown): value is IssueIntegrationProviderError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueIntegrationProviderError"

export type IssueIntegrationTenantConflict = {
  readonly _tag: "IssueIntegrationTenantConflict"
  readonly connectionID: string
  readonly message: string
}
export const isIssueIntegrationTenantConflict = (value: unknown): value is IssueIntegrationTenantConflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueIntegrationTenantConflict"

export type IssueWatcherOwnerConflict = { readonly _tag: "IssueWatcherOwnerConflict"; readonly message: string }
export const isIssueWatcherOwnerConflict = (value: unknown): value is IssueWatcherOwnerConflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueWatcherOwnerConflict"

export type IssueWatcherRunConflict = {
  readonly _tag: "IssueWatcherRunConflict"
  readonly watcherID: string
  readonly message: string
}
export const isIssueWatcherRunConflict = (value: unknown): value is IssueWatcherRunConflict =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueWatcherRunConflict"

export type IssueWatcherNotFoundError = {
  readonly _tag: "IssueWatcherNotFoundError"
  readonly watcherID: string
  readonly message: string
}
export const isIssueWatcherNotFoundError = (value: unknown): value is IssueWatcherNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "IssueWatcherNotFoundError"

export type InvalidCursorError = { readonly _tag: "InvalidCursorError"; readonly message: string }
export const isInvalidCursorError = (value: unknown): value is InvalidCursorError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidCursorError"

export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}
export const isSessionNotFoundError = (value: unknown): value is SessionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "SessionNotFoundError"

export type ConflictError = {
  readonly _tag: "ConflictError"
  readonly message: string
  readonly resource?: string | undefined
}
export const isConflictError = (value: unknown): value is ConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ConflictError"

export type SessionInputNotFoundError = {
  readonly _tag: "SessionInput.NotFoundError"
  readonly sessionID: string
  readonly messageID: string
}
export const isSessionInputNotFoundError = (value: unknown): value is SessionInputNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "SessionInput.NotFoundError"

export type SessionInputLifecycleConflictError = {
  readonly _tag: "SessionInput.LifecycleConflictError"
  readonly sessionID: string
  readonly messageID: string
  readonly state: "promoted" | "cancelled" | "claimed"
}
export const isSessionInputLifecycleConflictError = (value: unknown): value is SessionInputLifecycleConflictError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value["_tag"] === "SessionInput.LifecycleConflictError"

export type SessionInputAttemptConflictError = {
  readonly _tag: "SessionInput.AttemptConflictError"
  readonly sessionID: string
  readonly messageID: string
  readonly attemptID: string
}
export const isSessionInputAttemptConflictError = (value: unknown): value is SessionInputAttemptConflictError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value["_tag"] === "SessionInput.AttemptConflictError"

export type SessionInputPendingConflictError = {
  readonly _tag: "SessionInput.PendingConflictError"
  readonly sessionID: string
  readonly expectedMessageID: string
  readonly pendingMessageIDs: ReadonlyArray<string>
}
export const isSessionInputPendingConflictError = (value: unknown): value is SessionInputPendingConflictError =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value["_tag"] === "SessionInput.PendingConflictError"

export type UnknownError = {
  readonly _tag: "UnknownError"
  readonly message: string
  readonly ref?: string | undefined
}
export const isUnknownError = (value: unknown): value is UnknownError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnknownError"

export type ServiceUnavailableError = {
  readonly _tag: "ServiceUnavailableError"
  readonly message: string
  readonly service?: string | undefined
}
export const isServiceUnavailableError = (value: unknown): value is ServiceUnavailableError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ServiceUnavailableError"

export type MessageNotFoundError = {
  readonly _tag: "MessageNotFoundError"
  readonly sessionID: string
  readonly messageID: string
  readonly message: string
}
export const isMessageNotFoundError = (value: unknown): value is MessageNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "MessageNotFoundError"

export type ProviderNotFoundError = {
  readonly _tag: "ProviderNotFoundError"
  readonly providerID: string
  readonly message: string
}
export const isProviderNotFoundError = (value: unknown): value is ProviderNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ProviderNotFoundError"

export type PermissionNotFoundError = {
  readonly _tag: "PermissionNotFoundError"
  readonly requestID: string
  readonly message: string
}
export const isPermissionNotFoundError = (value: unknown): value is PermissionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PermissionNotFoundError"

export type PtyNotFoundError = { readonly _tag: "PtyNotFoundError"; readonly ptyID: string; readonly message: string }
export const isPtyNotFoundError = (value: unknown): value is PtyNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PtyNotFoundError"

export type QuestionNotFoundError = {
  readonly _tag: "QuestionNotFoundError"
  readonly requestID: string
  readonly message: string
}
export const isQuestionNotFoundError = (value: unknown): value is QuestionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "QuestionNotFoundError"

export type ProjectCopyError = {
  readonly name: "ProjectCopyError"
  readonly data: { readonly message: string; readonly forceRequired?: boolean | undefined }
}
export const isProjectCopyError = (value: unknown): value is ProjectCopyError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "ProjectCopyError"

export type HealthGetOutput = { readonly healthy: true }

export type IssueWatchersSourcesOutput = ReadonlyArray<{
  readonly integration: {
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | {
          readonly type: "key"
          readonly label?: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  }
  readonly connection?: {
    readonly id: string
    readonly label: string
    readonly tenantIdentity: string
    readonly inputs: { readonly [x: string]: string }
    readonly verification: {
      readonly status: "connected" | "needs_auth" | "not_connected"
      readonly detail: string
      readonly checkedAt: number
    }
  }
  readonly watcherCount: number
  readonly lastPollAt?: number
  readonly owner: { readonly status: "active" | "owner_conflict" | "disabled"; readonly detail?: string }
}>

export type IssueWatchersVerifySourceInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly key?: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly useSavedConnection?: boolean
  }["key"]
  readonly inputs: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly useSavedConnection?: boolean
  }["inputs"]
  readonly useSavedConnection?: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly useSavedConnection?: boolean
  }["useSavedConnection"]
}

export type IssueWatchersVerifySourceOutput = { readonly ok: boolean; readonly detail: string }

export type IssueWatchersCreateConnectionInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly key: {
    readonly key: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["key"]
  readonly inputs: {
    readonly key: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["inputs"]
  readonly label?: {
    readonly key: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["label"]
}

export type IssueWatchersCreateConnectionOutput = {
  readonly integration: {
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | {
          readonly type: "key"
          readonly label?: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  }
  readonly connection?: {
    readonly id: string
    readonly label: string
    readonly tenantIdentity: string
    readonly inputs: { readonly [x: string]: string }
    readonly verification: {
      readonly status: "connected" | "needs_auth" | "not_connected"
      readonly detail: string
      readonly checkedAt: number
    }
  }
  readonly watcherCount: number
  readonly lastPollAt?: number
  readonly owner: { readonly status: "active" | "owner_conflict" | "disabled"; readonly detail?: string }
}

export type IssueWatchersRotateConnectionInput = {
  readonly integrationID: { readonly integrationID: string; readonly connectionID: string }["integrationID"]
  readonly connectionID: { readonly integrationID: string; readonly connectionID: string }["connectionID"]
  readonly key?: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["key"]
  readonly inputs: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["inputs"]
  readonly label?: {
    readonly key?: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string
  }["label"]
}

export type IssueWatchersRotateConnectionOutput = {
  readonly integration: {
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | {
          readonly type: "key"
          readonly label?: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  }
  readonly connection?: {
    readonly id: string
    readonly label: string
    readonly tenantIdentity: string
    readonly inputs: { readonly [x: string]: string }
    readonly verification: {
      readonly status: "connected" | "needs_auth" | "not_connected"
      readonly detail: string
      readonly checkedAt: number
    }
  }
  readonly watcherCount: number
  readonly lastPollAt?: number
  readonly owner: { readonly status: "active" | "owner_conflict" | "disabled"; readonly detail?: string }
}

export type IssueWatchersPreviewInput = {
  readonly integrationID: {
    readonly integrationID: string
    readonly connectionID: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["integrationID"]
  readonly connectionID: {
    readonly integrationID: string
    readonly connectionID: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["connectionID"]
  readonly criteria: {
    readonly integrationID: string
    readonly connectionID: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["criteria"]
  readonly routing: {
    readonly integrationID: string
    readonly connectionID: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["routing"]
  readonly action: {
    readonly integrationID: string
    readonly connectionID: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["action"]
}

export type IssueWatchersPreviewOutput = {
  readonly matches: ReadonlyArray<{
    readonly issue: {
      readonly id: string
      readonly key: string
      readonly title: string
      readonly description: string
      readonly url: string
      readonly status: string
      readonly assignee?: { readonly id: string; readonly name: string }
      readonly labels: ReadonlyArray<string>
      readonly issueProject: string
      readonly component?: string
      readonly acceptanceCriteria?: string
      readonly repoField?: string
      readonly updatedAt: number
      readonly raw: JsonValue
    }
    readonly route:
      | { readonly projectID: string; readonly reason: string }
      | { readonly unrouted: true; readonly reason: string; readonly suggestion?: string }
    readonly prompt: string
    readonly writeback: {
      readonly comment?: string
      readonly transitionOnStart?: string
      readonly commentOnFailure?: string
    }
  }>
  readonly truncated: boolean
}

export type IssueWatchersGetSettingsOutput = {
  readonly pollInterval: number
  readonly concurrentRuns: number
  readonly retryFailedRuns: "never" | "once"
  readonly owner: { readonly status: "active" | "owner_conflict" | "disabled"; readonly detail?: string }
}

export type IssueWatchersUpdateSettingsInput = {
  readonly pollInterval: {
    readonly pollInterval: number
    readonly concurrentRuns: number
    readonly retryFailedRuns: "never" | "once"
  }["pollInterval"]
  readonly concurrentRuns: {
    readonly pollInterval: number
    readonly concurrentRuns: number
    readonly retryFailedRuns: "never" | "once"
  }["concurrentRuns"]
  readonly retryFailedRuns: {
    readonly pollInterval: number
    readonly concurrentRuns: number
    readonly retryFailedRuns: "never" | "once"
  }["retryFailedRuns"]
}

export type IssueWatchersUpdateSettingsOutput = {
  readonly pollInterval: number
  readonly concurrentRuns: number
  readonly retryFailedRuns: "never" | "once"
  readonly owner: { readonly status: "active" | "owner_conflict" | "disabled"; readonly detail?: string }
}

export type IssueWatchersListOutput = ReadonlyArray<{
  readonly watcher: {
    readonly id: string
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly cursor?: string
    readonly lastRunAt?: number
    readonly lastError?: string
    readonly archivedAt?: number
    readonly timeCreated: number
    readonly timeUpdated: number
  }
  readonly sourceName: string
  readonly sourceGlyph: string
  readonly connection?: {
    readonly id: string
    readonly label: string
    readonly tenantIdentity: string
    readonly inputs: { readonly [x: string]: string }
    readonly verification: {
      readonly status: "connected" | "needs_auth" | "not_connected"
      readonly detail: string
      readonly checkedAt: number
    }
  }
  readonly lastRun?: {
    readonly id: string
    readonly watcherID: string
    readonly startedAt: number
    readonly finishedAt?: number
    readonly outcome: "ok" | "throttled" | "auth_failed" | "error"
    readonly scanned: number
    readonly matched: number
    readonly created: number
    readonly queued: number
    readonly unrouted: number
    readonly skipped: number
    readonly failed: number
    readonly cursor?: string
    readonly error?: string
  }
  readonly recentMatchCount: number
}>

export type IssueWatchersRunAllOutput = ReadonlyArray<{
  readonly id: string
  readonly watcherID: string
  readonly startedAt: number
  readonly finishedAt?: number
  readonly outcome: "ok" | "throttled" | "auth_failed" | "error"
  readonly scanned: number
  readonly matched: number
  readonly created: number
  readonly queued: number
  readonly unrouted: number
  readonly skipped: number
  readonly failed: number
  readonly cursor?: string
  readonly error?: string
}>

export type IssueWatchersCreateInput = {
  readonly integrationID: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["integrationID"]
  readonly connectionID: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["connectionID"]
  readonly name: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["name"]
  readonly enabled?: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["enabled"]
  readonly projectID?: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["projectID"]
  readonly criteria: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["criteria"]
  readonly routing: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["routing"]
  readonly action: {
    readonly integrationID: string
    readonly connectionID: string
    readonly name: string
    readonly enabled?: boolean
    readonly projectID?: string
    readonly criteria: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
  }["action"]
}

export type IssueWatchersCreateOutput = {
  readonly id: string
  readonly integrationID: string
  readonly connectionID: string
  readonly name: string
  readonly enabled: boolean
  readonly projectID?: string
  readonly criteria: {
    readonly issueProjects: ReadonlyArray<string>
    readonly assignee?: "me" | { readonly id: string }
    readonly labels?: ReadonlyArray<string>
    readonly statuses?: ReadonlyArray<string>
    readonly watchUpdates: boolean
    readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
  }
  readonly routing: {
    readonly repoField?: { readonly fieldName: string }
    readonly mappings: ReadonlyArray<{
      readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
      readonly projectID: string
    }>
    readonly fallback: "inbox"
    readonly workspace:
      | { readonly type: "branch"; readonly pattern: string }
      | { readonly type: "current" }
      | { readonly type: "worktree" }
  }
  readonly action: {
    readonly mode: "inbox" | "awaiting_run" | "run"
    readonly promptTemplate: string
    readonly writeback: {
      readonly comment: boolean
      readonly transitionOnStart?: string
      readonly commentOnFailure: boolean
    }
  }
  readonly cursor?: string
  readonly lastRunAt?: number
  readonly lastError?: string
  readonly archivedAt?: number
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type IssueWatchersGetInput = { readonly watcherID: { readonly watcherID: string }["watcherID"] }

export type IssueWatchersGetOutput = {
  readonly id: string
  readonly integrationID: string
  readonly connectionID: string
  readonly name: string
  readonly enabled: boolean
  readonly projectID?: string
  readonly criteria: {
    readonly issueProjects: ReadonlyArray<string>
    readonly assignee?: "me" | { readonly id: string }
    readonly labels?: ReadonlyArray<string>
    readonly statuses?: ReadonlyArray<string>
    readonly watchUpdates: boolean
    readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
  }
  readonly routing: {
    readonly repoField?: { readonly fieldName: string }
    readonly mappings: ReadonlyArray<{
      readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
      readonly projectID: string
    }>
    readonly fallback: "inbox"
    readonly workspace:
      | { readonly type: "branch"; readonly pattern: string }
      | { readonly type: "current" }
      | { readonly type: "worktree" }
  }
  readonly action: {
    readonly mode: "inbox" | "awaiting_run" | "run"
    readonly promptTemplate: string
    readonly writeback: {
      readonly comment: boolean
      readonly transitionOnStart?: string
      readonly commentOnFailure: boolean
    }
  }
  readonly cursor?: string
  readonly lastRunAt?: number
  readonly lastError?: string
  readonly archivedAt?: number
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type IssueWatchersUpdateInput = {
  readonly watcherID: { readonly watcherID: string }["watcherID"]
  readonly name?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["name"]
  readonly projectID?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["projectID"]
  readonly criteria?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["criteria"]
  readonly routing?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["routing"]
  readonly action?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["action"]
  readonly integrationID?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["integrationID"]
  readonly connectionID?: {
    readonly name?: string
    readonly projectID?: string
    readonly criteria?: {
      readonly issueProjects: ReadonlyArray<string>
      readonly assignee?: "me" | { readonly id: string }
      readonly labels?: ReadonlyArray<string>
      readonly statuses?: ReadonlyArray<string>
      readonly watchUpdates: boolean
      readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
    }
    readonly routing?: {
      readonly repoField?: { readonly fieldName: string }
      readonly mappings: ReadonlyArray<{
        readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
        readonly projectID: string
      }>
      readonly fallback: "inbox"
      readonly workspace:
        | { readonly type: "branch"; readonly pattern: string }
        | { readonly type: "current" }
        | { readonly type: "worktree" }
    }
    readonly action?: {
      readonly mode: "inbox" | "awaiting_run" | "run"
      readonly promptTemplate: string
      readonly writeback: {
        readonly comment: boolean
        readonly transitionOnStart?: string
        readonly commentOnFailure: boolean
      }
    }
    readonly integrationID?: never | null
    readonly connectionID?: never | null
  }["connectionID"]
}

export type IssueWatchersUpdateOutput = {
  readonly id: string
  readonly integrationID: string
  readonly connectionID: string
  readonly name: string
  readonly enabled: boolean
  readonly projectID?: string
  readonly criteria: {
    readonly issueProjects: ReadonlyArray<string>
    readonly assignee?: "me" | { readonly id: string }
    readonly labels?: ReadonlyArray<string>
    readonly statuses?: ReadonlyArray<string>
    readonly watchUpdates: boolean
    readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
  }
  readonly routing: {
    readonly repoField?: { readonly fieldName: string }
    readonly mappings: ReadonlyArray<{
      readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
      readonly projectID: string
    }>
    readonly fallback: "inbox"
    readonly workspace:
      | { readonly type: "branch"; readonly pattern: string }
      | { readonly type: "current" }
      | { readonly type: "worktree" }
  }
  readonly action: {
    readonly mode: "inbox" | "awaiting_run" | "run"
    readonly promptTemplate: string
    readonly writeback: {
      readonly comment: boolean
      readonly transitionOnStart?: string
      readonly commentOnFailure: boolean
    }
  }
  readonly cursor?: string
  readonly lastRunAt?: number
  readonly lastError?: string
  readonly archivedAt?: number
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type IssueWatchersArchiveInput = { readonly watcherID: { readonly watcherID: string }["watcherID"] }

export type IssueWatchersArchiveOutput = void

export type IssueWatchersRunInput = { readonly watcherID: { readonly watcherID: string }["watcherID"] }

export type IssueWatchersRunOutput = {
  readonly id: string
  readonly watcherID: string
  readonly startedAt: number
  readonly finishedAt?: number
  readonly outcome: "ok" | "throttled" | "auth_failed" | "error"
  readonly scanned: number
  readonly matched: number
  readonly created: number
  readonly queued: number
  readonly unrouted: number
  readonly skipped: number
  readonly failed: number
  readonly cursor?: string
  readonly error?: string
}

export type IssueWatchersHistoryInput = {
  readonly watcherID: { readonly watcherID: string }["watcherID"]
  readonly cursor?: { readonly cursor?: string | undefined; readonly limit?: number | undefined }["cursor"]
  readonly limit?: { readonly cursor?: string | undefined; readonly limit?: number | undefined }["limit"]
}

export type IssueWatchersHistoryOutput = {
  readonly items: ReadonlyArray<
    | {
        readonly type: "run"
        readonly run: {
          readonly id: string
          readonly watcherID: string
          readonly startedAt: number
          readonly finishedAt?: number
          readonly outcome: "ok" | "throttled" | "auth_failed" | "error"
          readonly scanned: number
          readonly matched: number
          readonly created: number
          readonly queued: number
          readonly unrouted: number
          readonly skipped: number
          readonly failed: number
          readonly cursor?: string
          readonly error?: string
        }
      }
    | {
        readonly type: "observation"
        readonly observation: {
          readonly id: string
          readonly matchID: string
          readonly runID: string
          readonly fingerprint: string
          readonly externalUpdatedAt: number
          readonly payload: {
            readonly id: string
            readonly key: string
            readonly title: string
            readonly description: string
            readonly url: string
            readonly status: string
            readonly assignee?: { readonly id: string; readonly name: string }
            readonly labels: ReadonlyArray<string>
            readonly issueProject: string
            readonly component?: string
            readonly acceptanceCriteria?: string
            readonly repoField?: string
            readonly updatedAt: number
            readonly raw: JsonValue
          }
          readonly timeCreated: number
          readonly timeUpdated: number
        }
      }
  >
  readonly nextCursor?: string
}

export type IssueWatchersIgnoresInput = { readonly watcherID: { readonly watcherID: string }["watcherID"] }

export type IssueWatchersIgnoresOutput = ReadonlyArray<{
  readonly watcherID: string
  readonly externalID: string
  readonly reason?: string
  readonly timeCreated: number
  readonly timeUpdated: number
}>

export type IssueWatchersInboxInput = {
  readonly cursor?: {
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly state?: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted" | undefined
    readonly integrationID?: string | undefined
    readonly filter?: "attention" | undefined
  }["cursor"]
  readonly limit?: {
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly state?: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted" | undefined
    readonly integrationID?: string | undefined
    readonly filter?: "attention" | undefined
  }["limit"]
  readonly state?: {
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly state?: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted" | undefined
    readonly integrationID?: string | undefined
    readonly filter?: "attention" | undefined
  }["state"]
  readonly integrationID?: {
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly state?: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted" | undefined
    readonly integrationID?: string | undefined
    readonly filter?: "attention" | undefined
  }["integrationID"]
  readonly filter?: {
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly state?: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted" | undefined
    readonly integrationID?: string | undefined
    readonly filter?: "attention" | undefined
  }["filter"]
}

export type IssueWatchersInboxOutput = {
  readonly items: ReadonlyArray<{
    readonly match: {
      readonly id: string
      readonly watcherID: string
      readonly integrationID: string
      readonly connectionID: string
      readonly externalID: string
      readonly externalKey: string
      readonly externalUrl: string
      readonly fingerprint: string
      readonly externalUpdatedAt: number
      readonly state: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted"
      readonly projectID?: string
      readonly routeReason?: string
      readonly payload: {
        readonly id: string
        readonly key: string
        readonly title: string
        readonly description: string
        readonly url: string
        readonly status: string
        readonly assignee?: { readonly id: string; readonly name: string }
        readonly labels: ReadonlyArray<string>
        readonly issueProject: string
        readonly component?: string
        readonly acceptanceCriteria?: string
        readonly repoField?: string
        readonly updatedAt: number
        readonly raw: JsonValue
      }
      readonly error?: string
      readonly timeCreated: number
      readonly timeUpdated: number
    }
    readonly sourceName: string
    readonly sourceGlyph: string
    readonly watcherName: string
    readonly project?: { readonly id: string; readonly name: string }
    readonly suggestion?: { readonly id: string; readonly name: string }
  }>
  readonly nextCursor?: string
}

export type IssueWatchersInboxSummaryOutput = {
  readonly pending: number
  readonly unrouted: number
  readonly duplicate: number
  readonly failedMaterializations: number
  readonly sessionsOpenedThisWeek: number
  readonly failedRuns: number
}

export type IssueWatchersEnableInput = {
  readonly watcherID: { readonly watcherID: string }["watcherID"]
  readonly enabled: { readonly enabled: boolean }["enabled"]
}

export type IssueWatchersEnableOutput = {
  readonly id: string
  readonly integrationID: string
  readonly connectionID: string
  readonly name: string
  readonly enabled: boolean
  readonly projectID?: string
  readonly criteria: {
    readonly issueProjects: ReadonlyArray<string>
    readonly assignee?: "me" | { readonly id: string }
    readonly labels?: ReadonlyArray<string>
    readonly statuses?: ReadonlyArray<string>
    readonly watchUpdates: boolean
    readonly escape?: { readonly language: "jql" | "linear-filter" | "github-search"; readonly query: string }
  }
  readonly routing: {
    readonly repoField?: { readonly fieldName: string }
    readonly mappings: ReadonlyArray<{
      readonly key: { readonly type: "label" | "component" | "issueProject"; readonly value: string }
      readonly projectID: string
    }>
    readonly fallback: "inbox"
    readonly workspace:
      | { readonly type: "branch"; readonly pattern: string }
      | { readonly type: "current" }
      | { readonly type: "worktree" }
  }
  readonly action: {
    readonly mode: "inbox" | "awaiting_run" | "run"
    readonly promptTemplate: string
    readonly writeback: {
      readonly comment: boolean
      readonly transitionOnStart?: string
      readonly commentOnFailure: boolean
    }
  }
  readonly cursor?: string
  readonly lastRunAt?: number
  readonly lastError?: string
  readonly archivedAt?: number
  readonly timeCreated: number
  readonly timeUpdated: number
}

export type LocationGetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type LocationGetOutput = {
  readonly directory: string
  readonly workspaceID?: string
  readonly project: { readonly id: string; readonly directory: string }
}

export type AgentsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AgentsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
    readonly system?: string
    readonly description?: string
    readonly mode: "subagent" | "primary" | "all"
    readonly hidden: boolean
    readonly color?: string | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
    readonly steps?: number
    readonly permissions: ReadonlyArray<{
      readonly action: string
      readonly resource: string
      readonly effect: "allow" | "deny" | "ask"
    }>
  }>
}

export type SessionsListInput = {
  readonly workspace?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["workspace"]
  readonly limit?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly search?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["directory"]
  readonly project?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["project"]
  readonly subpath?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["subpath"]
  readonly cursor?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type SessionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly status: "running" | "handoff_unknown" | "awaiting_run" | "idle"
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
    readonly provenance?: {
      readonly type: "issue"
      readonly integrationID: string
      readonly externalKey: string
      readonly externalUrl: string
      readonly watcherID?: string
      readonly watcherName: string
      readonly branch?: string
    }
  }>
  readonly cursor: { readonly previous?: string | null; readonly next?: string | null }
}

export type SessionsCreateInput = {
  readonly id?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["id"]
  readonly agent?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["agent"]
  readonly model?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["model"]
  readonly location?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["location"]
}

export type SessionsCreateOutput = {
  readonly data: {
    readonly id: string
    readonly status: "running" | "handoff_unknown" | "awaiting_run" | "idle"
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
    readonly provenance?: {
      readonly type: "issue"
      readonly integrationID: string
      readonly externalKey: string
      readonly externalUrl: string
      readonly watcherID?: string
      readonly watcherName: string
      readonly branch?: string
    }
  }
}["data"]

export type SessionsActiveOutput = { readonly data: { readonly [x: string]: { readonly type: "running" } } }["data"]

export type SessionsGetInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsGetOutput = {
  readonly data: {
    readonly id: string
    readonly status: "running" | "handoff_unknown" | "awaiting_run" | "idle"
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
    readonly provenance?: {
      readonly type: "issue"
      readonly integrationID: string
      readonly externalKey: string
      readonly externalUrl: string
      readonly watcherID?: string
      readonly watcherName: string
      readonly branch?: string
    }
  }
}["data"]

export type SessionsSwitchAgentInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly agent: { readonly agent: string }["agent"]
}

export type SessionsSwitchAgentOutput = void

export type SessionsSwitchModelInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly model: {
    readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
  }["model"]
}

export type SessionsSwitchModelOutput = void

export type SessionsPromptInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly prompt: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["prompt"]
  readonly delivery?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}

export type SessionsPromptOutput = {
  readonly data: {
    readonly admittedSeq: number
    readonly id: string
    readonly sessionID: string
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly mime: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery: "steer" | "queue"
    readonly timeCreated: number
    readonly promotedSeq?: number
    readonly timeUpdated?: number
    readonly cancelledAt?: number
    readonly claimedAttemptID?: string
  }
}["data"]

export type SessionsPendingInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsPendingOutput = ReadonlyArray<{
  readonly admittedSeq: number
  readonly id: string
  readonly sessionID: string
  readonly prompt: {
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly mime: string
      readonly name?: string
      readonly description?: string
      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
    }>
  }
  readonly delivery: "steer" | "queue"
  readonly timeCreated: number
  readonly timeUpdated?: number
}>

export type SessionsReplaceInput = {
  readonly sessionID: { readonly sessionID: string; readonly messageID: string }["sessionID"]
  readonly messageID: { readonly sessionID: string; readonly messageID: string }["messageID"]
  readonly prompt: {
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly mime: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
  }["prompt"]
}

export type SessionsReplaceOutput = {
  readonly admittedSeq: number
  readonly id: string
  readonly sessionID: string
  readonly prompt: {
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly mime: string
      readonly name?: string
      readonly description?: string
      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
    }>
  }
  readonly delivery: "steer" | "queue"
  readonly timeCreated: number
  readonly promotedSeq?: number
  readonly timeUpdated?: number
  readonly cancelledAt?: number
  readonly claimedAttemptID?: string
}

export type SessionsCancelInput = {
  readonly sessionID: { readonly sessionID: string; readonly messageID: string }["sessionID"]
  readonly messageID: { readonly sessionID: string; readonly messageID: string }["messageID"]
}

export type SessionsCancelOutput = void

export type SessionsConfirmInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly attemptID: { readonly attemptID: string; readonly newAttemptID: string }["attemptID"]
  readonly newAttemptID: { readonly attemptID: string; readonly newAttemptID: string }["newAttemptID"]
}

export type SessionsConfirmOutput = { readonly attemptID: string }

export type SessionsResumeInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly expectedMessageID: { readonly expectedMessageID: string; readonly attemptID?: string }["expectedMessageID"]
  readonly attemptID?: { readonly expectedMessageID: string; readonly attemptID?: string }["attemptID"]
}

export type SessionsResumeOutput = { readonly attemptID: string }

export type SessionsCompactInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsCompactOutput = void

export type SessionsWaitInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsWaitOutput = void

export type SessionsStageInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly messageID: { readonly messageID: string; readonly files?: boolean | undefined }["messageID"]
  readonly files?: { readonly messageID: string; readonly files?: boolean | undefined }["files"]
}

export type SessionsStageOutput = {
  readonly data: {
    readonly messageID: string
    readonly partID?: string
    readonly snapshot?: string
    readonly diff?: string
    readonly files?: ReadonlyArray<{
      readonly path: string
      readonly status: "added" | "modified" | "deleted"
      readonly additions: number
      readonly deletions: number
      readonly patch: string
    }>
  }
}["data"]

export type SessionsClearInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsClearOutput = void

export type SessionsCommitInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsCommitOutput = void

export type SessionsContextInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsContextOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
  >
}["data"]

export type SessionsHistoryInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly limit?: { readonly limit?: number | undefined; readonly after?: number | undefined }["limit"]
  readonly after?: { readonly limit?: number | undefined; readonly after?: number | undefined }["after"]
}

export type SessionsHistoryOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.deleted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly sessionID: string
          readonly info: {
            readonly id: string
            readonly slug: string
            readonly projectID: string
            readonly workspaceID?: string
            readonly directory: string
            readonly path?: string
            readonly parentID?: string
            readonly summary?: {
              readonly additions: number
              readonly deletions: number
              readonly files: number
              readonly diffs?: ReadonlyArray<{
                readonly file?: string
                readonly patch?: string
                readonly additions: number
                readonly deletions: number
                readonly status?: "added" | "deleted" | "modified"
              }>
            }
            readonly cost?: number
            readonly tokens?: {
              readonly input: number
              readonly output: number
              readonly reasoning: number
              readonly cache: { readonly read: number; readonly write: number }
            }
            readonly share?: { readonly url: string }
            readonly title: string
            readonly agent?: string
            readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
            readonly version: string
            readonly metadata?: { readonly [x: string]: any }
            readonly time: {
              readonly created: number
              readonly updated: number
              readonly compacting?: number
              readonly archived?: number
            }
            readonly permission?: ReadonlyArray<{
              readonly permission: string
              readonly pattern: string
              readonly action: "allow" | "deny" | "ask"
            }>
            readonly revert?: {
              readonly messageID: string
              readonly partID?: string
              readonly snapshot?: string
              readonly diff?: string
            }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.agent.switched"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly agent: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.model.switched"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.moved"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly location: { readonly directory: string; readonly workspaceID?: string }
          readonly subdirectory?: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly prompt: {
            readonly text: string
            readonly files?: ReadonlyArray<{
              readonly uri: string
              readonly mime: string
              readonly name?: string
              readonly description?: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
            readonly agents?: ReadonlyArray<{
              readonly name: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
          }
          readonly delivery: "steer" | "queue"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompt.admitted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly prompt: {
            readonly text: string
            readonly files?: ReadonlyArray<{
              readonly uri: string
              readonly mime: string
              readonly name?: string
              readonly description?: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
            readonly agents?: ReadonlyArray<{
              readonly name: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
          }
          readonly delivery: "steer" | "queue"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompt.replaced"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly prompt: {
            readonly text: string
            readonly files?: ReadonlyArray<{
              readonly uri: string
              readonly mime: string
              readonly name?: string
              readonly description?: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
            readonly agents?: ReadonlyArray<{
              readonly name: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
          }
          readonly delivery: "steer" | "queue"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompt.cancelled"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string; readonly messageID: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompt.claimed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly attemptID: string
          readonly ownerEpoch: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.scheduled"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.completed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.failed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
          readonly failure: { readonly type: string; readonly message: string; readonly retryable?: boolean }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.interrupted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
          readonly interruption: { readonly reason: "user" | "shutdown" | "superseded"; readonly detail?: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.execution.superseded"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attemptID: string
          readonly messageID: string
          readonly ownerEpoch: string
          readonly supersededByAttemptID: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.context.updated"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.synthetic"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.shell.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly callID: string
          readonly command: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.shell.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly callID: string
          readonly output: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly agent: string
          readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
          readonly snapshot?: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly finish: string
          readonly cost: number
          readonly tokens: {
            readonly input: number
            readonly output: number
            readonly reasoning: number
            readonly cache: { readonly read: number; readonly write: number }
          }
          readonly snapshot?: string
          readonly files?: ReadonlyArray<string>
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.failed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly error: { readonly type: "unknown"; readonly message: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.text.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly textID: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.text.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly textID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.input.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly name: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.input.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.called"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly tool: string
          readonly input: { readonly [x: string]: JsonValue }
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.progress"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly structured: { readonly [x: string]: JsonValue }
          readonly content: ReadonlyArray<
            | { readonly type: "text"; readonly text: string }
            | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
          >
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.success"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly structured: { readonly [x: string]: JsonValue }
          readonly content: ReadonlyArray<
            | { readonly type: "text"; readonly text: string }
            | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
          >
          readonly outputPaths?: ReadonlyArray<string>
          readonly result?: JsonValue
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.failed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly error: { readonly type: "unknown"; readonly message: string }
          readonly result?: JsonValue
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.reasoning.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly reasoningID: string
          readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.reasoning.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly reasoningID: string
          readonly text: string
          readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.retried"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attempt: number
          readonly error: {
            readonly message: string
            readonly statusCode?: number
            readonly isRetryable: boolean
            readonly responseHeaders?: { readonly [x: string]: string }
            readonly responseBody?: string
            readonly metadata?: { readonly [x: string]: string }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.compaction.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly reason: "auto" | "manual"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.compaction.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly reason: "auto" | "manual"
          readonly text: string
          readonly recent: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.staged"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly revert: {
            readonly messageID: string
            readonly partID?: string
            readonly snapshot?: string
            readonly diff?: string
            readonly files?: ReadonlyArray<{
              readonly path: string
              readonly status: "added" | "modified" | "deleted"
              readonly additions: number
              readonly deletions: number
              readonly patch: string
            }>
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.cleared"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.committed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string; readonly messageID: string }
      }
  >
  readonly hasMore: boolean
}

export type SessionsEventsInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly after?: { readonly after?: number | undefined }["after"]
}

export type SessionsEventsOutput =
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.deleted"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly sessionID: string
        readonly info: {
          readonly id: string
          readonly slug: string
          readonly projectID: string
          readonly workspaceID?: string
          readonly directory: string
          readonly path?: string
          readonly parentID?: string
          readonly summary?: {
            readonly additions: number
            readonly deletions: number
            readonly files: number
            readonly diffs?: ReadonlyArray<{
              readonly file?: string
              readonly patch?: string
              readonly additions: number
              readonly deletions: number
              readonly status?: "added" | "deleted" | "modified"
            }>
          }
          readonly cost?: number
          readonly tokens?: {
            readonly input: number
            readonly output: number
            readonly reasoning: number
            readonly cache: { readonly read: number; readonly write: number }
          }
          readonly share?: { readonly url: string }
          readonly title: string
          readonly agent?: string
          readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
          readonly version: string
          readonly metadata?: { readonly [x: string]: any }
          readonly time: {
            readonly created: number
            readonly updated: number
            readonly compacting?: number
            readonly archived?: number
          }
          readonly permission?: ReadonlyArray<{
            readonly permission: string
            readonly pattern: string
            readonly action: "allow" | "deny" | "ask"
          }>
          readonly revert?: {
            readonly messageID: string
            readonly partID?: string
            readonly snapshot?: string
            readonly diff?: string
          }
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.agent.switched"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly agent: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.model.switched"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.moved"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly location: { readonly directory: string; readonly workspaceID?: string }
        readonly subdirectory?: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.prompted"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly prompt: {
          readonly text: string
          readonly files?: ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string
            readonly description?: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
          readonly agents?: ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
        }
        readonly delivery: "steer" | "queue"
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.prompt.admitted"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly prompt: {
          readonly text: string
          readonly files?: ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string
            readonly description?: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
          readonly agents?: ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
        }
        readonly delivery: "steer" | "queue"
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.prompt.replaced"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly prompt: {
          readonly text: string
          readonly files?: ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string
            readonly description?: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
          readonly agents?: ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
        }
        readonly delivery: "steer" | "queue"
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.prompt.cancelled"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: { readonly timestamp: number; readonly sessionID: string; readonly messageID: string }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.prompt.claimed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly attemptID: string
        readonly ownerEpoch: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.scheduled"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.completed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.failed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
        readonly failure: { readonly type: string; readonly message: string; readonly retryable?: boolean }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.interrupted"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
        readonly interruption: { readonly reason: "user" | "shutdown" | "superseded"; readonly detail?: string }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.execution.superseded"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attemptID: string
        readonly messageID: string
        readonly ownerEpoch: string
        readonly supersededByAttemptID: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.context.updated"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly text: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.synthetic"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly text: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.shell.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly callID: string
        readonly command: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.shell.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly callID: string
        readonly output: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.step.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly snapshot?: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.step.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly finish: string
        readonly cost: number
        readonly tokens: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly snapshot?: string
        readonly files?: ReadonlyArray<string>
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.step.failed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly error: { readonly type: "unknown"; readonly message: string }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.text.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly textID: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.text.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly textID: string
        readonly text: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.input.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly name: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.input.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly text: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.called"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly tool: string
        readonly input: { readonly [x: string]: unknown }
        readonly provider: {
          readonly executed: boolean
          readonly metadata?: { readonly [x: string]: { readonly [x: string]: unknown } }
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.progress"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly structured: { readonly [x: string]: unknown }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly text: string }
          | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
        >
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.success"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly structured: { readonly [x: string]: unknown }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly text: string }
          | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
        >
        readonly outputPaths?: ReadonlyArray<string>
        readonly result?: unknown
        readonly provider: {
          readonly executed: boolean
          readonly metadata?: { readonly [x: string]: { readonly [x: string]: unknown } }
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.tool.failed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly callID: string
        readonly error: { readonly type: "unknown"; readonly message: string }
        readonly result?: unknown
        readonly provider: {
          readonly executed: boolean
          readonly metadata?: { readonly [x: string]: { readonly [x: string]: unknown } }
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.reasoning.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly reasoningID: string
        readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: unknown } }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.reasoning.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly assistantMessageID: string
        readonly reasoningID: string
        readonly text: string
        readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: unknown } }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.retried"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly attempt: number
        readonly error: {
          readonly message: string
          readonly statusCode?: number
          readonly isRetryable: boolean
          readonly responseHeaders?: { readonly [x: string]: string }
          readonly responseBody?: string
          readonly metadata?: { readonly [x: string]: string }
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.compaction.started"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly reason: "auto" | "manual"
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.compaction.ended"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly messageID: string
        readonly reason: "auto" | "manual"
        readonly text: string
        readonly recent: string
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.revert.staged"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: {
        readonly timestamp: number
        readonly sessionID: string
        readonly revert: {
          readonly messageID: string
          readonly partID?: string
          readonly snapshot?: string
          readonly diff?: string
          readonly files?: ReadonlyArray<{
            readonly path: string
            readonly status: "added" | "modified" | "deleted"
            readonly additions: number
            readonly deletions: number
            readonly patch: string
          }>
        }
      }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.revert.cleared"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: { readonly timestamp: number; readonly sessionID: string }
    }
  | {
      readonly id: string
      readonly metadata?: { readonly [x: string]: unknown }
      readonly type: "session.next.revert.committed"
      readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
      readonly location?: { readonly directory: string; readonly workspaceID?: string }
      readonly data: { readonly timestamp: number; readonly sessionID: string; readonly messageID: string }
    }

export type SessionsInterruptInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsInterruptOutput = void

export type SessionsMessageInput = {
  readonly sessionID: { readonly sessionID: string; readonly messageID: string }["sessionID"]
  readonly messageID: { readonly sessionID: string; readonly messageID: string }["messageID"]
}

export type SessionsMessageOutput = {
  readonly data:
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
}["data"]

export type MessagesListInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly limit?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly cursor?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type MessagesListOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
  >
  readonly cursor: { readonly previous?: string | null; readonly next?: string | null }
}

export type ModelsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ModelsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly providerID: string
    readonly family?: string
    readonly name: string
    readonly api:
      | {
          readonly id: string
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | {
          readonly id: string
          readonly type: "native"
          readonly url?: string
          readonly settings: { readonly [x: string]: JsonValue }
        }
    readonly capabilities: {
      readonly tools: boolean
      readonly input: ReadonlyArray<string>
      readonly output: ReadonlyArray<string>
    }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
      readonly variant?: string
    }
    readonly variants: ReadonlyArray<{
      readonly id: string
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }>
    readonly time: { readonly released: number }
    readonly cost: ReadonlyArray<{
      readonly tier?: { readonly type: "context"; readonly size: number }
      readonly input: number
      readonly output: number
      readonly cache: { readonly read: number; readonly write: number }
    }>
    readonly status: "alpha" | "beta" | "deprecated" | "active"
    readonly enabled: boolean
    readonly limit: { readonly context: number; readonly input?: number; readonly output: number }
  }>
}

export type ProvidersListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProvidersListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly integrationID?: string
    readonly name: string
    readonly disabled?: boolean
    readonly api:
      | {
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | { readonly type: "native"; readonly url?: string; readonly settings: { readonly [x: string]: JsonValue } }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
  }>
}

export type ProvidersGetInput = {
  readonly providerID: { readonly providerID: string }["providerID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProvidersGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly integrationID?: string
    readonly name: string
    readonly disabled?: boolean
    readonly api:
      | {
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | { readonly type: "native"; readonly url?: string; readonly settings: { readonly [x: string]: JsonValue } }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
  }
}

export type IntegrationsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | {
          readonly type: "key"
          readonly label?: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  }>
}

export type IntegrationsGetInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | {
          readonly type: "key"
          readonly label?: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  } | null
}

export type IntegrationsConnectKeyInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly key: { readonly key: string; readonly label?: string | undefined }["key"]
  readonly label?: { readonly key: string; readonly label?: string | undefined }["label"]
}

export type IntegrationsConnectKeyOutput = void

export type IntegrationsConnectOauthInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly methodID: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["methodID"]
  readonly inputs: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["inputs"]
  readonly label?: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["label"]
}

export type IntegrationsConnectOauthOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly attemptID: string
    readonly url: string
    readonly instructions: string
    readonly mode: "auto" | "code"
    readonly time: {
      readonly created: number | "Infinity" | "-Infinity" | "NaN"
      readonly expires: number | "Infinity" | "-Infinity" | "NaN"
    }
  }
}

export type IntegrationsAttemptStatusInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsAttemptStatusOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | {
        readonly status: "pending"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "complete"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "failed"
        readonly message: string
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "expired"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
}

export type IntegrationsAttemptCompleteInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly code?: { readonly code?: string | undefined }["code"]
}

export type IntegrationsAttemptCompleteOutput = void

export type IntegrationsAttemptCancelInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsAttemptCancelOutput = void

export type CredentialsUpdateInput = {
  readonly credentialID: { readonly credentialID: string }["credentialID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly label: { readonly label: string }["label"]
}

export type CredentialsUpdateOutput = void

export type CredentialsRemoveInput = {
  readonly credentialID: { readonly credentialID: string }["credentialID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type CredentialsRemoveOutput = void

export type PermissionsListRequestsInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PermissionsListRequestsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }>
}

export type PermissionsListSavedInput = {
  readonly projectID?: { readonly projectID?: string | undefined }["projectID"]
}

export type PermissionsListSavedOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly projectID: string
    readonly action: string
    readonly resource: string
  }>
}["data"]

export type PermissionsRemoveSavedInput = { readonly id: { readonly id: string }["id"] }

export type PermissionsRemoveSavedOutput = void

export type PermissionsCreateInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["id"]
  readonly action: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["action"]
  readonly resources: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["resources"]
  readonly save?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["save"]
  readonly metadata?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["metadata"]
  readonly source?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["source"]
  readonly agent?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["agent"]
}

export type PermissionsCreateOutput = {
  readonly data: { readonly id: string; readonly effect: "allow" | "deny" | "ask" }
}["data"]

export type PermissionsListInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type PermissionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }>
}["data"]

export type PermissionsGetInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
}

export type PermissionsGetOutput = {
  readonly data: {
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }
}["data"]

export type PermissionsReplyInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
  readonly reply: { readonly reply: "once" | "always" | "reject"; readonly message?: string | undefined }["reply"]
  readonly message?: { readonly reply: "once" | "always" | "reject"; readonly message?: string | undefined }["message"]
}

export type PermissionsReplyOutput = void

export type FilesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path?: string | undefined
  }["location"]
  readonly path?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path?: string | undefined
  }["path"]
}

export type FilesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly path: string; readonly type: "file" | "directory" }>
}

export type FilesFindInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["location"]
  readonly query: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["query"]
  readonly type?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["type"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["limit"]
}

export type FilesFindOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly path: string; readonly type: "file" | "directory" }>
}

export type CommandsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type CommandsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly template: string
    readonly description?: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly subtask?: boolean
  }>
}

export type SkillsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type SkillsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly description?: string
    readonly slash?: boolean
    readonly location: string
    readonly content: string
  }>
}

export type EventsSubscribeOutput = OpenCodeEventEncoded

export type PtysListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }>
}

export type PtysCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly command?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["command"]
  readonly args?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["args"]
  readonly cwd?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["cwd"]
  readonly title?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["title"]
  readonly env?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["env"]
}

export type PtysCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysGetInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysUpdateInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly title?: {
    readonly title?: string
    readonly size?: { readonly rows: number; readonly cols: number }
  }["title"]
  readonly size?: { readonly title?: string; readonly size?: { readonly rows: number; readonly cols: number } }["size"]
}

export type PtysUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysRemoveInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysRemoveOutput = void

export type QuestionsListRequestsInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type QuestionsListRequestsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly questions: ReadonlyArray<{
      readonly question: string
      readonly header: string
      readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
      readonly multiple?: boolean
      readonly custom?: boolean
    }>
    readonly tool?: { readonly messageID: string; readonly callID: string }
  }>
}

export type QuestionsListInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type QuestionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly questions: ReadonlyArray<{
      readonly question: string
      readonly header: string
      readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
      readonly multiple?: boolean
      readonly custom?: boolean
    }>
    readonly tool?: { readonly messageID: string; readonly callID: string }
  }>
}["data"]

export type QuestionsReplyInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
  readonly answers: { readonly answers: ReadonlyArray<ReadonlyArray<string>> }["answers"]
}

export type QuestionsReplyOutput = void

export type QuestionsRejectInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
}

export type QuestionsRejectOutput = void

export type ReferencesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ReferencesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly path: string
    readonly description?: string
    readonly hidden?: boolean
    readonly source:
      | { readonly type: "local"; readonly path: string; readonly description?: string; readonly hidden?: boolean }
      | {
          readonly type: "git"
          readonly repository: string
          readonly branch?: string
          readonly description?: string
          readonly hidden?: boolean
        }
  }>
}

export type ProjectCopiesCreateInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly strategy: { readonly strategy: string; readonly directory: string; readonly name?: string }["strategy"]
  readonly directory: { readonly strategy: string; readonly directory: string; readonly name?: string }["directory"]
  readonly name?: { readonly strategy: string; readonly directory: string; readonly name?: string }["name"]
}

export type ProjectCopiesCreateOutput = { readonly directory: string }

export type ProjectCopiesRemoveInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly directory: { readonly directory: string; readonly force: boolean }["directory"]
  readonly force: { readonly directory: string; readonly force: boolean }["force"]
}

export type ProjectCopiesRemoveOutput = void

export type ProjectCopiesRefreshInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProjectCopiesRefreshOutput = void
