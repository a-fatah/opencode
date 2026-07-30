import type { JSX } from "solid-js"
import jiraIcon from "@/assets/integrations/jira.png"

export function IssueSourceIcon(props: {
  integrationID: string
  sourceName: string
  class?: string
}): JSX.Element {
  const jira = () => props.integrationID.toLowerCase() === "jira"
  return (
    <span
      class={`flex shrink-0 items-center justify-center rounded-lg bg-v2-background-bg-surface ${props.class ?? "size-8"}`}
      title={props.sourceName}
      role="img"
      aria-label={props.sourceName}
    >
      {jira() ? (
        <img src={jiraIcon} alt="" class="size-4 object-contain" />
      ) : (
        <span aria-hidden="true" class="text-12-medium uppercase text-v2-text-text-muted">
          {props.sourceName.slice(0, 1)}
        </span>
      )}
    </span>
  )
}
