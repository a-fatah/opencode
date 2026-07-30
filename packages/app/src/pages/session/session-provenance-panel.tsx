import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { A } from "@solidjs/router"
import { createQuery, useMutation, useQueryClient } from "@tanstack/solid-query"
import { createMemo, For, onCleanup, Show } from "solid-js"
import type { ServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { usePlatform } from "@/context/platform"
import { serverHref } from "@/utils/session-route"
import { showToast } from "@/utils/toast"
import type { AppSessionProvenance } from "@/utils/session"
import {
  provenanceLastSync,
  provenanceLocation,
  provenanceQueryEnabled,
  provenanceWritebackEntry,
  type SessionProvenanceDetail,
} from "./session-provenance"

export function SessionProvenancePanel(props: {
  sessionID: string
  provenance?: AppSessionProvenance
  serverSDK: ServerSDK
}) {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const key = () => [props.serverSDK.scope, "session-provenance", props.sessionID] as const
  const detail = createQuery(() => ({
    queryKey: key(),
    enabled: provenanceQueryEnabled(props.provenance),
    queryFn: () => props.serverSDK.nextApi.issueWatchers.provenanceDetail({ sessionID: props.sessionID }),
    retry: false,
  }))
  const location = createMemo(() => (detail.data ? provenanceLocation(detail.data) : undefined))
  const watcherHref = createMemo(() => {
    const watcherID = detail.data?.watcher.id ?? props.provenance?.watcherID
    if (!watcherID) return
    return serverHref(ServerConnection.key(props.serverSDK.server), `watchers/${encodeURIComponent(watcherID)}`)
  })
  const sync = useMutation(() => ({
    mutationFn: () => props.serverSDK.nextApi.issueWatchers.syncProvenance({ sessionID: props.sessionID }),
    onSuccess: (next) => queryClient.setQueryData<SessionProvenanceDetail>(key(), next),
    onError: (error) =>
      showToast({
        variant: "error",
        title: "Issue sync failed",
        description: error instanceof Error ? error.message : String(error),
      }),
  }))
  const unsubscribe = props.serverSDK.event.listen(({ details }) => {
    const event = details as unknown as { type: string; properties?: { sessionID?: string } }
    if (event.type !== "issue_watcher.session.materialized" || event.properties?.sessionID !== props.sessionID) return
    void queryClient.invalidateQueries({ queryKey: key() })
  })
  onCleanup(unsubscribe)

  return (
    <Show when={props.provenance?.type === "issue" ? props.provenance : undefined}>
      {(provenance) => (
        <div data-component="session-provenance" class="mx-3 mt-3 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 sm:mx-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)] md:gap-4">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <span class="shrink-0 text-12-medium text-v2-text-text-strong">Issue</span>
                <button
                  type="button"
                  class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-12-medium text-v2-text-text-base hover:underline"
                  onClick={() => platform.openLink(provenance().externalUrl)}
                >
                  {detail.data?.issue.key ?? provenance().externalKey}: {detail.data?.issue.title ?? provenance().watcherName}
                </button>
                <Show when={detail.data?.issue.status}>
                  {(status) => <span class="shrink-0 text-11-regular text-v2-text-text-muted">{status()}</span>}
                </Show>
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-11-regular text-v2-text-text-muted">
                <span>{detail.data?.source.name ?? provenance().watcherName}</span>
                <Show when={detail.data?.watcher.name}><span>Watcher: {detail.data!.watcher.name}</span></Show>
                <Show when={location()?.branch}><span>Branch: {location()!.branch}</span></Show>
                <Show when={location()?.directory}><span class="max-w-80 truncate" title={location()!.directory}>Workspace: {location()!.directory}</span></Show>
                <Show when={location()?.workspaceID}><span>Workspace ID: {location()!.workspaceID}</span></Show>
              </div>
              <p class="mt-1 text-11-regular text-v2-text-text-muted">
                This session was created from {provenance().externalKey} by the {provenance().watcherName} watcher.
              </p>
              <Show when={detail.error}>
                <p class="mt-1 text-11-regular text-v2-text-text-danger">Issue details could not be loaded.</p>
              </Show>
            </div>
            <ButtonV2 variant="ghost" size="small" disabled={sync.isPending || detail.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? "Syncing..." : "Sync issue"}
            </ButtonV2>
          </div>
          <Show when={detail.data}>
            {(current) => (
              <aside aria-label="Issue context" class="mt-3 border-t border-v2-border-border-base pt-3 md:mt-0 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="text-11-medium uppercase tracking-[0.12em] text-v2-text-text-muted">Issue context</p>
                    <p class="mt-1 text-14-medium text-v2-text-text-strong">{current().issue.title}</p>
                  </div>
                  <Show when={watcherHref()}>
                    {(href) => <A href={href()} class="text-11-medium text-v2-text-text-base hover:underline">Edit watcher</A>}
                  </Show>
                </div>
                <div class="mt-3 grid gap-3 text-12-regular sm:grid-cols-2">
                  <IssueField label="Status"><span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5">{current().issue.status}</span></IssueField>
                  <IssueField label="Assignee">{current().issue.assignee?.name ?? "Unassigned"}</IssueField>
                  <IssueField label="Labels">
                    <Show when={current().issue.labels.length} fallback={<span>None</span>}>
                      <span class="flex flex-wrap gap-1"><For each={current().issue.labels}>{(label) => <span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5">{label}</span>}</For></span>
                    </Show>
                  </IssueField>
                  <IssueField label="Watcher">{current().watcher.name}</IssueField>
                  <IssueField label="Last sync">{formatSyncTime(provenanceLastSync(current()))}</IssueField>
                </div>
                <div class="mt-3">
                  <p class="text-11-medium text-v2-text-text-muted">Writeback checklist</p>
                  <Show when={current().writebacks.length} fallback={<p class="mt-1 text-12-regular text-v2-text-text-muted">No writeback</p>}>
                    <ul class="mt-1 flex flex-col gap-1.5">
                      <For each={current().writebacks}>
                        {(item) => {
                          const entry = provenanceWritebackEntry(item)
                          return (
                            <li class="flex items-start gap-2 text-12-regular text-v2-text-text-base">
                              <span aria-hidden="true" class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-v2-border-border-base text-10-medium">
                                {item.state === "applied" ? "x" : ""}
                              </span>
                              <span class="min-w-0 flex-1">{entry.label}</span>
                              <span class="shrink-0 text-v2-text-text-muted">{entry.status}</span>
                            </li>
                          )
                        }}
                      </For>
                    </ul>
                  </Show>
                </div>
                <Show when={current().issue.acceptanceCriteria}>
                  {(criteria) => <div class="mt-3"><p class="text-11-medium text-v2-text-text-muted">Acceptance criteria</p><p class="mt-1 whitespace-pre-wrap text-12-regular text-v2-text-text-base">{criteria()}</p></div>}
                </Show>
                <Show when={current().issue.description}>
                  {(description) => <details class="mt-3"><summary class="cursor-pointer text-11-medium text-v2-text-text-muted">Description</summary><p class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-12-regular text-v2-text-text-base">{description()}</p></details>}
                </Show>
              </aside>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}

function IssueField(props: { label: string; children: import("solid-js").JSX.Element }) {
  return <div class="min-w-0"><p class="text-11-medium text-v2-text-text-muted">{props.label}</p><div class="mt-1 text-v2-text-text-base">{props.children}</div></div>
}

function formatSyncTime(value: number | undefined) {
  if (!value) return "Never"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value)
}
