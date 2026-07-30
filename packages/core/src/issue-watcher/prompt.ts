import { Issue } from "@opencode-ai/schema/issue"
import { IssueWatcher } from "@opencode-ai/schema/issue-watcher"

export function renderPrompt(
  issue: Issue.Info,
  project: IssueWatcher.ProjectRoutingSnapshot | undefined,
  template: string,
) {
  const values = {
    "issue.id": issue.id,
    "issue.key": issue.key,
    "issue.title": issue.title,
    "issue.description": issue.description,
    "issue.url": issue.url,
    "issue.status": issue.status,
    "issue.assignee": issue.assignee?.name ?? "",
    "issue.labels": issue.labels.join(", "),
    "issue.issueProject": issue.issueProject,
    "issue.component": issue.component ?? "",
    "issue.acceptanceCriteria": issue.acceptanceCriteria ?? "",
    "issue.repoField": issue.repoField ?? "",
    "project.id": project?.projectID ?? "",
    "project.name": project?.name ?? "",
    "project.directory": project?.directories[0] ?? "",
  }
  return template.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (token, key: keyof typeof values) => values[key] ?? token)
}
