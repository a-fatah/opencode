export type WatcherDraft = {
  name: string
  integrationID: string
  connectionID: string
  criteria: {
    issueProjects: string[]
    assignee?: "me" | { id: string }
    labels?: string[]
    statuses?: string[]
    watchUpdates: boolean
    escape?: { language: "jql" | "linear-filter" | "github-search"; query: string }
  }
  routing: {
    repoField?: { fieldName: string }
    mappings: { key: { type: "label" | "component" | "issueProject"; value: string }; projectID: string }[]
    fallback: "inbox"
    workspace: { type: "branch"; pattern: string } | { type: "current" } | { type: "worktree" }
  }
  action: {
    mode: "inbox" | "awaiting_run" | "run"
    promptTemplate: string
    writeback: { comment: boolean; transitionOnStart?: string; commentOnFailure: boolean }
  }
}

export const emptyWatcherDraft = (): WatcherDraft => ({
  name: "",
  integrationID: "",
  connectionID: "",
  criteria: {
    issueProjects: [],
    watchUpdates: false,
  },
  routing: {
    mappings: [],
    fallback: "inbox",
    workspace: { type: "branch", pattern: "issue/{{issue.key}}" },
  },
  action: {
    mode: "inbox",
    promptTemplate: "Resolve {{issue.key}}: {{issue.title}}",
    writeback: { comment: false, commentOnFailure: false },
  },
})

export function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item, index, values) => !!item && values.indexOf(item) === index)
}

export function withUnavailableOptions<T extends { readonly id: string; readonly name: string; readonly imageUrl?: string; readonly detail?: string }>(
  options: ReadonlyArray<T>,
  selected: ReadonlyArray<string>,
): ReadonlyArray<{ readonly id: string; readonly name: string; readonly imageUrl?: string; readonly detail?: string }> {
  const ids = new Set(options.map((option) => option.id))
  return [
    ...options,
    ...selected.filter((id, index) => !ids.has(id) && selected.indexOf(id) === index).map((id) => ({
      id,
      name: `Unavailable: ${id}`,
    })),
  ]
}

export const metadataPollDeadline = 120_000

export function metadataPollDelay(attempt: number) {
  return Math.min(1_000 * 2 ** Math.max(0, attempt), 10_000)
}

export function metadataPollNext(input: { pending: boolean; elapsed: number }) {
  if (!input.pending) return "complete" as const
  if (input.elapsed >= metadataPollDeadline) return "deadline" as const
  return "poll" as const
}

export function metadataSyncState(input: {
  readonly result?: { readonly syncing: boolean; readonly syncError?: string }
  readonly error?: string
  readonly resyncing: boolean
}) {
  return {
    refreshing: input.resyncing || !!input.result?.syncing,
    warning: input.result?.syncError || input.error,
  }
}

type ScopedMetadata = {
  readonly projects: ReadonlyArray<{ readonly key: string }>
  readonly users: ReadonlyArray<unknown>
  readonly labels: ReadonlyArray<string>
  readonly statuses: ReadonlyArray<unknown>
  readonly components: ReadonlyArray<unknown>
  readonly issueTypes: ReadonlyArray<unknown>
  readonly fields: ReadonlyArray<unknown>
}

export function retainGlobalMetadata<T extends ScopedMetadata>(metadata: T): T {
  return {
    ...metadata,
    users: [],
    statuses: [],
    components: [],
    issueTypes: [],
  }
}

export function composeMetadataScope<T extends ScopedMetadata>(previous: T | undefined, next: T, pending: boolean): T {
  if (!pending || !previous) return next
  const projectKeys = new Set(next.projects.map((item) => item.key))
  return {
    ...next,
    projects: [...next.projects, ...previous.projects.filter((item) => !projectKeys.has(item.key))],
    labels: [...new Set([...previous.labels, ...next.labels])],
    fields: mergeMetadataOptions(previous.fields, next.fields),
  }
}

function mergeMetadataOptions<T>(previous: ReadonlyArray<T>, next: ReadonlyArray<T>) {
  const ids = new Set(next.map(metadataOptionKey))
  return [...next, ...previous.filter((item) => !ids.has(metadataOptionKey(item)))]
}

function metadataOptionKey(value: unknown) {
  if (typeof value !== "object" || value === null) return value
  if ("id" in value) return value.id
  if ("name" in value) return value.name
  return value
}

