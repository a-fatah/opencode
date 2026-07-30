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
    refetchInterval: (query) => query.state.data?.writebacks.some((item) => item.state === "pending" || item.state === "applying")
      ? 1_000
      : false,
  }))
  const location = createMemo(() => (detail.data ? provenanceLocation(detail.data) : undefined))
  const provenance = createMemo(() => props.provenance?.type === "issue" ? props.provenance : undefined)
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
  const failureComment = useMutation(() => ({
    mutationFn: () => props.serverSDK.nextApi.issueWatchers.failureComment({ sessionID: props.sessionID }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key() }),
    onError: (error) =>
      showToast({
        variant: "error",
        title: "Failure comment could not be queued",
        description: error instanceof Error ? error.message : String(error),
      }),
  }))
  const retryRun = useMutation(() => ({
    mutationFn: () => props.serverSDK.nextApi.sessions.prompt({
      sessionID: props.sessionID,
      id: `msg_retry_${detail.data?.latestExecution?.id}`,
      prompt: { text: "Retry this issue task after reviewing the previous failure." },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key() }),
    onError: (error) =>
      showToast({
        variant: "error",
        title: "Run retry failed",
        description: error instanceof Error ? error.message : String(error),
      }),
  }))
  const unsubscribe = props.serverSDK.event.listen(({ details }) => {
    const event = details.current
      ? { type: details.current.type, data: "data" in details.current ? details.current.data : undefined }
      : { type: details.type, data: details.properties as { sessionID?: string } }
    if (![
      "issue_watcher.session.materialized",
      "session.execution.started",
      "session.execution.completed",
      "session.execution.failed",
      "session.execution.interrupted",
      "session.execution.superseded",
    ].includes(event.type) || !(event.data && "sessionID" in event.data) || event.data.sessionID !== props.sessionID) return
    void queryClient.invalidateQueries({ queryKey: key() })
  })
  onCleanup(unsubscribe)

  return (
    <Show when={provenance()}>
        <div data-component="session-provenance" class="mx-3 mt-3 rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-3 py-2 sm:mx-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)] md:gap-4">
          <div class="flex min-w-0 items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex min-w-0 items-center gap-2">
                <span class="shrink-0 text-12-medium text-v2-text-text-strong">Issue</span>
                <button
                  type="button"
                  class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-12-medium text-v2-text-text-base hover:underline"
                  onClick={() => platform.openLink(provenance()!.externalUrl)}
                >
                  {detail.data?.issue.key ?? provenance()!.externalKey}: {detail.data?.issue.title ?? provenance()!.watcherName}
                </button>
                <Show when={detail.data?.issue.status}>
                  <span class="shrink-0 text-11-regular text-v2-text-text-muted">{detail.data?.issue.status}</span>
                </Show>
              </div>
              <div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-11-regular text-v2-text-text-muted">
                <span>{detail.data?.source.name ?? provenance()!.watcherName}</span>
                <Show when={detail.data?.watcher.name}><span>Watcher: {detail.data!.watcher.name}</span></Show>
                <Show when={location()?.branch}><span>Branch: {location()!.branch}</span></Show>
                <Show when={location()?.directory}><span class="max-w-80 truncate" title={location()!.directory}>Workspace: {location()!.directory}</span></Show>
                <Show when={location()?.workspaceID}><span>Workspace ID: {location()!.workspaceID}</span></Show>
              </div>
              <p class="mt-1 text-11-regular text-v2-text-text-muted">
                This session was created from {provenance()!.externalKey} by the {provenance()!.watcherName} watcher.
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
              <aside aria-label="Issue context" class="mt-3 border-t border-v2-border-border-base pt-3 md:mt-0 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="text-11-medium uppercase tracking-[0.12em] text-v2-text-text-muted">Issue context</p>
                    <p class="mt-1 text-14-medium text-v2-text-text-strong">{detail.data!.issue.title}</p>
                  </div>
                  <Show when={watcherHref()}>
                    <A href={watcherHref()!} class="text-11-medium text-v2-text-text-base hover:underline">Edit watcher</A>
                  </Show>
                </div>
                <div class="mt-3 grid gap-3 text-12-regular sm:grid-cols-2">
                  <IssueField label="Status"><span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5">{detail.data!.issue.status}</span></IssueField>
                  <IssueField label="Assignee">{detail.data!.issue.assignee?.name ?? "Unassigned"}</IssueField>
                  <IssueField label="Labels">
                    <Show when={detail.data!.issue.labels.length} fallback={<span>None</span>}>
                      <span class="flex flex-wrap gap-1"><For each={detail.data!.issue.labels}>{(label) => <span class="rounded-full bg-v2-background-bg-surface px-2 py-0.5">{label}</span>}</For></span>
                    </Show>
                  </IssueField>
                  <IssueField label="Watcher">{detail.data!.watcher.name}</IssueField>
                  <IssueField label="Last sync">{formatSyncTime(provenanceLastSync(detail.data!))}</IssueField>
                </div>
                <div class="mt-3">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-11-medium text-v2-text-text-muted">Writeback checklist</p>
                    <Show when={detail.data!.latestExecution?.status === "failed"}>
                      <div class="flex items-center gap-1">
                        <ButtonV2 variant="ghost" size="small" disabled={retryRun.isPending} onClick={() => retryRun.mutate()}>
                          {retryRun.isPending ? "Retrying..." : "Retry run"}
                        </ButtonV2>
                        <ButtonV2
                          variant="ghost"
                          size="small"
                          disabled={failureComment.isPending || detail.data!.writebacks.some((item) =>
                            item.kind === "comment_failed" && item.triggerID === detail.data!.latestExecution?.id && item.state !== "failed"
                          )}
                          onClick={() => failureComment.mutate()}
                        >
                          {failureComment.isPending ? "Queueing..." : "Post failure comment"}
                        </ButtonV2>
                      </div>
                    </Show>
                  </div>
                  <Show when={detail.data!.latestExecution?.status === "failed"}>
                    <div class="mt-2 rounded-md border border-v2-border-border-base bg-v2-background-bg-surface p-2">
                      <p class="text-12-medium text-v2-text-text-strong">Run failed</p>
                      <p class="mt-1 text-11-regular text-v2-text-text-muted">
                        {detail.data!.latestExecution?.failure?.message ?? "See the session transcript for failure details."} Provider execution is never retried automatically.
                      </p>
                    </div>
                  </Show>
                  <Show when={detail.data!.provenance.writeback.comment && !detail.data!.writebacks.some((item) => item.kind === "comment_created")}>
                    <p class="mt-1 text-12-regular text-v2-text-text-muted">Start comment: Not triggered</p>
                  </Show>
                  <Show when={detail.data!.provenance.writeback.transitionOnStart && !detail.data!.writebacks.some((item) => item.kind === "transition_started")}>
                    <p class="mt-1 text-12-regular text-v2-text-text-muted">Start transition: Not triggered</p>
                  </Show>
                  <Show when={detail.data!.provenance.writeback.commentOnFailure && !detail.data!.writebacks.some((item) => item.kind === "comment_failed")}>
                    <p class="mt-1 text-12-regular text-v2-text-text-muted">Failure comment: Not requested</p>
                  </Show>
                  <Show when={detail.data!.writebacks.length} fallback={<p class="mt-1 text-12-regular text-v2-text-text-muted">No writeback</p>}>
                    <ul class="mt-1 flex flex-col gap-1.5">
                      <For each={detail.data!.writebacks}>
                        {(item) => {
                          const entry = provenanceWritebackEntry(item)
                          return (
                            <li class="flex items-start gap-2 text-12-regular text-v2-text-text-base">
                              <span aria-hidden="true" class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-v2-border-border-base text-10-medium">
                                {item.state === "applied" ? "x" : ""}
                              </span>
                               <span class="min-w-0 flex-1">
                                 <span>{entry.label}</span>
                                 <Show when={item.error}><span class="mt-0.5 block text-11-regular text-v2-text-text-danger">{item.error}</span></Show>
                               </span>
                               <span class="shrink-0 text-v2-text-text-muted">{entry.status}</span>
                            </li>
                          )
                        }}
                      </For>
                    </ul>
                  </Show>
                </div>
                <Show when={detail.data!.issue.acceptanceCriteria}>
                  <div class="mt-3"><p class="text-11-medium text-v2-text-text-muted">Acceptance criteria</p><p class="mt-1 whitespace-pre-wrap text-12-regular text-v2-text-text-base">{detail.data!.issue.acceptanceCriteria}</p></div>
                </Show>
                <Show when={detail.data!.issue.description}>
                  <details class="mt-3"><summary class="cursor-pointer text-11-medium text-v2-text-text-muted">Description</summary><p class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-12-regular text-v2-text-text-base">{detail.data!.issue.description}</p></details>
                </Show>
              </aside>
          </Show>
        </div>
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
