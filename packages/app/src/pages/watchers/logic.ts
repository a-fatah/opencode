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

export function canSave(draft: WatcherDraft) {
  return canPreview(draft) && !!draft.name.trim() && !!draft.action.promptTemplate.trim()
}