export function criteriaSummary(criteria: {
  readonly issueProjects: readonly string[]
  readonly assignee?: "me" | { readonly id: string }
  readonly labels?: readonly string[]
  readonly statuses?: readonly string[]
}) {
  const parts = [
    criteria.issueProjects.length ? criteria.issueProjects.join(", ") : "All issue projects",
    criteria.assignee === "me" ? "assigned to me" : criteria.assignee ? `assignee ${criteria.assignee.id}` : undefined,
    criteria.labels?.length ? `${criteria.labels.length} label${criteria.labels.length === 1 ? "" : "s"}` : undefined,
    criteria.statuses?.length ? criteria.statuses.join(", ") : undefined,
  ].filter((part): part is string => !!part)
  return parts.join(" · ")
}

export function routingSummary(routing: {
  readonly mappings: readonly unknown[]
  readonly repoField?: { readonly fieldName: string }
}) {
  if (routing.mappings.length) return `${routing.mappings.length} mapping${routing.mappings.length === 1 ? "" : "s"}`
  if (routing.repoField) return `Repo field: ${routing.repoField.fieldName}`
  return "Inbox fallback"
}

export function routeRungs(routing: WatcherDraft["routing"]) {
  return [
    {
      title: "1. Repository field",
      detail: routing.repoField?.fieldName ?? "No repository field configured",
      active: !!routing.repoField,
    },
    {
      title: "2. Explicit mappings",
      detail: routing.mappings.length ? `${routing.mappings.length} configured` : "No mappings configured",
      active: routing.mappings.length > 0,
    },
    {
      title: "3. Inbox fallback",
      detail: "Unmatched issues go to Inbox",
      active: true,
    },
  ]
}

export function canPreview(draft: WatcherDraft) {
  return !!draft.integrationID && !!draft.connectionID
}

export function hasPreviewCriteria(draft: WatcherDraft) {
  return !!(
    draft.criteria.issueProjects.length ||
    draft.criteria.assignee ||
    draft.criteria.labels?.length ||
    draft.criteria.statuses?.length ||
    draft.criteria.escape?.query.trim()
  )
}

export function canSave(draft: WatcherDraft) {
  return canPreview(draft) && !!draft.name.trim() && !!draft.action.promptTemplate.trim()
}

export type InboxFilter = "all" | "attention" | "dismissed" | `source:${string}`
export type InboxState = "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted"
export type InboxBulkAction = "approve" | "skip" | "dismiss"

export function inboxQuery(filter: InboxFilter) {
  if (filter === "attention") return { filter: "attention" as const }
  if (filter === "dismissed") return { state: "dismissed" as const }
  if (filter.startsWith("source:")) return { integrationID: filter.slice("source:".length) }
  return {}
}

export function inboxActions(state: InboxState) {
  if (state === "unrouted") return ["Pick project", "Skip"] as const
  if (state === "duplicate") return ["Open session", "Dismiss"] as const
  if (state === "pending") return ["Create & run", "Awaiting run", "Skip", "Dismiss"] as const
  return [] as const
}

export function inboxAttentionCount(summary: { readonly unrouted: number; readonly duplicate: number; readonly failedMaterializations: number }) {
  return summary.unrouted + summary.duplicate + summary.failedMaterializations
}

export function selectableInboxItem(state: InboxState) {
  return state === "pending" || state === "unrouted" || state === "duplicate"
}

export function inboxBulkActionSupports(action: InboxBulkAction, state: InboxState) {
  if (action === "approve") return state === "pending"
  if (action === "skip") return state === "pending" || state === "unrouted"
  return state === "pending" || state === "duplicate"
}

export function authExpiredMessage(source: string, watcher: string) {
  return `${source} authentication expired. ${watcher} is paused. Its cursor was not advanced, and polling resumes from that cursor after reconnect.`
}

export function watcherAuthExpired(watcher: {
  readonly watcher: { readonly enabled: boolean; readonly lastError?: string }
  readonly lastRun?: { readonly outcome: string }
  readonly connection?: { readonly verification: { readonly status: string } }
}) {
  if (watcher.connection?.verification.status === "needs_auth") return true
  if (watcher.lastRun?.outcome === "auth_failed") return true
  return !watcher.watcher.enabled && !!watcher.watcher.lastError && /auth/i.test(watcher.watcher.lastError)
}

export function outcomeLabel(outcome: "ok" | "throttled" | "auth_failed" | "error") {
  if (outcome === "ok") return "Completed"
  if (outcome === "throttled") return "Too many matches"
  if (outcome === "auth_failed") return "Authentication expired"
  return "Failed"
}
