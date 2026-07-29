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

export function inboxQuery(filter: InboxFilter) {
  if (filter === "attention") return { attention: true as const }
  if (filter === "dismissed") return { state: "dismissed" as const }
  if (filter.startsWith("source:")) return { integrationID: filter.slice("source:".length) }
  return {}
}

export function inboxActions(state: "pending" | "skipped" | "dismissed" | "duplicate" | "unrouted") {
  if (state === "unrouted") return ["Pick project", "Skip"] as const
  if (state === "duplicate") return ["Open session", "Dismiss"] as const
  if (state === "pending") return ["Create & run", "Awaiting run", "Skip"] as const
  if (state === "skipped") return ["Create & run", "Skipped"] as const
  return ["Create & run", "Dismissed"] as const
}

export function inboxAttentionCount(summary: { readonly unrouted: number; readonly duplicate: number; readonly failedMaterializations: number }) {
  return summary.unrouted + summary.duplicate
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
